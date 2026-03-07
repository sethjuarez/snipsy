use std::fs;
use std::path::PathBuf;

use crate::models::{Project, ProjectData, Script, TextSnippet, VideoSnippet};

#[tauri::command]
pub fn create_project(
    path: String,
    name: String,
    description: String,
) -> Result<ProjectData, String> {
    let project_dir = PathBuf::from(&path);
    fs::create_dir_all(&project_dir).map_err(|e| format!("Failed to create directory: {e}"))?;

    let project = Project {
        name,
        description,
    };

    let project_json = serde_json::to_string_pretty(&project)
        .map_err(|e| format!("Failed to serialize project: {e}"))?;
    fs::write(project_dir.join("project.json"), project_json)
        .map_err(|e| format!("Failed to write project.json: {e}"))?;

    let empty_text: Vec<TextSnippet> = vec![];
    let text_json = serde_json::to_string_pretty(&empty_text)
        .map_err(|e| format!("Failed to serialize text snippets: {e}"))?;
    fs::write(project_dir.join("text-snippets.json"), text_json)
        .map_err(|e| format!("Failed to write text-snippets.json: {e}"))?;

    let empty_video: Vec<VideoSnippet> = vec![];
    let video_json = serde_json::to_string_pretty(&empty_video)
        .map_err(|e| format!("Failed to serialize video snippets: {e}"))?;
    fs::write(project_dir.join("video-snippets.json"), video_json)
        .map_err(|e| format!("Failed to write video-snippets.json: {e}"))?;

    // Create videos/ and scripts/ directories
    fs::create_dir_all(project_dir.join("videos"))
        .map_err(|e| format!("Failed to create videos dir: {e}"))?;
    fs::create_dir_all(project_dir.join("scripts"))
        .map_err(|e| format!("Failed to create scripts dir: {e}"))?;

    Ok(ProjectData {
        project: Project {
            name: project.name,
            description: project.description,
        },
        text_snippets: empty_text,
        video_snippets: empty_video,
    })
}

#[tauri::command]
pub fn open_project(path: String) -> Result<ProjectData, String> {
    let project_dir = PathBuf::from(&path);

    let project_json = fs::read_to_string(project_dir.join("project.json"))
        .map_err(|e| format!("Failed to read project.json: {e}"))?;
    let project: Project = serde_json::from_str(&project_json)
        .map_err(|e| format!("Failed to parse project.json: {e}"))?;

    let text_json = fs::read_to_string(project_dir.join("text-snippets.json"))
        .map_err(|e| format!("Failed to read text-snippets.json: {e}"))?;
    let text_snippets: Vec<TextSnippet> = serde_json::from_str(&text_json)
        .map_err(|e| format!("Failed to parse text-snippets.json: {e}"))?;

    let video_json = fs::read_to_string(project_dir.join("video-snippets.json"))
        .map_err(|e| format!("Failed to read video-snippets.json: {e}"))?;
    let video_snippets: Vec<VideoSnippet> = serde_json::from_str(&video_json)
        .map_err(|e| format!("Failed to parse video-snippets.json: {e}"))?;

    Ok(ProjectData {
        project,
        text_snippets,
        video_snippets,
    })
}

#[tauri::command]
pub fn save_text_snippets(path: String, snippets: Vec<TextSnippet>) -> Result<(), String> {
    let project_dir = PathBuf::from(&path);
    let json = serde_json::to_string_pretty(&snippets)
        .map_err(|e| format!("Failed to serialize text snippets: {e}"))?;
    fs::write(project_dir.join("text-snippets.json"), json)
        .map_err(|e| format!("Failed to write text-snippets.json: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn save_video_snippets(path: String, snippets: Vec<VideoSnippet>) -> Result<(), String> {
    let project_dir = PathBuf::from(&path);
    let json = serde_json::to_string_pretty(&snippets)
        .map_err(|e| format!("Failed to serialize video snippets: {e}"))?;
    fs::write(project_dir.join("video-snippets.json"), json)
        .map_err(|e| format!("Failed to write video-snippets.json: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn import_video(project_path: String, source_file_path: String) -> Result<String, String> {
    let project_dir = PathBuf::from(&project_path);
    let source = PathBuf::from(&source_file_path);

    if !source.exists() {
        return Err(format!("Source file does not exist: {source_file_path}"));
    }

    let videos_dir = project_dir.join("videos");
    fs::create_dir_all(&videos_dir)
        .map_err(|e| format!("Failed to create videos directory: {e}"))?;

    let file_name = source
        .file_name()
        .ok_or("Invalid source file name")?
        .to_string_lossy()
        .to_string();

    let dest = videos_dir.join(&file_name);
    fs::copy(&source, &dest)
        .map_err(|e| format!("Failed to copy video file: {e}"))?;

    // Generate thumbnail (best-effort — don't fail import if ffmpeg missing)
    let _ = generate_thumbnail(&dest, &videos_dir);

    Ok(format!("videos/{file_name}"))
}

/// Generate a thumbnail for a video using ffmpeg (first frame at 1s).
fn generate_thumbnail(video_path: &std::path::Path, videos_dir: &std::path::Path) -> Result<(), String> {
    let ffmpeg = crate::scripting::resolve_ffmpeg_path()
        .ok_or_else(|| "ffmpeg not available".to_string())?;

    let thumbs_dir = videos_dir.join("thumbnails");
    fs::create_dir_all(&thumbs_dir)
        .map_err(|e| format!("Failed to create thumbnails dir: {e}"))?;

    let stem = video_path
        .file_stem()
        .ok_or("No file stem")?
        .to_string_lossy();
    let thumb_path = thumbs_dir.join(format!("{stem}.jpg"));

    let output = std::process::Command::new(ffmpeg)
        .args([
            "-i", &video_path.to_string_lossy(),
            "-ss", "00:00:01",
            "-vframes", "1",
            "-q:v", "2",
            "-y",
            &thumb_path.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("ffmpeg not available: {e}"))?;

    if !output.status.success() {
        return Err("ffmpeg thumbnail generation failed".into());
    }
    Ok(())
}

/// Imported video metadata returned to the frontend.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedVideoInfo {
    pub name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub thumbnail_path: Option<String>,
}

#[tauri::command]
pub fn list_imported_videos(project_path: String) -> Result<Vec<ImportedVideoInfo>, String> {
    let project_dir = PathBuf::from(&project_path);
    let videos_dir = project_dir.join("videos");
    if !videos_dir.exists() {
        return Ok(vec![]);
    }

    let thumbs_dir = videos_dir.join("thumbnails");
    let video_extensions = ["mp4", "mkv", "avi", "mov", "webm", "wmv"];

    let mut videos = Vec::new();
    let entries = fs::read_dir(&videos_dir)
        .map_err(|e| format!("Failed to read videos directory: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if !video_extensions.contains(&ext.as_str()) {
            continue;
        }

        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let thumb = thumbs_dir.join(format!("{stem}.jpg"));

        videos.push(ImportedVideoInfo {
            name: name.clone(),
            relative_path: format!("videos/{name}"),
            absolute_path: path.to_string_lossy().to_string(),
            thumbnail_path: if thumb.exists() {
                Some(thumb.to_string_lossy().to_string())
            } else {
                None
            },
        });
    }

    videos.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(videos)
}

/// Delete an imported video file and its thumbnail from the project.
#[tauri::command]
pub fn delete_video(project_path: String, relative_path: String) -> Result<(), String> {
    let project_dir = PathBuf::from(&project_path);
    let video_path = project_dir.join(&relative_path);

    if !video_path.exists() {
        return Err(format!("Video file not found: {relative_path}"));
    }

    // Delete the video file
    fs::remove_file(&video_path)
        .map_err(|e| format!("Failed to delete video: {e}"))?;

    // Delete the thumbnail (best-effort)
    if let Some(stem) = video_path.file_stem().and_then(|s| s.to_str()) {
        let thumb = project_dir.join("videos").join("thumbnails").join(format!("{stem}.jpg"));
        let _ = fs::remove_file(thumb);
    }

    Ok(())
}

#[tauri::command]
pub fn save_script(project_path: String, script: Script) -> Result<(), String> {
    let scripts_dir = PathBuf::from(&project_path).join("scripts");
    fs::create_dir_all(&scripts_dir)
        .map_err(|e| format!("Failed to create scripts directory: {e}"))?;

    let file_path = scripts_dir.join(format!("{}.json", script.id));
    let json = serde_json::to_string_pretty(&script)
        .map_err(|e| format!("Failed to serialize script: {e}"))?;
    fs::write(file_path, json).map_err(|e| format!("Failed to write script file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn load_scripts(project_path: String) -> Result<Vec<Script>, String> {
    let scripts_dir = PathBuf::from(&project_path).join("scripts");
    if !scripts_dir.exists() {
        return Ok(vec![]);
    }

    let mut scripts = Vec::new();
    let entries =
        fs::read_dir(&scripts_dir).map_err(|e| format!("Failed to read scripts directory: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "json") {
            let content =
                fs::read_to_string(&path).map_err(|e| format!("Failed to read script file: {e}"))?;
            let script: Script = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse script file: {e}"))?;
            scripts.push(script);
        }
    }

    Ok(scripts)
}

#[tauri::command]
pub fn delete_script(project_path: String, id: String) -> Result<(), String> {
    let file_path = PathBuf::from(&project_path)
        .join("scripts")
        .join(format!("{}.json", id));
    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| format!("Failed to delete script file: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DeliveryMethod;
    use tempfile::TempDir;

    #[test]
    fn create_and_open_project() {
        let tmp = TempDir::new().unwrap();
        let project_path = tmp.path().join("test-project");

        let result = create_project(
            project_path.to_string_lossy().into_owned(),
            "Test Project".into(),
            "A test description".into(),
        );
        assert!(result.is_ok());
        let data = result.unwrap();
        assert_eq!(data.project.name, "Test Project");
        assert!(data.text_snippets.is_empty());
        assert!(data.video_snippets.is_empty());

        // Verify files exist
        assert!(project_path.join("project.json").exists());
        assert!(project_path.join("text-snippets.json").exists());
        assert!(project_path.join("video-snippets.json").exists());
        assert!(project_path.join("videos").is_dir());
        assert!(project_path.join("scripts").is_dir());

        // Open should return the same data
        let opened = open_project(project_path.to_string_lossy().into_owned());
        assert!(opened.is_ok());
        let opened_data = opened.unwrap();
        assert_eq!(opened_data.project.name, "Test Project");
    }

    #[test]
    fn save_and_load_text_snippets() {
        let tmp = TempDir::new().unwrap();
        let project_path = tmp.path().join("test-project");
        create_project(
            project_path.to_string_lossy().into_owned(),
            "Test".into(),
            "Test".into(),
        )
        .unwrap();

        let snippets = vec![TextSnippet {
            id: "ts-1".into(),
            title: "Hello".into(),
            description: "A greeting".into(),
            text: "Hello, world!".into(),
            hotkey: "Ctrl+Shift+1".into(),
            delivery: DeliveryMethod::FastType,
            type_delay: Some(30),
        }];

        save_text_snippets(
            project_path.to_string_lossy().into_owned(),
            snippets.clone(),
        )
        .unwrap();

        let data = open_project(project_path.to_string_lossy().into_owned()).unwrap();
        assert_eq!(data.text_snippets.len(), 1);
        assert_eq!(data.text_snippets[0].title, "Hello");
        assert_eq!(data.text_snippets[0].delivery, DeliveryMethod::FastType);
    }

    #[test]
    fn save_and_load_video_snippets() {
        let tmp = TempDir::new().unwrap();
        let project_path = tmp.path().join("test-project");
        create_project(
            project_path.to_string_lossy().into_owned(),
            "Test".into(),
            "Test".into(),
        )
        .unwrap();

        let snippets = vec![VideoSnippet {
            id: "vs-1".into(),
            title: "Build Demo".into(),
            description: "Shows the build".into(),
            video_file: "videos/build.mp4".into(),
            start_time: 0.0,
            end_time: 30.0,
            hotkey: "Ctrl+Shift+2".into(),
            speed: 2.0,
            transition_actions: None,
        }];

        save_video_snippets(
            project_path.to_string_lossy().into_owned(),
            snippets.clone(),
        )
        .unwrap();

        let data = open_project(project_path.to_string_lossy().into_owned()).unwrap();
        assert_eq!(data.video_snippets.len(), 1);
        assert_eq!(data.video_snippets[0].title, "Build Demo");
        assert_eq!(data.video_snippets[0].speed, 2.0);
    }

    #[test]
    fn open_nonexistent_project_errors() {
        let result = open_project("/tmp/nonexistent-project-12345".into());
        assert!(result.is_err());
    }

    #[test]
    fn import_video_copies_file() {
        let tmp = TempDir::new().unwrap();
        let project_path = tmp.path().join("test-project");
        create_project(
            project_path.to_string_lossy().into_owned(),
            "Test".into(),
            "Test".into(),
        )
        .unwrap();

        // Create a fake video file
        let source_file = tmp.path().join("test-video.mp4");
        fs::write(&source_file, b"fake video content").unwrap();

        let result = import_video(
            project_path.to_string_lossy().into_owned(),
            source_file.to_string_lossy().into_owned(),
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "videos/test-video.mp4");

        // Verify the file was copied
        assert!(project_path.join("videos/test-video.mp4").exists());
    }

    #[test]
    fn import_video_nonexistent_source_errors() {
        let tmp = TempDir::new().unwrap();
        let project_path = tmp.path().join("test-project");
        create_project(
            project_path.to_string_lossy().into_owned(),
            "Test".into(),
            "Test".into(),
        )
        .unwrap();

        let result = import_video(
            project_path.to_string_lossy().into_owned(),
            "/nonexistent/video.mp4".into(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn delete_video_removes_file() {
        let tmp = TempDir::new().unwrap();
        let project_path = tmp.path().join("test-project");
        create_project(
            project_path.to_string_lossy().into_owned(),
            "Test".into(),
            "Test".into(),
        )
        .unwrap();

        // Create a fake video file
        let video_file = project_path.join("videos").join("test.mp4");
        fs::write(&video_file, b"fake video").unwrap();
        assert!(video_file.exists());

        let result = delete_video(
            project_path.to_string_lossy().into_owned(),
            "videos/test.mp4".into(),
        );
        assert!(result.is_ok());
        assert!(!video_file.exists());
    }

    #[test]
    fn delete_video_removes_thumbnail() {
        let tmp = TempDir::new().unwrap();
        let project_path = tmp.path().join("test-project");
        create_project(
            project_path.to_string_lossy().into_owned(),
            "Test".into(),
            "Test".into(),
        )
        .unwrap();

        let thumbs_dir = project_path.join("videos").join("thumbnails");
        fs::create_dir_all(&thumbs_dir).unwrap();
        let video_file = project_path.join("videos").join("demo.mp4");
        let thumb_file = thumbs_dir.join("demo.jpg");
        fs::write(&video_file, b"fake video").unwrap();
        fs::write(&thumb_file, b"fake thumb").unwrap();

        let result = delete_video(
            project_path.to_string_lossy().into_owned(),
            "videos/demo.mp4".into(),
        );
        assert!(result.is_ok());
        assert!(!video_file.exists());
        assert!(!thumb_file.exists());
    }

    #[test]
    fn delete_video_nonexistent_errors() {
        let tmp = TempDir::new().unwrap();
        let project_path = tmp.path().join("test-project");
        create_project(
            project_path.to_string_lossy().into_owned(),
            "Test".into(),
            "Test".into(),
        )
        .unwrap();

        let result = delete_video(
            project_path.to_string_lossy().into_owned(),
            "videos/nonexistent.mp4".into(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn save_and_load_scripts() {
        let tmp = TempDir::new().unwrap();
        let project_path = tmp.path().join("test-project");
        create_project(
            project_path.to_string_lossy().into_owned(),
            "Test".into(),
            "Test".into(),
        )
        .unwrap();

        let script = Script {
            id: "script-1".into(),
            title: "Build Demo Script".into(),
            description: "Runs a build demo".into(),
            steps: vec![
                crate::models::ScriptStep::Wait { duration: 1000 },
                crate::models::ScriptStep::Type {
                    text: "npm run build".into(),
                    delay: Some(50),
                },
            ],
            output_video: "videos/build-demo.mp4".into(),
        };

        save_script(
            project_path.to_string_lossy().into_owned(),
            script.clone(),
        )
        .unwrap();

        let scripts = load_scripts(project_path.to_string_lossy().into_owned()).unwrap();
        assert_eq!(scripts.len(), 1);
        assert_eq!(scripts[0].id, "script-1");
        assert_eq!(scripts[0].title, "Build Demo Script");
        assert_eq!(scripts[0].steps.len(), 2);
    }

    #[test]
    fn delete_script_removes_file() {
        let tmp = TempDir::new().unwrap();
        let project_path = tmp.path().join("test-project");
        create_project(
            project_path.to_string_lossy().into_owned(),
            "Test".into(),
            "Test".into(),
        )
        .unwrap();

        let script = Script {
            id: "script-del".into(),
            title: "To Delete".into(),
            description: "Will be deleted".into(),
            steps: vec![],
            output_video: "videos/output.mp4".into(),
        };

        save_script(
            project_path.to_string_lossy().into_owned(),
            script,
        )
        .unwrap();

        let scripts = load_scripts(project_path.to_string_lossy().into_owned()).unwrap();
        assert_eq!(scripts.len(), 1);

        delete_script(
            project_path.to_string_lossy().into_owned(),
            "script-del".into(),
        )
        .unwrap();

        let scripts = load_scripts(project_path.to_string_lossy().into_owned()).unwrap();
        assert_eq!(scripts.len(), 0);
    }

    #[test]
    fn load_scripts_empty_dir() {
        let tmp = TempDir::new().unwrap();
        let project_path = tmp.path().join("test-project");
        create_project(
            project_path.to_string_lossy().into_owned(),
            "Test".into(),
            "Test".into(),
        )
        .unwrap();

        let scripts = load_scripts(project_path.to_string_lossy().into_owned()).unwrap();
        assert!(scripts.is_empty());
    }
}
