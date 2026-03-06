use std::fs;
use std::path::PathBuf;

use crate::models::{Project, ProjectData, TextSnippet, VideoSnippet};

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

    Ok(format!("videos/{file_name}"))
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
}
