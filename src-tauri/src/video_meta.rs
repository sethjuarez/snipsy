//! Minimal ISO base media (MP4/MOV) reader used to detect a video's frame rate
//! without depending on external tools such as ffprobe.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Upper bound for the `moov` box we are willing to load into memory.
const MAX_MOOV_SIZE: u64 = 64 * 1024 * 1024;

/// Read the average frame rate of the first video track in an MP4/MOV file.
pub fn read_video_fps(path: &Path) -> Result<f64, String> {
    let mut file =
        File::open(path).map_err(|e| format!("Failed to open video {}: {e}", path.display()))?;
    let moov = read_moov(&mut file)?;
    fps_from_moov(&moov)
}

fn read_moov<R: Read + Seek>(reader: &mut R) -> Result<Vec<u8>, String> {
    let file_len = reader
        .seek(SeekFrom::End(0))
        .map_err(|e| format!("Failed to read video: {e}"))?;
    let invalid = || "Video file has an invalid box layout".to_string();
    let mut offset = 0u64;
    while offset.checked_add(8).is_some_and(|end| end <= file_len) {
        reader
            .seek(SeekFrom::Start(offset))
            .map_err(|e| format!("Failed to read video: {e}"))?;
        let mut header = [0u8; 8];
        reader
            .read_exact(&mut header)
            .map_err(|e| format!("Failed to read video: {e}"))?;
        let mut size = u32::from_be_bytes(header[0..4].try_into().unwrap()) as u64;
        let kind = &header[4..8];
        let mut header_len = 8u64;
        if size == 1 {
            let mut large = [0u8; 8];
            reader
                .read_exact(&mut large)
                .map_err(|e| format!("Failed to read video: {e}"))?;
            size = u64::from_be_bytes(large);
            header_len = 16;
        } else if size == 0 {
            size = file_len - offset;
        }
        let end = offset
            .checked_add(size)
            .filter(|end| size >= header_len && *end <= file_len)
            .ok_or_else(invalid)?;
        if kind == b"moov" {
            let body_len = size - header_len;
            if body_len > MAX_MOOV_SIZE {
                return Err("Video metadata is too large to read".into());
            }
            let mut body = vec![0u8; body_len as usize];
            reader
                .read_exact(&mut body)
                .map_err(|e| format!("Failed to read video metadata: {e}"))?;
            return Ok(body);
        }
        offset = end;
    }
    Err("Unsupported video format: no MP4/MOV metadata found".into())
}

/// Iterate over the child boxes contained in `data`, yielding `(type, body)`.
fn boxes(data: &[u8]) -> impl Iterator<Item = (&[u8], &[u8])> {
    let mut offset = 0usize;
    std::iter::from_fn(move || {
        if offset + 8 > data.len() {
            return None;
        }
        let mut size = u32::from_be_bytes(data[offset..offset + 4].try_into().ok()?) as usize;
        let kind = &data[offset + 4..offset + 8];
        let mut header_len = 8usize;
        if size == 1 {
            if offset + 16 > data.len() {
                return None;
            }
            size = usize::try_from(u64::from_be_bytes(
                data[offset + 8..offset + 16].try_into().ok()?,
            ))
            .ok()?;
            header_len = 16;
        } else if size == 0 {
            size = data.len() - offset;
        }
        if size < header_len || offset.checked_add(size)? > data.len() {
            return None;
        }
        let body = &data[offset + header_len..offset + size];
        offset += size;
        Some((kind, body))
    })
}

fn child<'a>(data: &'a [u8], kind: &[u8; 4]) -> Option<&'a [u8]> {
    boxes(data).find(|(k, _)| *k == kind).map(|(_, body)| body)
}

fn be_u32(data: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(data.get(at..at + 4)?.try_into().ok()?))
}

fn timescale(mdhd: &[u8]) -> Option<u32> {
    match mdhd.first()? {
        1 => be_u32(mdhd, 20),
        _ => be_u32(mdhd, 12),
    }
}

/// Sum `(sample_count, total_duration)` across all `stts` entries.
fn stts_totals(stts: &[u8]) -> Option<(u64, u64)> {
    let entries = be_u32(stts, 4)? as usize;
    // The entry table must exactly fill the box; reject inflated counts.
    if stts.len().checked_sub(8)? != entries.checked_mul(8)? {
        return None;
    }
    let mut samples = 0u64;
    let mut duration = 0u64;
    for entry in stts[8..].as_chunks::<8>().0 {
        let count = be_u32(entry, 0)? as u64;
        let delta = be_u32(entry, 4)? as u64;
        samples = samples.checked_add(count)?;
        duration = duration.checked_add(count * delta)?;
    }
    Some((samples, duration))
}

fn fps_from_moov(moov: &[u8]) -> Result<f64, String> {
    for (kind, trak) in boxes(moov) {
        if kind != b"trak" {
            continue;
        }
        let Some(mdia) = child(trak, b"mdia") else {
            continue;
        };
        let is_video = child(mdia, b"hdlr")
            .and_then(|hdlr| hdlr.get(8..12))
            .is_some_and(|handler| handler == b"vide");
        if !is_video {
            continue;
        }
        let scale = child(mdia, b"mdhd")
            .and_then(timescale)
            .filter(|scale| *scale > 0)
            .ok_or("Video track is missing its timescale")?;

        let totals = child(mdia, b"minf")
            .and_then(|minf| child(minf, b"stbl"))
            .and_then(|stbl| child(stbl, b"stts"))
            .and_then(stts_totals);
        // Fragmented files keep timing in moof boxes, which we don't parse; callers fall back.
        return match totals {
            Some((samples, duration)) if samples > 0 && duration > 0 => {
                Ok(samples as f64 * scale as f64 / duration as f64)
            }
            _ => Err("Video track has no frame timing information".into()),
        };
    }
    Err("No video track found".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn mp4_box(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut out = ((body.len() + 8) as u32).to_be_bytes().to_vec();
        out.extend_from_slice(kind);
        out.extend_from_slice(body);
        out
    }

    fn full_box(kind: &[u8; 4], version: u8, body: &[u8]) -> Vec<u8> {
        let mut payload = vec![version, 0, 0, 0];
        payload.extend_from_slice(body);
        mp4_box(kind, &payload)
    }

    fn hdlr(handler: &[u8; 4]) -> Vec<u8> {
        let mut body = vec![0u8; 4];
        body.extend_from_slice(handler);
        body.extend_from_slice(&[0u8; 13]);
        full_box(b"hdlr", 0, &body)
    }

    fn mdhd_v0(timescale: u32) -> Vec<u8> {
        let mut body = vec![0u8; 8];
        body.extend_from_slice(&timescale.to_be_bytes());
        body.extend_from_slice(&[0u8; 8]);
        full_box(b"mdhd", 0, &body)
    }

    fn mdhd_v1(timescale: u32) -> Vec<u8> {
        let mut body = vec![0u8; 16];
        body.extend_from_slice(&timescale.to_be_bytes());
        body.extend_from_slice(&[0u8; 12]);
        full_box(b"mdhd", 1, &body)
    }

    fn stts(entries: &[(u32, u32)]) -> Vec<u8> {
        let mut body = (entries.len() as u32).to_be_bytes().to_vec();
        for (count, delta) in entries {
            body.extend_from_slice(&count.to_be_bytes());
            body.extend_from_slice(&delta.to_be_bytes());
        }
        full_box(b"stts", 0, &body)
    }

    fn tkhd(track: u32) -> Vec<u8> {
        let mut body = vec![0u8; 8];
        body.extend_from_slice(&track.to_be_bytes());
        body.extend_from_slice(&[0u8; 68]);
        full_box(b"tkhd", 0, &body)
    }

    fn trak(track: u32, handler: &[u8; 4], mdhd: Vec<u8>, stts: Vec<u8>) -> Vec<u8> {
        let stbl = mp4_box(b"stbl", &stts);
        let minf = mp4_box(b"minf", &stbl);
        let mdia = mp4_box(b"mdia", &[mdhd, hdlr(handler), minf].concat());
        mp4_box(b"trak", &[tkhd(track), mdia].concat())
    }

    fn file(moov_children: Vec<u8>) -> Vec<u8> {
        let ftyp = mp4_box(b"ftyp", b"isom\0\0\0\0isom");
        let mdat = mp4_box(b"mdat", &[0u8; 32]);
        [ftyp, mdat, mp4_box(b"moov", &moov_children)].concat()
    }

    fn fps_of(bytes: Vec<u8>) -> Result<f64, String> {
        let moov = read_moov(&mut Cursor::new(bytes))?;
        fps_from_moov(&moov)
    }

    #[test]
    fn reads_30_fps() {
        let bytes = file(trak(1, b"vide", mdhd_v0(15360), stts(&[(300, 512)])));
        assert!((fps_of(bytes).unwrap() - 30.0).abs() < 1e-9);
    }

    #[test]
    fn reads_60_fps_with_v1_mdhd() {
        let bytes = file(trak(1, b"vide", mdhd_v1(60000), stts(&[(600, 1000)])));
        assert!((fps_of(bytes).unwrap() - 60.0).abs() < 1e-9);
    }

    #[test]
    fn reads_ntsc_29_97_fps() {
        let bytes = file(trak(1, b"vide", mdhd_v0(30000), stts(&[(900, 1001)])));
        assert!((fps_of(bytes).unwrap() - 29.97).abs() < 0.001);
    }

    #[test]
    fn averages_variable_frame_rate() {
        let bytes = file(trak(1, b"vide", mdhd_v0(1000), stts(&[(10, 40), (10, 60)])));
        assert!((fps_of(bytes).unwrap() - 20.0).abs() < 1e-9);
    }

    #[test]
    fn skips_audio_tracks() {
        let audio = trak(1, b"soun", mdhd_v0(48000), stts(&[(100, 1024)]));
        let video = trak(2, b"vide", mdhd_v0(25), stts(&[(250, 1)]));
        let bytes = file([audio, video].concat());
        assert!((fps_of(bytes).unwrap() - 25.0).abs() < 1e-9);
    }

    #[test]
    fn errors_for_fragmented_files_without_sample_timing() {
        let bytes = file(trak(7, b"vide", mdhd_v0(90000), stts(&[])));
        assert_eq!(fps_of(bytes).unwrap_err(), "Video track has no frame timing information");
    }

    #[test]
    fn rejects_stts_with_inflated_entry_count() {
        let mut bad = stts(&[(30, 1)]);
        bad[12..16].copy_from_slice(&u32::MAX.to_be_bytes());
        let bytes = file(trak(1, b"vide", mdhd_v0(30), bad));
        assert!(fps_of(bytes).is_err());
    }

    #[test]
    fn rejects_overflowing_stts_totals() {
        let entries = vec![(u32::MAX, u32::MAX); 3];
        let bytes = file(trak(1, b"vide", mdhd_v0(30), stts(&entries)));
        assert!(fps_of(bytes).is_err());
    }

    #[test]
    fn rejects_overflowing_64_bit_box_size() {
        let mut bytes = 1u32.to_be_bytes().to_vec();
        bytes.extend_from_slice(b"mdat");
        bytes.extend_from_slice(&u64::MAX.to_be_bytes());
        bytes.extend_from_slice(&[0u8; 16]);
        assert_eq!(fps_of(bytes).unwrap_err(), "Video file has an invalid box layout");
    }

    #[test]
    fn handles_64_bit_box_sizes() {
        let mdat_body = [0u8; 16];
        let mut mdat = 1u32.to_be_bytes().to_vec();
        mdat.extend_from_slice(b"mdat");
        mdat.extend_from_slice(&((16 + mdat_body.len()) as u64).to_be_bytes());
        mdat.extend_from_slice(&mdat_body);
        let moov = mp4_box(b"moov", &trak(1, b"vide", mdhd_v0(24), stts(&[(48, 1)])));
        let bytes = [mdat, moov].concat();
        assert!((fps_of(bytes).unwrap() - 24.0).abs() < 1e-9);
    }

    #[test]
    fn errors_without_video_track() {
        let bytes = file(trak(1, b"soun", mdhd_v0(48000), stts(&[(100, 1024)])));
        assert_eq!(fps_of(bytes).unwrap_err(), "No video track found");
    }

    #[test]
    fn errors_for_non_mp4_files() {
        let err = fps_of(b"\x1aE\xdf\xa3 not an mp4 file".to_vec()).unwrap_err();
        assert!(err.contains("invalid box layout") || err.contains("Unsupported"));
    }

    #[test]
    fn reads_from_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("clip.mp4");
        std::fs::write(&path, file(trak(1, b"vide", mdhd_v0(30), stts(&[(30, 1)])))).unwrap();
        assert!((read_video_fps(&path).unwrap() - 30.0).abs() < 1e-9);
    }

    #[test]
    fn reads_real_fixture_video() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/videos/smoke-1080p.mp4");
        let fps = read_video_fps(&path).unwrap();
        assert!((1.0..=240.0).contains(&fps), "unexpected fps {fps}");
    }
}
