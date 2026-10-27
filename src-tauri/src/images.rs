//! Images stored in a project's `images/` folder.
//!
//! Text snippets reference them as `{{image:<key>}}`. Keeping the files inside
//! the project means they travel with exports, like imported videos.

use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Cursor, Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use image::error::LimitErrorKind;
use image::{ImageDecoder, ImageError, ImageFormat, ImageReader, Limits};
use tauri_plugin_auditaur::IpcTraceContext;

pub const IMAGES_DIR: &str = "images";
/// Largest image file accepted on import.
const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;
/// Largest width or height accepted.
const MAX_IMAGE_SIDE: u32 = 16_384;
/// Most pixels accepted; an 8K screenshot has about 33 million.
const MAX_IMAGE_PIXELS: u64 = 40_000_000;
/// Largest decoded pixel buffer.
const MAX_DECODED_BYTES: u64 = 256 * 1024 * 1024;
/// Allocation budget for reading an image's header.
const MAX_HEADER_BYTES: u64 = 16 * 1024 * 1024;
const MAX_KEY_LEN: usize = 128;
const MAX_SLUG_LEN: usize = 48;
const MAX_NAME_ATTEMPTS: u32 = 1_000;
const FALLBACK_SLUG: &str = "image";
const UNSUPPORTED_FORMAT: &str = "Only PNG and JPEG images are supported.";
const NOT_A_PROJECT: &str = "This folder is not a Snipsy project (project.json is missing).";
const NOT_A_FOLDER: &str = "The images folder must be a regular folder inside the project.";

/// Serializes imports, listings, and deletes so each sees only whole files.
/// Imports decode under it too, so at most one image is decoded at a time.
static STORE_LOCK: Mutex<()> = Mutex::new(());

/// An image in the project's `images/` folder.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectImage {
    /// File name inside `images/`, used in `{{image:<key>}}` references.
    pub key: String,
    pub absolute_path: String,
    pub width: u32,
    pub height: u32,
    pub bytes: u64,
}

/// Copy an image file into the project, reusing an identical image if present.
#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub async fn import_image(
    project_path: String,
    source_file_path: String,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<ProjectImage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        import_image_file(Path::new(&project_path), Path::new(&source_file_path))
    })
    .await
    .map_err(|e| format!("Image import failed: {e}"))?
}

/// Store image bytes sent by the UI, such as a pasted screenshot.
#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(data_base64))]
pub async fn import_image_data(
    project_path: String,
    name: String,
    data_base64: String,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<ProjectImage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = decode_image_data(&data_base64)?;
        import_image_bytes(Path::new(&project_path), &name, &bytes)
    })
    .await
    .map_err(|e| format!("Image import failed: {e}"))?
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub async fn list_project_images(
    project_path: String,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<Vec<ProjectImage>, String> {
    tauri::async_runtime::spawn_blocking(move || list_images(Path::new(&project_path)))
        .await
        .map_err(|e| format!("Listing images failed: {e}"))?
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub async fn delete_project_image(
    project_path: String,
    key: String,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || delete_image(Path::new(&project_path), &key))
        .await
        .map_err(|e| format!("Deleting image failed: {e}"))?
}

/// Whether `key` is a valid image file name: `[a-z0-9][a-z0-9-]*` followed by
/// `.png`, `.jpg`, or `.jpeg`, and not a reserved Windows device name.
pub fn is_image_key(key: &str) -> bool {
    if key.len() > MAX_KEY_LEN {
        return false;
    }
    let Some((stem, extension)) = key.rsplit_once('.') else {
        return false;
    };
    matches!(extension, "png" | "jpg" | "jpeg")
        && stem
            .bytes()
            .next()
            .is_some_and(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        && stem
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !is_reserved_windows_name(stem)
}

/// Path of the stored image named exactly `key`. Only regular files in the
/// project's own `images/` folder resolve, compared by exact name even on
/// case-insensitive file systems, so a reference behaves the same on every OS.
pub fn resolve_image(project_dir: &Path, key: &str) -> Result<PathBuf, String> {
    if !is_image_key(key) {
        return Err(format!("Invalid image reference: {key}"));
    }
    require_project(project_dir)?;
    let not_found = || format!("Image not found: {key}");
    let images_dir = real_images_dir(project_dir)?.ok_or_else(not_found)?;
    for entry in fs::read_dir(&images_dir).map_err(read_dir_failed)? {
        let entry = entry.map_err(read_dir_failed)?;
        if image_key_of(&entry).as_deref() == Some(key) {
            return Ok(entry.path());
        }
    }
    Err(not_found())
}

fn store_lock() -> MutexGuard<'static, ()> {
    STORE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn require_project(project_dir: &Path) -> Result<(), String> {
    if project_dir.join("project.json").is_file() {
        Ok(())
    } else {
        Err(NOT_A_PROJECT.into())
    }
}

fn read_dir_failed(error: io::Error) -> String {
    format!("Failed to read images folder: {error}")
}

/// The project's `images/` folder, or `None` before the first import. Links,
/// including Windows junctions, are refused so images stay inside the project.
fn real_images_dir(project_dir: &Path) -> Result<Option<PathBuf>, String> {
    let dir = project_dir.join(IMAGES_DIR);
    match fs::symlink_metadata(&dir) {
        Ok(meta) if meta.is_dir() => Ok(Some(dir)),
        Ok(_) => Err(NOT_A_FOLDER.into()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(read_dir_failed(e)),
    }
}

fn ensure_images_dir(project_dir: &Path) -> Result<PathBuf, String> {
    if real_images_dir(project_dir)?.is_none() {
        if let Err(e) = fs::create_dir(project_dir.join(IMAGES_DIR)) {
            if e.kind() != io::ErrorKind::AlreadyExists {
                return Err(format!("Failed to create images folder: {e}"));
            }
        }
    }
    real_images_dir(project_dir)?.ok_or_else(|| NOT_A_FOLDER.into())
}

/// Windows device names that cannot be file names, even with an extension.
fn is_reserved_windows_name(stem: &str) -> bool {
    matches!(stem, "con" | "prn" | "aux" | "nul")
        || (stem.len() == 4
            && (stem.starts_with("com") || stem.starts_with("lpt"))
            && stem.as_bytes()[3].is_ascii_digit())
}

/// Portable file-name stem for an imported image, e.g.
/// `"Screenshot 10.30.12.png"` becomes `"screenshot-10-30-12"`.
fn slugify(name_hint: &str) -> String {
    let file_name = name_hint.rsplit(['/', '\\']).next().unwrap_or_default();
    let stem = match file_name.rsplit_once('.') {
        Some((stem, extension))
            if ["png", "jpg", "jpeg"]
                .iter()
                .any(|known| extension.eq_ignore_ascii_case(known)) =>
        {
            stem
        }
        _ => file_name,
    };
    let mut slug = String::new();
    for ch in stem.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
        if slug.len() >= MAX_SLUG_LEN {
            break;
        }
    }
    let slug = slug.trim_end_matches('-');
    if slug.is_empty() {
        FALLBACK_SLUG.to_string()
    } else if is_reserved_windows_name(slug) {
        format!("{slug}-{FALLBACK_SLUG}")
    } else {
        slug.to_string()
    }
}

fn too_large() -> String {
    format!(
        "Images must be {} MB or smaller.",
        MAX_IMAGE_BYTES / (1024 * 1024)
    )
}

fn detect_format(bytes: &[u8]) -> Result<(ImageFormat, &'static str), String> {
    match image::guess_format(bytes) {
        Ok(ImageFormat::Png) => Ok((ImageFormat::Png, "png")),
        Ok(ImageFormat::Jpeg) => Ok((ImageFormat::Jpeg, "jpg")),
        _ => Err(UNSUPPORTED_FORMAT.into()),
    }
}

/// The format a key's extension promises.
fn format_of_key(key: &str) -> Option<ImageFormat> {
    match key.rsplit_once('.')?.1 {
        "png" => Some(ImageFormat::Png),
        "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
        _ => None,
    }
}

fn limits(max_alloc: u64) -> Limits {
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_SIDE);
    limits.max_image_height = Some(MAX_IMAGE_SIDE);
    limits.max_alloc = Some(max_alloc);
    limits
}

fn too_many_pixels() -> String {
    format!(
        "This image is too large. Use one up to {MAX_IMAGE_SIDE} pixels per side and {} megapixels.",
        MAX_IMAGE_PIXELS / 1_000_000
    )
}

fn too_much_memory() -> String {
    "This image needs too much memory to load. Use a smaller image.".into()
}

fn read_error(error: ImageError) -> String {
    match error {
        ImageError::Limits(limit) => match limit.kind() {
            LimitErrorKind::DimensionError => too_many_pixels(),
            LimitErrorKind::InsufficientMemory => too_much_memory(),
            _ => format!("This image could not be read: {limit}"),
        },
        other => format!("This image could not be read: {other}"),
    }
}

/// Reads only the header and checks the size limits; returns the dimensions.
fn probe_image<R: BufRead + Seek>(mut reader: ImageReader<R>) -> Result<(u32, u32), String> {
    reader.limits(limits(MAX_HEADER_BYTES));
    let decoder = reader.into_decoder().map_err(read_error)?;
    let (width, height) = decoder.dimensions();
    if u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
        return Err(too_many_pixels());
    }
    if decoder.total_bytes() > MAX_DECODED_BYTES {
        return Err(too_much_memory());
    }
    Ok((width, height))
}

/// Checks the size limits, then decodes the whole image to prove it is intact.
fn validate_image(bytes: &[u8], format: ImageFormat) -> Result<(u32, u32), String> {
    let dimensions = probe_image(ImageReader::with_format(Cursor::new(bytes), format))?;
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits(MAX_DECODED_BYTES));
    reader.decode().map_err(read_error)?;
    Ok(dimensions)
}

/// Decodes base64 image data, refusing oversized payloads before decoding.
fn decode_image_data(data_base64: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    let max_encoded_len = (MAX_IMAGE_BYTES as usize).div_ceil(3) * 4;
    if data_base64.len() > max_encoded_len {
        return Err(too_large());
    }
    base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|e| format!("Invalid image data: {e}"))
}

fn import_image_file(project_dir: &Path, source: &Path) -> Result<ProjectImage, String> {
    let file =
        File::open(source).map_err(|e| format!("Could not open {}: {e}", source.display()))?;
    let mut bytes = Vec::new();
    // Read one byte past the cap so oversized files are rejected without loading them.
    file.take(MAX_IMAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Could not read {}: {e}", source.display()))?;
    let name = source
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_default();
    import_image_bytes(project_dir, &name, &bytes)
}

/// Stores `bytes` in `<project>/images/` under a new key, or returns the key
/// of an existing image with identical bytes. Never overwrites a file.
fn import_image_bytes(
    project_dir: &Path,
    name_hint: &str,
    bytes: &[u8],
) -> Result<ProjectImage, String> {
    require_project(project_dir)?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err(too_large());
    }
    let (format, extension) = detect_format(bytes)?;
    let _guard = store_lock();
    let (width, height) = validate_image(bytes, format)?;
    let images_dir = ensure_images_dir(project_dir)?;
    let key = match find_identical(&images_dir, bytes, format)? {
        Some(key) => key,
        None => write_new_image(&images_dir, &slugify(name_hint), extension, bytes)?,
    };
    Ok(ProjectImage {
        absolute_path: images_dir.join(&key).to_string_lossy().into_owned(),
        key,
        width,
        height,
        bytes: bytes.len() as u64,
    })
}

/// Key of a directory entry that is a regular file with a valid image name.
/// Symlinks are skipped so references cannot escape the project.
fn image_key_of(entry: &fs::DirEntry) -> Option<String> {
    if !entry.file_type().ok()?.is_file() {
        return None;
    }
    let key = entry.file_name().into_string().ok()?;
    is_image_key(&key).then_some(key)
}

/// Key of a stored image with these exact bytes and a matching extension.
fn find_identical(
    images_dir: &Path,
    bytes: &[u8],
    format: ImageFormat,
) -> Result<Option<String>, String> {
    let mut same_size = Vec::new();
    for entry in fs::read_dir(images_dir).map_err(read_dir_failed)? {
        let entry = entry.map_err(read_dir_failed)?;
        let Some(key) = image_key_of(&entry) else {
            continue;
        };
        if format_of_key(&key) == Some(format)
            && entry
                .metadata()
                .is_ok_and(|meta| meta.len() == bytes.len() as u64)
        {
            same_size.push(key);
        }
    }
    same_size.sort();
    Ok(same_size
        .into_iter()
        .find(|key| fs::read(images_dir.join(key)).is_ok_and(|existing| existing == bytes)))
}

/// Writes `bytes` to the first free `<slug>.<ext>`, `<slug>-2.<ext>`, ... name.
fn write_new_image(
    images_dir: &Path,
    slug: &str,
    extension: &str,
    bytes: &[u8],
) -> Result<String, String> {
    for attempt in 1..=MAX_NAME_ATTEMPTS {
        let key = if attempt == 1 {
            format!("{slug}.{extension}")
        } else {
            format!("{slug}-{attempt}.{extension}")
        };
        let path = images_dir.join(&key);
        let mut file = match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => file,
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Failed to save image: {e}")),
        };
        if let Err(e) = file.write_all(bytes) {
            drop(file);
            let _ = fs::remove_file(&path);
            return Err(format!("Failed to save image: {e}"));
        }
        return Ok(key);
    }
    Err("Too many images share this name. Rename the file and import it again.".into())
}

/// Usable images in `<project>/images/`, sorted by key. Reads headers only.
fn list_images(project_dir: &Path) -> Result<Vec<ProjectImage>, String> {
    require_project(project_dir)?;
    let _guard = store_lock();
    let Some(images_dir) = real_images_dir(project_dir)? else {
        return Ok(Vec::new());
    };
    let mut images = Vec::new();
    for entry in fs::read_dir(&images_dir).map_err(read_dir_failed)? {
        let entry = entry.map_err(read_dir_failed)?;
        let Some(key) = image_key_of(&entry) else {
            continue;
        };
        let path = entry.path();
        match read_image_header(&path, &key) {
            Ok((width, height, bytes)) => images.push(ProjectImage {
                key,
                absolute_path: path.to_string_lossy().into_owned(),
                width,
                height,
                bytes,
            }),
            Err(error) => tracing::warn!(%key, %error, "Skipping unreadable project image"),
        }
    }
    images.sort_by(|a, b| a.key.cmp(&b.key));
    Ok(images)
}

/// Dimensions and file size of a stored image, checked from its header.
fn read_image_header(path: &Path, key: &str) -> Result<(u32, u32, u64), String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let bytes = file.metadata().map_err(|e| e.to_string())?.len();
    if bytes > MAX_IMAGE_BYTES {
        return Err(too_large());
    }
    let reader = ImageReader::new(BufReader::new(file))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let format = reader.format();
    if !matches!(format, Some(ImageFormat::Png | ImageFormat::Jpeg)) {
        return Err(UNSUPPORTED_FORMAT.into());
    }
    if format != format_of_key(key) {
        return Err("The file extension does not match the image format.".into());
    }
    let (width, height) = probe_image(reader)?;
    Ok((width, height, bytes))
}

fn delete_image(project_dir: &Path, key: &str) -> Result<(), String> {
    let _guard = store_lock();
    let path = resolve_image(project_dir, key)?;
    fs::remove_file(&path).map_err(|e| match e.kind() {
        io::ErrorKind::NotFound => format!("Image not found: {key}"),
        _ => format!("Failed to delete image: {e}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage, Rgba, RgbaImage};

    fn project() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("project.json"),
            r#"{"name":"Demo","description":""}"#,
        )
        .unwrap();
        dir
    }

    fn png(width: u32, height: u32, shade: u8) -> Vec<u8> {
        let mut bytes = Vec::new();
        RgbaImage::from_pixel(width, height, Rgba([shade, 0, 0, 255]))
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
            .unwrap();
        bytes
    }

    fn jpeg(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        RgbImage::from_pixel(width, height, Rgb([0, 128, 255]))
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Jpeg)
            .unwrap();
        bytes
    }

    fn files_in(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        names
    }

    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = !0u32;
        for &byte in bytes {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                crc = if crc & 1 == 1 {
                    (crc >> 1) ^ 0xEDB8_8320
                } else {
                    crc >> 1
                };
            }
        }
        !crc
    }

    fn push_chunk(png: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
        png.extend_from_slice(&(data.len() as u32).to_be_bytes());
        let start = png.len();
        png.extend_from_slice(kind);
        png.extend_from_slice(data);
        let crc = crc32(&png[start..]);
        png.extend_from_slice(&crc.to_be_bytes());
    }

    /// A PNG whose header claims any size but holds no pixels, so size
    /// checks can be tested without building huge images.
    fn png_header(width: u32, height: u32, bit_depth: u8, color_type: u8) -> Vec<u8> {
        let mut ihdr = Vec::new();
        ihdr.extend_from_slice(&width.to_be_bytes());
        ihdr.extend_from_slice(&height.to_be_bytes());
        ihdr.extend_from_slice(&[bit_depth, color_type, 0, 0, 0]);
        let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
        push_chunk(&mut png, b"IHDR", &ihdr);
        push_chunk(&mut png, b"IDAT", &[]);
        push_chunk(&mut png, b"IEND", &[]);
        png
    }

    /// A folder outside the project holding one image, for link tests.
    fn outside_folder() -> tempfile::TempDir {
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("logo.png"), png(1, 1, 0)).unwrap();
        outside
    }

    /// Every operation refuses an `images` entry that is not a real folder.
    fn assert_refuses_images_path(project_dir: &Path) {
        let errors = [
            import_image_bytes(project_dir, "new.png", &png(1, 1, 1)).unwrap_err(),
            list_images(project_dir).unwrap_err(),
            delete_image(project_dir, "logo.png").unwrap_err(),
            resolve_image(project_dir, "logo.png").unwrap_err(),
        ];
        for error in errors {
            assert!(error.contains("regular folder"), "{error}");
        }
    }

    #[test]
    fn image_keys_follow_the_grammar() {
        for key in [
            "logo.png",
            "a.jpg",
            "shot-2.jpeg",
            "0.png",
            "a--b.png",
            "con-image.png",
            "com10.png",
        ] {
            assert!(is_image_key(key), "{key} should be valid");
        }
        let too_long = format!("{}.png", "a".repeat(MAX_KEY_LEN));
        for key in [
            "",
            "logo",
            "Logo.png",
            "logo.PNG",
            "logo.gif",
            "-logo.png",
            ".png",
            "a b.png",
            "a.b.png",
            "../logo.png",
            "images/logo.png",
            r"a\b.png",
            "con.png",
            "lpt1.jpg",
            "com0.png",
            "café.png",
            too_long.as_str(),
        ] {
            assert!(!is_image_key(key), "{key} should be invalid");
        }
    }

    /// The mock backend checks the same fixture, so both slug names alike.
    #[test]
    fn slugs_match_the_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            name: String,
            slug: String,
        }
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/image-slugs.json");
        let cases: Vec<Case> = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
        assert!(!cases.is_empty());
        for case in cases {
            assert_eq!(slugify(&case.name), case.slug, "slug for {:?}", case.name);
        }
    }

    #[test]
    fn generated_keys_are_valid_references() {
        let long = "x".repeat(200);
        for hint in ["", "CON", "Screenshot 10.30.12.png", "___", long.as_str()] {
            for suffix in ["", "-2", "-1000"] {
                for extension in ["png", "jpg"] {
                    let key = format!("{}{suffix}.{extension}", slugify(hint));
                    assert!(is_image_key(&key), "{key}");
                }
            }
        }
    }

    #[test]
    fn imports_png_into_the_images_folder() {
        let dir = project();
        let bytes = png(3, 2, 10);
        let image = import_image_bytes(dir.path(), "Logo.png", &bytes).unwrap();
        assert_eq!(image.key, "logo.png");
        assert_eq!(
            (image.width, image.height, image.bytes),
            (3, 2, bytes.len() as u64)
        );
        let stored = dir.path().join(IMAGES_DIR).join("logo.png");
        assert_eq!(PathBuf::from(&image.absolute_path), stored);
        assert_eq!(fs::read(stored).unwrap(), bytes);
    }

    #[test]
    fn extension_follows_the_detected_format() {
        let dir = project();
        let photo = import_image_bytes(dir.path(), "photo.jpeg", &jpeg(4, 4)).unwrap();
        assert_eq!(photo.key, "photo.jpg");
        let mislabeled = import_image_bytes(dir.path(), "mislabeled.jpg", &png(1, 1, 0)).unwrap();
        assert_eq!(mislabeled.key, "mislabeled.png");
    }

    #[test]
    fn identical_bytes_reuse_the_existing_image() {
        let dir = project();
        let bytes = png(2, 2, 1);
        let first = import_image_bytes(dir.path(), "logo.png", &bytes).unwrap();
        let again = import_image_bytes(dir.path(), "brand.png", &bytes).unwrap();
        assert_eq!(again, first);
        assert_eq!(files_in(&dir.path().join(IMAGES_DIR)), ["logo.png"]);
    }

    #[test]
    fn name_clashes_get_a_suffix_and_never_overwrite() {
        let dir = project();
        let images = dir.path().join(IMAGES_DIR);
        fs::create_dir_all(&images).unwrap();
        fs::write(images.join("logo.png"), b"not really an image").unwrap();

        let first = import_image_bytes(dir.path(), "logo.png", &png(1, 1, 1)).unwrap();
        let second = import_image_bytes(dir.path(), "logo.png", &png(1, 1, 2)).unwrap();

        assert_eq!(first.key, "logo-2.png");
        assert_eq!(second.key, "logo-3.png");
        assert_eq!(
            fs::read(images.join("logo.png")).unwrap(),
            b"not really an image"
        );
    }

    #[test]
    fn rejects_unsupported_corrupt_and_oversized_images() {
        let dir = project();
        let mut truncated = png(4, 4, 0);
        truncated.truncate(40);
        let too_wide = png(MAX_IMAGE_SIDE + 1, 1, 0);
        let too_big = vec![0; MAX_IMAGE_BYTES as usize + 1];
        let cases: [(&[u8], &str); 5] = [
            (b"GIF89a\x01\x00\x01\x00", UNSUPPORTED_FORMAT),
            (b"", UNSUPPORTED_FORMAT),
            (&truncated, "could not be read"),
            (&too_wide, "16384 pixels per side"),
            (&too_big, "25 MB"),
        ];
        for (bytes, expected) in cases {
            let error = import_image_bytes(dir.path(), "bad.png", bytes).unwrap_err();
            assert!(error.contains(expected), "{error}");
        }
        assert!(!dir.path().join(IMAGES_DIR).exists());
    }

    #[test]
    fn size_limits_are_checked_from_the_header() {
        let dir = project();
        // 50 megapixels of 8-bit RGB: each side fits, the pixel count does not.
        let too_many_pixels = png_header(10_000, 5_000, 8, 2);
        // 36 megapixels of 16-bit RGBA: 288 MB once decoded.
        let too_much_memory = png_header(6_000, 6_000, 16, 6);
        for (bytes, expected) in [
            (&too_many_pixels, "40 megapixels"),
            (&too_much_memory, "too much memory"),
        ] {
            let error = import_image_bytes(dir.path(), "huge.png", bytes).unwrap_err();
            assert!(error.contains(expected), "{error}");
        }
        assert!(!dir.path().join(IMAGES_DIR).exists());

        // Listing reads headers only: large images within the limits still list.
        let images = dir.path().join(IMAGES_DIR);
        fs::create_dir(&images).unwrap();
        fs::write(images.join("too-many-pixels.png"), &too_many_pixels).unwrap();
        fs::write(images.join("too-much-memory.png"), &too_much_memory).unwrap();
        fs::write(images.join("large.png"), png_header(4_000, 4_000, 8, 6)).unwrap();
        let listed = list_images(dir.path()).unwrap();
        let summary: Vec<_> = listed
            .iter()
            .map(|image| (image.key.as_str(), image.width, image.height))
            .collect();
        assert_eq!(summary, [("large.png", 4_000, 4_000)]);
    }

    #[test]
    fn operations_require_a_project() {
        let dir = tempfile::tempdir().unwrap();
        let images = dir.path().join(IMAGES_DIR);
        fs::create_dir(&images).unwrap();
        fs::write(images.join("logo.png"), png(1, 1, 0)).unwrap();

        let errors = [
            import_image_bytes(dir.path(), "new.png", &png(1, 1, 1)).unwrap_err(),
            list_images(dir.path()).unwrap_err(),
            delete_image(dir.path(), "logo.png").unwrap_err(),
            resolve_image(dir.path(), "logo.png").unwrap_err(),
        ];
        for error in errors {
            assert!(error.contains("project.json"), "{error}");
        }
        assert_eq!(files_in(&images), ["logo.png"]);
    }

    #[test]
    fn refuses_an_images_file() {
        let dir = project();
        fs::write(dir.path().join(IMAGES_DIR), "not a folder").unwrap();
        assert_refuses_images_path(dir.path());
        assert_eq!(
            fs::read_to_string(dir.path().join(IMAGES_DIR)).unwrap(),
            "not a folder"
        );
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlinked_images_folder() {
        let dir = project();
        let outside = outside_folder();
        std::os::unix::fs::symlink(outside.path(), dir.path().join(IMAGES_DIR)).unwrap();
        assert_refuses_images_path(dir.path());
        assert_eq!(files_in(outside.path()), ["logo.png"]);
    }

    #[cfg(windows)]
    #[test]
    fn refuses_a_junctioned_images_folder() {
        let dir = project();
        let outside = outside_folder();
        // Junctions need no admin rights, unlike directory symlinks.
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(dir.path().join(IMAGES_DIR))
            .arg(outside.path())
            .stdout(std::process::Stdio::null())
            .status()
            .unwrap();
        assert!(status.success(), "mklink /J failed");
        assert_refuses_images_path(dir.path());
        assert_eq!(files_in(outside.path()), ["logo.png"]);
    }

    #[test]
    fn references_resolve_by_exact_name_only() {
        let dir = project();
        let image = import_image_bytes(dir.path(), "logo.png", &png(1, 1, 0)).unwrap();
        let images = dir.path().join(IMAGES_DIR);
        fs::write(images.join("Chart.PNG"), png(1, 1, 1)).unwrap();
        fs::create_dir(images.join("folder.png")).unwrap();

        assert_eq!(
            resolve_image(dir.path(), &image.key).unwrap(),
            PathBuf::from(&image.absolute_path)
        );
        for key in ["chart.png", "folder.png", "missing.png"] {
            let error = resolve_image(dir.path(), key).unwrap_err();
            assert!(error.contains("Image not found"), "{key}: {error}");
        }
        for key in ["Chart.PNG", "../project.json", "images/logo.png"] {
            let error = resolve_image(dir.path(), key).unwrap_err();
            assert!(error.contains("Invalid image reference"), "{key}: {error}");
        }
    }

    #[test]
    fn extensions_must_match_the_image_format() {
        let dir = project();
        let images = dir.path().join(IMAGES_DIR);
        fs::create_dir(&images).unwrap();
        let bytes = jpeg(2, 2);
        fs::write(images.join("photo.png"), &bytes).unwrap();

        assert!(list_images(dir.path()).unwrap().is_empty());
        let image = import_image_bytes(dir.path(), "photo.png", &bytes).unwrap();
        assert_eq!(image.key, "photo.jpg");
        assert_eq!(files_in(&images), ["photo.jpg", "photo.png"]);
    }

    #[test]
    fn imports_from_a_file_path() {
        let dir = project();
        let source = dir.path().join("Team Photo.JPG");
        fs::write(&source, jpeg(2, 2)).unwrap();
        assert_eq!(
            import_image_file(dir.path(), &source).unwrap().key,
            "team-photo.jpg"
        );

        let missing = import_image_file(dir.path(), &dir.path().join("missing.png")).unwrap_err();
        assert!(missing.contains("Could not open"), "{missing}");
    }

    #[test]
    fn file_import_stops_reading_past_the_size_cap() {
        let dir = project();
        let source = dir.path().join("huge.png");
        File::create(&source)
            .unwrap()
            .set_len(MAX_IMAGE_BYTES * 2)
            .unwrap();
        let error = import_image_file(dir.path(), &source).unwrap_err();
        assert!(error.contains("25 MB"), "{error}");
    }

    #[test]
    fn decodes_base64_image_data() {
        use base64::Engine;
        let bytes = png(1, 1, 5);
        let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
        assert_eq!(decode_image_data(&encoded).unwrap(), bytes);
        assert!(decode_image_data("not base64!")
            .unwrap_err()
            .contains("Invalid image data"));
        let oversized = "A".repeat((MAX_IMAGE_BYTES as usize).div_ceil(3) * 4 + 4);
        assert!(decode_image_data(&oversized).unwrap_err().contains("25 MB"));
    }

    #[test]
    fn lists_valid_images_sorted_and_skips_everything_else() {
        let dir = project();
        let images = dir.path().join(IMAGES_DIR);
        fs::create_dir_all(images.join("nested.png")).unwrap();
        fs::write(images.join("b-chart.png"), png(5, 3, 0)).unwrap();
        fs::write(images.join("a-photo.jpg"), jpeg(2, 4)).unwrap();
        fs::write(images.join("Bad Name.png"), png(1, 1, 0)).unwrap();
        fs::write(images.join("notes.txt"), "hi").unwrap();
        fs::write(images.join("broken.png"), b"\x89PNG\r\n\x1a\nnope").unwrap();
        fs::write(images.join("animated.png"), b"GIF89a\x01\x00\x01\x00").unwrap();

        let listed = list_images(dir.path()).unwrap();

        let summary: Vec<_> = listed
            .iter()
            .map(|image| (image.key.as_str(), image.width, image.height))
            .collect();
        assert_eq!(summary, [("a-photo.jpg", 2, 4), ("b-chart.png", 5, 3)]);
        let chart = &listed[1];
        assert_eq!(
            PathBuf::from(&chart.absolute_path),
            images.join("b-chart.png")
        );
        assert_eq!(
            chart.bytes,
            fs::metadata(images.join("b-chart.png")).unwrap().len()
        );
    }

    #[test]
    fn listing_without_an_images_folder_is_empty() {
        let dir = project();
        assert!(list_images(dir.path()).unwrap().is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_files_are_ignored() {
        let dir = project();
        let outside = outside_folder();
        let images = dir.path().join(IMAGES_DIR);
        fs::create_dir(&images).unwrap();
        std::os::unix::fs::symlink(outside.path().join("logo.png"), images.join("link.png"))
            .unwrap();

        assert!(list_images(dir.path()).unwrap().is_empty());
        for error in [
            resolve_image(dir.path(), "link.png").unwrap_err(),
            delete_image(dir.path(), "link.png").unwrap_err(),
        ] {
            assert!(error.contains("not found"), "{error}");
        }
        assert!(images.join("link.png").symlink_metadata().is_ok());
        assert_eq!(files_in(outside.path()), ["logo.png"]);
    }

    #[test]
    fn deletes_images_by_key_only() {
        let dir = project();
        let image = import_image_bytes(dir.path(), "logo.png", &png(1, 1, 0)).unwrap();
        let images = dir.path().join(IMAGES_DIR);
        fs::create_dir(images.join("folder.png")).unwrap();

        for key in [
            "../project.json",
            r"..\project.json",
            "images/logo.png",
            "LOGO.png",
            "con.png",
        ] {
            let error = delete_image(dir.path(), key).unwrap_err();
            assert!(error.contains("Invalid image reference"), "{key}: {error}");
        }
        assert!(dir.path().join("project.json").is_file());
        assert!(delete_image(dir.path(), "folder.png")
            .unwrap_err()
            .contains("not found"));
        assert!(images.join("folder.png").is_dir());

        delete_image(dir.path(), &image.key).unwrap();
        assert!(!images.join("logo.png").exists());
        assert!(delete_image(dir.path(), "logo.png")
            .unwrap_err()
            .contains("not found"));
    }

    #[test]
    fn images_travel_with_project_exports() {
        let source = project();
        fs::write(source.path().join("text-snippets.json"), "[]").unwrap();
        fs::write(source.path().join("video-snippets.json"), "[]").unwrap();
        let bytes = png(4, 3, 9);
        import_image_bytes(source.path(), "diagram.png", &bytes).unwrap();
        let out = tempfile::tempdir().unwrap();
        let archive = out.path().join("demo.zip");
        let dest = out.path().join("imported");

        crate::project_archive::write_project_archive(source.path(), &archive).unwrap();
        crate::project_archive::extract_project_archive(&archive, &dest).unwrap();

        let listed = list_images(&dest).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(
            (listed[0].key.as_str(), listed[0].width),
            ("diagram.png", 4)
        );
        assert_eq!(fs::read(&listed[0].absolute_path).unwrap(), bytes);
    }
}
