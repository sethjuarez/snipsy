use serde::Deserialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayVideoParams {
    pub video_file: String,
    pub start_time: f64,
    pub end_time: f64,
    pub speed: f64,
}

#[tauri::command]
pub async fn play_video(
    app: AppHandle,
    video_file: String,
    start_time: f64,
    end_time: f64,
    speed: f64,
) -> Result<(), String> {
    // Close existing playback window if any
    if let Some(existing) = app.get_webview_window("playback") {
        let _ = existing.destroy();
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    let url = format!(
        "/playback?file={}&start={}&end={}&speed={}",
        urlencoded(&video_file),
        start_time,
        end_time,
        speed
    );

    WebviewWindowBuilder::new(&app, "playback", WebviewUrl::App(url.into()))
        .initialization_script("window.__IS_PLAYBACK = true;")
        .title("Snipsy Playback")
        .decorations(false)
        .always_on_top(true)
        .fullscreen(true)
        .resizable(false)
        .focused(true)
        .skip_taskbar(true)
        .build()
        .map_err(|e| format!("Failed to create playback window: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn close_playback_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("playback") {
        window
            .destroy()
            .map_err(|e| format!("Failed to close playback window: {}", e))?;
    }
    Ok(())
}

fn urlencoded(s: &str) -> String {
    s.replace('%', "%25")
        .replace(' ', "%20")
        .replace('&', "%26")
        .replace('=', "%3D")
        .replace('#', "%23")
        .replace('?', "%3F")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_urlencoded() {
        assert_eq!(urlencoded("test file.mp4"), "test%20file.mp4");
        assert_eq!(urlencoded("a&b=c"), "a%26b%3Dc");
    }

    #[test]
    fn test_play_video_params_deserialize() {
        let json = r#"{
            "videoFile": "demo.mp4",
            "startTime": 0.0,
            "endTime": 30.5,
            "speed": 1.5
        }"#;
        let params: PlayVideoParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.video_file, "demo.mp4");
        assert_eq!(params.start_time, 0.0);
        assert_eq!(params.end_time, 30.5);
        assert_eq!(params.speed, 1.5);
    }
}
