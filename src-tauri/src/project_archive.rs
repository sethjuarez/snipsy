use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read};
use std::path::{Component, Path, PathBuf};

use tauri_plugin_auditaur::IpcTraceContext;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const PROJECT_FILE: &str = "project.json";
const SKIPPED_DIRS: &[&str] = &[".git"];
const COMPRESSED_EXTENSIONS: &[&str] = &["json", "txt", "md"];
/// macOS Finder adds resource-fork metadata here when zipping.
const IGNORED_ARCHIVE_ROOTS: &[&str] = &["__MACOSX"];
/// Guards against zip bombs while leaving room for long recorded demos.
const MAX_ARCHIVE_ENTRIES: usize = 20_000;
const MAX_EXTRACTED_BYTES: u64 = 64 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveSummary {
    pub path: String,
    pub file_count: usize,
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub async fn export_project(
    project_path: String,
    archive_path: String,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<ArchiveSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        write_project_archive(Path::new(&project_path), Path::new(&archive_path))
    })
    .await
    .map_err(|e| format!("Export task failed: {e}"))?
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub async fn import_project(
    archive_path: String,
    destination_path: String,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<ArchiveSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_project_archive(Path::new(&archive_path), Path::new(&destination_path))
    })
    .await
    .map_err(|e| format!("Import task failed: {e}"))?
}

pub fn write_project_archive(project_dir: &Path, archive_path: &Path) -> Result<ArchiveSummary, String> {
    if !project_dir.join(PROJECT_FILE).is_file() {
        return Err("This folder is not a Snipsy project (project.json is missing).".into());
    }
    let archive_abs = absolute(archive_path);
    let mut files = Vec::new();
    collect_files(project_dir, project_dir, &archive_abs, &mut files)?;

    if let Some(parent) = archive_path.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create export folder: {e}"))?;
    }
    let temp_path = archive_path.with_extension("zip.partial");
    let result = (|| {
        let file = File::create(&temp_path).map_err(|e| format!("Failed to create archive: {e}"))?;
        let mut writer = ZipWriter::new(BufWriter::new(file));
        for (absolute_path, name) in &files {
            let size = fs::metadata(absolute_path)
                .map_err(|e| format!("Failed to read {name}: {e}"))?
                .len();
            let options = SimpleFileOptions::default()
                .compression_method(compression_for(name))
                .large_file(size >= u32::MAX as u64);
            writer
                .start_file(name.as_str(), options)
                .map_err(|e| format!("Failed to add {name}: {e}"))?;
            let mut source = BufReader::new(
                File::open(absolute_path).map_err(|e| format!("Failed to open {name}: {e}"))?,
            );
            io::copy(&mut source, &mut writer).map_err(|e| format!("Failed to write {name}: {e}"))?;
        }
        writer.finish().map_err(|e| format!("Failed to finish archive: {e}"))?;
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    replace_file(&temp_path, archive_path)?;

    Ok(ArchiveSummary {
        path: archive_path.to_string_lossy().into_owned(),
        file_count: files.len(),
    })
}

pub fn extract_project_archive(archive_path: &Path, destination: &Path) -> Result<ArchiveSummary, String> {
    if destination.exists() {
        let mut entries = fs::read_dir(destination).map_err(|e| format!("Failed to read destination: {e}"))?;
        if entries.next().is_some() {
            return Err("Choose an empty folder to import into.".into());
        }
    }

    let file = File::open(archive_path).map_err(|e| format!("Failed to open archive: {e}"))?;
    let mut archive = ZipArchive::new(BufReader::new(file)).map_err(|e| format!("Not a valid zip archive: {e}"))?;

    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(format!("This archive has too many files ({}).", archive.len()));
    }
    let mut names = Vec::with_capacity(archive.len());
    let mut declared_bytes: u64 = 0;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|e| format!("Failed to read archive: {e}"))?;
        declared_bytes = declared_bytes.saturating_add(entry.size());
        if declared_bytes > MAX_EXTRACTED_BYTES {
            return Err("This archive is too large to import.".into());
        }
        let name = entry
            .enclosed_name()
            .ok_or_else(|| format!("Archive entry has an unsafe path: {}", entry.name().unwrap_or_default()))?;
        names.push((name, entry.is_dir()));
    }
    let root = project_root(&names)
        .ok_or("This archive is not a Snipsy project (project.json is missing).")?;

    fs::create_dir_all(destination).map_err(|e| format!("Failed to create destination: {e}"))?;
    let mut file_count = 0;
    let mut extracted_bytes: u64 = 0;
    let result = (|| {
        for (index, (name, is_dir)) in names.iter().enumerate() {
            let Ok(relative) = name.strip_prefix(&root) else { continue };
            let ignored = matches!(relative.components().next(), Some(Component::Normal(top)) if IGNORED_ARCHIVE_ROOTS.iter().any(|i| top == *i));
            if relative.as_os_str().is_empty() || ignored {
                continue;
            }
            let target = destination.join(relative);
            if *is_dir {
                fs::create_dir_all(&target).map_err(|e| format!("Failed to create folder: {e}"))?;
                continue;
            }
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("Failed to create folder: {e}"))?;
            }
            let mut entry = archive.by_index(index).map_err(|e| format!("Failed to read archive: {e}"))?;
            let mut output = BufWriter::new(
                File::create(&target).map_err(|e| format!("Failed to create {}: {e}", relative.display()))?,
            );
            // Declared sizes are untrusted, so cap the bytes actually written too.
            let budget = MAX_EXTRACTED_BYTES - extracted_bytes;
            let written = io::copy(&mut (&mut entry).take(budget + 1), &mut output)
                .map_err(|e| format!("Failed to extract {}: {e}", relative.display()))?;
            if written > budget {
                return Err("This archive is too large to import.".into());
            }
            extracted_bytes += written;
            file_count += 1;
        }
        crate::commands::load_project_data(destination)
            .map_err(|e| format!("This archive is not a valid Snipsy project. {e}"))?;
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        let _ = clear_dir(destination);
        return Err(error);
    }

    Ok(ArchiveSummary {
        path: destination.to_string_lossy().into_owned(),
        file_count,
    })
}

/// Swaps in the new archive, restoring the previous one if the swap fails.
fn replace_file(new_file: &Path, target: &Path) -> Result<(), String> {
    if !target.exists() {
        return fs::rename(new_file, target).map_err(|e| {
            let _ = fs::remove_file(new_file);
            format!("Failed to save archive: {e}")
        });
    }
    let backup = target.with_extension("zip.bak");
    let _ = fs::remove_file(&backup);
    if let Err(e) = fs::rename(target, &backup) {
        let _ = fs::remove_file(new_file);
        return Err(format!("Failed to replace existing archive: {e}"));
    }
    if let Err(e) = fs::rename(new_file, target) {
        let _ = fs::rename(&backup, target);
        let _ = fs::remove_file(new_file);
        return Err(format!("Failed to save archive: {e}"));
    }
    let _ = fs::remove_file(&backup);
    Ok(())
}

/// Projects may be zipped at the root or inside a single wrapper folder.
fn project_root(names: &[(PathBuf, bool)]) -> Option<PathBuf> {
    if names.iter().any(|(name, is_dir)| !is_dir && name == Path::new(PROJECT_FILE)) {
        return Some(PathBuf::new());
    }
    let mut tops = names.iter().filter_map(|(name, _)| match name.components().next() {
        Some(Component::Normal(top)) if !IGNORED_ARCHIVE_ROOTS.iter().any(|ignored| top == *ignored) => {
            Some(PathBuf::from(top))
        }
        _ => None,
    });
    let first = tops.next()?;
    if tops.any(|top| top != first) {
        return None;
    }
    let candidate = first.join(PROJECT_FILE);
    names
        .iter()
        .any(|(name, is_dir)| !is_dir && *name == candidate)
        .then_some(first)
}

fn collect_files(
    root: &Path,
    dir: &Path,
    archive_abs: &Path,
    files: &mut Vec<(PathBuf, String)>,
) -> Result<(), String> {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read {}: {e}", dir.display()))?
        .filter_map(Result::ok)
        .collect();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let file_type = entry.file_type().map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
        if file_type.is_dir() {
            if SKIPPED_DIRS.iter().any(|skip| entry.file_name() == *skip) {
                continue;
            }
            collect_files(root, &path, archive_abs, files)?;
        } else if file_type.is_file() {
            let abs = absolute(&path);
            if abs == archive_abs || abs == archive_abs.with_extension("zip.partial") {
                continue;
            }
            let relative = path.strip_prefix(root).map_err(|e| e.to_string())?;
            let name = relative
                .components()
                .map(|c| c.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            files.push((path, name));
        }
    }
    Ok(())
}

fn compression_for(name: &str) -> CompressionMethod {
    let extension = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    if COMPRESSED_EXTENSIONS.contains(&extension.as_str()) {
        CompressionMethod::Deflated
    } else {
        CompressionMethod::Stored
    }
}

fn absolute(path: &Path) -> PathBuf {
    fs::canonicalize(path)
        .or_else(|_| std::path::absolute(path))
        .unwrap_or_else(|_| path.to_path_buf())
}

fn clear_dir(dir: &Path) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            fs::remove_dir_all(path)?;
        } else {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn sample_project(dir: &Path) {
        fs::write(dir.join("project.json"), r#"{"name":"Demo","description":""}"#).unwrap();
        fs::write(dir.join("text-snippets.json"), "[]").unwrap();
        fs::write(dir.join("video-snippets.json"), "[]").unwrap();
        fs::create_dir_all(dir.join("automations")).unwrap();
        fs::write(dir.join("automations").join("a.json"), "{}").unwrap();
        fs::create_dir_all(dir.join("videos").join("thumbnails")).unwrap();
        fs::write(dir.join("videos").join("clip.mp4"), vec![7u8; 4096]).unwrap();
        fs::write(dir.join("videos").join("thumbnails").join("clip.jpg"), [1u8, 2, 3]).unwrap();
        fs::create_dir_all(dir.join("images")).unwrap();
        fs::write(dir.join("images").join("logo.png"), [9u8; 64]).unwrap();
        fs::create_dir_all(dir.join(".git")).unwrap();
        fs::write(dir.join(".git").join("HEAD"), "ref").unwrap();
    }

    const PROJECT: &[u8] = br#"{"name":"Demo","description":""}"#;

    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let mut writer = ZipWriter::new(File::create(path).unwrap());
        for (name, data) in entries {
            writer.start_file(*name, SimpleFileOptions::default()).unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap();
    }

    #[test]
    fn round_trips_a_project() {
        let source = tempfile::tempdir().unwrap();
        sample_project(source.path());
        let out = tempfile::tempdir().unwrap();
        let archive = out.path().join("demo.zip");

        let exported = write_project_archive(source.path(), &archive).unwrap();
        assert_eq!(exported.file_count, 7);

        let dest = out.path().join("imported");
        let imported = extract_project_archive(&archive, &dest).unwrap();
        assert_eq!(imported.file_count, 7);
        assert_eq!(fs::read(dest.join("images").join("logo.png")).unwrap(), vec![9u8; 64]);
        assert_eq!(fs::read(dest.join("videos").join("clip.mp4")).unwrap(), vec![7u8; 4096]);
        assert_eq!(fs::read_to_string(dest.join("automations").join("a.json")).unwrap(), "{}");
        assert!(dest.join("videos").join("thumbnails").join("clip.jpg").is_file());
        assert!(!dest.join(".git").exists());
    }

    #[test]
    fn stores_videos_and_deflates_json() {
        let source = tempfile::tempdir().unwrap();
        sample_project(source.path());
        let out = tempfile::tempdir().unwrap();
        let archive = out.path().join("demo.zip");
        write_project_archive(source.path(), &archive).unwrap();

        let mut zip = ZipArchive::new(File::open(&archive).unwrap()).unwrap();
        assert_eq!(zip.by_name("videos/clip.mp4").unwrap().compression(), CompressionMethod::Stored);
        assert_eq!(zip.by_name("project.json").unwrap().compression(), CompressionMethod::Deflated);
    }

    #[test]
    fn skips_archive_written_inside_project() {
        let source = tempfile::tempdir().unwrap();
        sample_project(source.path());
        let archive = source.path().join("demo.zip");
        write_project_archive(source.path(), &archive).unwrap();
        let summary = write_project_archive(source.path(), &archive).unwrap();
        assert_eq!(summary.file_count, 7);
    }

    #[test]
    fn export_requires_a_project() {
        let source = tempfile::tempdir().unwrap();
        let error = write_project_archive(source.path(), &source.path().join("x.zip")).unwrap_err();
        assert!(error.contains("project.json"));
    }

    #[test]
    fn imports_from_a_single_wrapper_folder() {
        let out = tempfile::tempdir().unwrap();
        let archive = out.path().join("wrapped.zip");
        write_zip(
            &archive,
            &[
                ("Demo/project.json", PROJECT),
                ("Demo/text-snippets.json", b"[]"),
                ("Demo/video-snippets.json", b"[]"),
                ("Demo/videos/a.mp4", b"v"),
                ("__MACOSX/Demo/._project.json", b"x"),
            ],
        );

        let dest = out.path().join("dest");
        extract_project_archive(&archive, &dest).unwrap();
        assert!(dest.join("project.json").is_file());
        assert!(dest.join("videos").join("a.mp4").is_file());
        assert!(!dest.join("__MACOSX").exists());
    }

    #[test]
    fn rejects_archives_without_project_json() {
        let out = tempfile::tempdir().unwrap();
        let archive = out.path().join("bad.zip");
        write_zip(&archive, &[("readme.txt", b"hi")]);
        let error = extract_project_archive(&archive, &out.path().join("dest")).unwrap_err();
        assert!(error.contains("project.json"));
    }

    #[test]
    fn rejects_non_empty_destination() {
        let out = tempfile::tempdir().unwrap();
        let archive = out.path().join("ok.zip");
        write_zip(&archive, &[("project.json", PROJECT)]);
        let dest = out.path().join("dest");
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("existing.txt"), "x").unwrap();
        let error = extract_project_archive(&archive, &dest).unwrap_err();
        assert!(error.contains("empty folder"));
    }

    #[test]
    fn rejects_zip_slip_entries() {
        let out = tempfile::tempdir().unwrap();
        let archive = out.path().join("evil.zip");
        write_zip(&archive, &[("project.json", PROJECT), ("../escape.txt", b"x")]);
        let dest = out.path().join("dest");
        let error = extract_project_archive(&archive, &dest).unwrap_err();
        assert!(error.contains("unsafe path"));
        assert!(!out.path().join("escape.txt").exists());
    }

    #[test]
    fn invalid_project_import_leaves_destination_empty_for_retry() {
        let out = tempfile::tempdir().unwrap();
        let archive = out.path().join("broken.zip");
        write_zip(&archive, &[("project.json", PROJECT), ("text-snippets.json", b"not json")]);
        let dest = out.path().join("dest");
        let error = extract_project_archive(&archive, &dest).unwrap_err();
        assert!(error.contains("not a valid Snipsy project"), "{error}");
        assert_eq!(fs::read_dir(&dest).unwrap().count(), 0);

        let good = out.path().join("good.zip");
        write_zip(&good, &[("project.json", PROJECT), ("text-snippets.json", b"[]"), ("video-snippets.json", b"[]")]);
        extract_project_archive(&good, &dest).unwrap();
        assert!(dest.join("project.json").is_file());
    }

    #[test]
    fn re_export_replaces_existing_archive_without_leftovers() {
        let source = tempfile::tempdir().unwrap();
        sample_project(source.path());
        let out = tempfile::tempdir().unwrap();
        let archive = out.path().join("demo.zip");
        fs::write(&archive, b"old").unwrap();
        write_project_archive(source.path(), &archive).unwrap();
        assert!(ZipArchive::new(File::open(&archive).unwrap()).is_ok());
        assert!(!archive.with_extension("zip.bak").exists());
        assert!(!archive.with_extension("zip.partial").exists());
    }
    #[test]
    fn rejects_archives_with_too_many_entries() {
        let out = tempfile::tempdir().unwrap();
        let archive = out.path().join("many.zip");
        let mut writer = ZipWriter::new(File::create(&archive).unwrap());
        for index in 0..=MAX_ARCHIVE_ENTRIES {
            writer.start_file(format!("f{index}"), SimpleFileOptions::default()).unwrap();
        }
        writer.finish().unwrap();
        let dest = out.path().join("dest");
        let error = extract_project_archive(&archive, &dest).unwrap_err();
        assert!(error.contains("too many files"), "{error}");
        assert!(!dest.exists() || fs::read_dir(&dest).unwrap().count() == 0);
    }
}