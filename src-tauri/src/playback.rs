use serde::Deserialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::models::TransitionAction;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayVideoParams {
    pub video_file: String,
    pub start_time: f64,
    pub end_time: f64,
    pub speed: f64,
    pub transition_actions: Option<Vec<TransitionAction>>,
}

#[tauri::command]
pub async fn play_video(
    app: AppHandle,
    video_file: String,
    start_time: f64,
    end_time: f64,
    speed: f64,
    transition_actions: Option<Vec<TransitionAction>>,
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

    // Schedule transition actions if any
    if let Some(actions) = transition_actions {
        let video_duration = (end_time - start_time) / speed;
        schedule_transition_actions(actions, video_duration);
    }

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

/// Resolves the trigger time for a transition action relative to video duration.
/// "end" → video_duration_secs, numeric string → parsed seconds.
pub fn resolve_trigger_time(trigger_at: &str, video_duration_secs: f64) -> f64 {
    match trigger_at {
        "end" => video_duration_secs,
        s => s.parse::<f64>().unwrap_or(video_duration_secs),
    }
}

/// Executes a single transition action using enigo.
pub fn execute_action(action: &TransitionAction) -> Result<(), String> {
    use enigo::{Enigo, Mouse, Settings};

    match action.action.as_str() {
        "click" => {
            let x = action.x.ok_or("click action requires x coordinate")?;
            let y = action.y.ok_or("click action requires y coordinate")?;
            let mut enigo =
                Enigo::new(&Settings::default()).map_err(|e| format!("enigo error: {}", e))?;
            enigo
                .move_mouse(x, y, enigo::Coordinate::Abs)
                .map_err(|e| format!("move error: {}", e))?;
            enigo
                .button(enigo::Button::Left, enigo::Direction::Click)
                .map_err(|e| format!("click error: {}", e))?;
            Ok(())
        }
        other => Err(format!("Unknown transition action: {}", other)),
    }
}

/// Schedules transition actions on a background thread with sleep-based timing.
fn schedule_transition_actions(actions: Vec<TransitionAction>, video_duration_secs: f64) {
    if actions.is_empty() {
        return;
    }

    let mut timed: Vec<(f64, TransitionAction)> = actions
        .into_iter()
        .map(|a| {
            let t = resolve_trigger_time(&a.trigger_at, video_duration_secs);
            (t, a)
        })
        .collect();

    // Sort by trigger time
    timed.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    std::thread::spawn(move || {
        let mut elapsed = 0.0_f64;
        for (trigger_time, action) in timed {
            let wait = (trigger_time - elapsed).max(0.0);
            if wait > 0.0 {
                std::thread::sleep(std::time::Duration::from_secs_f64(wait));
            }
            elapsed = trigger_time;

            if let Err(e) = execute_action(&action) {
                eprintln!("Transition action error: {}", e);
            }
        }
    });
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
            "speed": 1.5,
            "transitionActions": [
                { "triggerAt": "end", "action": "click", "x": 100, "y": 200 }
            ]
        }"#;
        let params: PlayVideoParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.video_file, "demo.mp4");
        assert_eq!(params.start_time, 0.0);
        assert_eq!(params.end_time, 30.5);
        assert_eq!(params.speed, 1.5);
        assert!(params.transition_actions.is_some());
        let actions = params.transition_actions.unwrap();
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action, "click");
    }

    #[test]
    fn test_resolve_trigger_time_end() {
        assert_eq!(resolve_trigger_time("end", 30.0), 30.0);
    }

    #[test]
    fn test_resolve_trigger_time_numeric() {
        assert_eq!(resolve_trigger_time("15.5", 30.0), 15.5);
    }

    #[test]
    fn test_resolve_trigger_time_invalid() {
        // Invalid strings fall back to video duration
        assert_eq!(resolve_trigger_time("invalid", 30.0), 30.0);
    }

    #[test]
    fn test_execute_action_unknown() {
        let action = TransitionAction {
            trigger_at: "end".to_string(),
            action: "unknown".to_string(),
            x: None,
            y: None,
        };
        let result = execute_action(&action);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown transition action"));
    }

    #[test]
    fn test_execute_action_click_missing_coords() {
        let action = TransitionAction {
            trigger_at: "end".to_string(),
            action: "click".to_string(),
            x: None,
            y: Some(100),
        };
        let result = execute_action(&action);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("requires x coordinate"));
    }
}
