use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_auditaur::IpcTraceContext;

use crate::models::{PauseStop, TransitionAction};

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(app))]
pub async fn play_video(
    app: AppHandle,
    project_path: Option<String>,
    video_file: String,
    start_time: f64,
    end_time: f64,
    speed: f64,
    transition_actions: Option<Vec<TransitionAction>>,
    target_monitor: Option<String>,
    end_behavior: Option<String>,
    hide_cursor: Option<bool>,
    background_color: Option<String>,
    click_to_play: Option<bool>,
    muted: Option<bool>,
    pause_stops: Option<Vec<PauseStop>>,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<(), String> {
    // Close existing playback window if any
    if let Some(existing) = app.get_webview_window("playback") {
        let _ = existing.destroy();
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    // Resolve to absolute path so the webview can load it via asset protocol
    let abs_path = if std::path::Path::new(&video_file).is_absolute() {
        video_file.clone()
    } else if let Some(ref pp) = project_path {
        let resolved = std::path::PathBuf::from(pp).join(&video_file);
        resolved.to_string_lossy().into_owned()
    } else {
        video_file.clone()
    };

    let eb = end_behavior.as_deref().unwrap_or("close");
    let bg = background_color.as_deref().unwrap_or("#000000");
    let pause_stops_json = pause_stops
        .as_ref()
        .filter(|stops| !stops.is_empty())
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| format!("Failed to serialize pause stops: {}", e))?
        .unwrap_or_default();
    let url = build_playback_url(
        &abs_path,
        start_time,
        end_time,
        speed,
        eb,
        hide_cursor.unwrap_or(true),
        bg,
        click_to_play.unwrap_or(false),
        muted.unwrap_or(true),
        &pause_stops_json,
    );

    create_playback_window(
        app,
        url,
        target_monitor,
        bg,
        hide_cursor.unwrap_or(true),
        transition_actions,
        (end_time - start_time) / speed,
    )
    .await
}

async fn create_playback_window(
    app: AppHandle,
    url: String,
    target_monitor: Option<String>,
    background_color: &str,
    hide_cursor: bool,
    transition_actions: Option<Vec<TransitionAction>>,
    video_duration: f64,
) -> Result<(), String> {
    let init_script = format!(
        "window.__IS_PLAYBACK = true;\
         document.documentElement.style.background = '{background_color}';\
         document.body.style.background = '{background_color}';",
    );

    let mut builder = WebviewWindowBuilder::new(&app, "playback", WebviewUrl::App(url.into()))
        .initialization_script(&init_script)
        .title("Snipsy Playback")
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .focused(true)
        .skip_taskbar(true)
        .visible(false);

    #[cfg(target_os = "macos")]
    {
        builder = builder.visible_on_all_workspaces(true);
    }

    // Position on selected monitor, or default to fullscreen on primary
    let mut positioned_on_target_monitor = false;
    if let Some(ref mon_name) = target_monitor {
        if let Ok(monitors) = xcap::Monitor::all() {
            if let Some(mon) = monitors
                .iter()
                .find(|m| m.name().unwrap_or_default() == *mon_name)
            {
                let x = mon.x().unwrap_or(0);
                let y = mon.y().unwrap_or(0);
                let scale = mon.scale_factor().unwrap_or(1.0) as f64;

                // xcap returns physical coords; Tauri position() takes logical coords.
                let logical_x = x as f64 / scale;
                let logical_y = y as f64 / scale;

                builder = builder.position(logical_x, logical_y);
                positioned_on_target_monitor = true;
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = positioned_on_target_monitor;
        builder = builder.fullscreen(true);
    }

    let window = builder
        .build()
        .map_err(|e| format!("Failed to create playback window: {}", e))?;

    apply_playback_fullscreen(&window)?;
    tracing::info!(
        target_monitor = target_monitor.as_deref().unwrap_or("primary"),
        positioned_on_target_monitor,
        "Playback window created fullscreen"
    );

    // Use native cursor visibility so the OS hides/shows the cursor reliably
    let _ = window.set_cursor_visible(!hide_cursor);

    // Schedule transition actions if any
    if let Some(actions) = transition_actions {
        schedule_transition_actions(actions, video_duration);
    }

    Ok(())
}

fn apply_playback_fullscreen(window: &WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return window
            .set_simple_fullscreen(true)
            .map_err(|e| format!("Failed to fullscreen playback window: {}", e));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Ok(())
    }
}

fn build_playback_url(
    abs_path: &str,
    start_time: f64,
    end_time: f64,
    speed: f64,
    end_behavior: &str,
    hide_cursor: bool,
    background_color: &str,
    click_to_play: bool,
    muted: bool,
    pause_stops_json: &str,
) -> String {
    format!(
        "/playback?file={}&start={}&end={}&speed={}&endBehavior={}&hideCursor={}&bg={}&clickToPlay={}&muted={}&pauseStops={}",
        urlencoded(&abs_path),
        start_time,
        end_time,
        speed,
        end_behavior,
        hide_cursor,
        urlencoded(background_color),
        click_to_play,
        muted,
        urlencoded(pause_stops_json)
    )
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(app))]
pub async fn show_playback_window(
    app: AppHandle,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("playback") {
        window
            .show()
            .map_err(|e| format!("Failed to show playback window: {}", e))?;
        // Ensure the window has keyboard focus so Escape and other keys work
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(app))]
pub async fn close_playback_window(
    app: AppHandle,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<(), String> {
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
                tracing::error!(error = %e, "Transition action failed");
            }
        }
    });
}

fn urlencoded(s: &str) -> String {
    s.replace('%', "%25")
        .replace(' ', "%20")
        .replace('"', "%22")
        .replace('&', "%26")
        .replace('=', "%3D")
        .replace('#', "%23")
        .replace('?', "%3F")
        .replace('[', "%5B")
        .replace(']', "%5D")
        .replace('{', "%7B")
        .replace('}', "%7D")
        .replace(':', "%3A")
        .replace(',', "%2C")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PlayVideoParams {
        video_file: String,
        start_time: f64,
        end_time: f64,
        speed: f64,
        transition_actions: Option<Vec<TransitionAction>>,
        pause_stops: Option<Vec<PauseStop>>,
    }

    #[test]
    fn test_urlencoded() {
        assert_eq!(urlencoded("test file.mp4"), "test%20file.mp4");
        assert_eq!(urlencoded("a&b=c"), "a%26b%3Dc");
        assert_eq!(
            urlencoded(r#"[{"time":10.5,"label":"Explain"}]"#),
            "%5B%7B%22time%22%3A10.5%2C%22label%22%3A%22Explain%22%7D%5D"
        );
    }

    #[test]
    fn test_build_playback_url_uses_boolean_values() {
        let url = build_playback_url(
            "/tmp/demo clip.mp4",
            1.25,
            5.5,
            1.0,
            "freeze",
            false,
            "#101010",
            true,
            false,
            r#"[{"time":2}]"#,
        );

        assert_eq!(
            url,
            "/playback?file=/tmp/demo%20clip.mp4&start=1.25&end=5.5&speed=1&endBehavior=freeze&hideCursor=false&bg=%23101010&clickToPlay=true&muted=false&pauseStops=%5B%7B%22time%22%3A2%7D%5D"
        );
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
            ],
            "pauseStops": [
                { "time": 10.5, "label": "Explain result" }
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
        let stops = params.pause_stops.unwrap();
        assert_eq!(stops.len(), 1);
        assert_eq!(stops[0].time, 10.5);
        assert_eq!(stops[0].label.as_deref(), Some("Explain result"));
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
