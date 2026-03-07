use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// A snippet hotkey registration for demo mode
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetHotkey {
    pub id: String,
    pub hotkey: String,
    pub snippet_type: String,
    // Text snippet delivery data
    pub text: Option<String>,
    pub delivery: Option<String>,
    pub type_delay: Option<u32>,
    // Video snippet playback data
    pub project_path: Option<String>,
    pub video_file: Option<String>,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
    pub speed: Option<f64>,
    pub transition_actions: Option<Vec<crate::models::TransitionAction>>,
    pub target_monitor: Option<String>,
    pub end_behavior: Option<String>,
}

/// State tracking for demo mode
pub struct DemoState {
    pub active: bool,
    pub registered_hotkeys: Vec<SnippetHotkey>,
}

impl Default for DemoState {
    fn default() -> Self {
        Self {
            active: false,
            registered_hotkeys: Vec::new(),
        }
    }
}

/// Managed app state
pub struct AppState {
    pub demo: Mutex<DemoState>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            demo: Mutex::new(DemoState::default()),
        }
    }
}

#[tauri::command]
pub fn enter_demo_mode(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    hotkeys: Vec<SnippetHotkey>,
) -> Result<(), String> {
    let mut demo = state.demo.lock().map_err(|e| format!("Lock error: {e}"))?;
    demo.active = true;
    demo.registered_hotkeys = hotkeys.clone();

    let gs = app.global_shortcut();

    for hk in &hotkeys {
        // Skip snippets with empty hotkeys
        if hk.hotkey.is_empty() {
            continue;
        }

        if hk.snippet_type == "text" {
            let text = hk.text.clone().unwrap_or_default();
            let delivery = hk.delivery.clone().unwrap_or_else(|| "fast-type".to_string());
            let type_delay = hk.type_delay;

            if let Err(e) = gs.on_shortcut(hk.hotkey.as_str(), move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = crate::delivery::deliver_text(
                        text.clone(),
                        delivery.clone(),
                        type_delay,
                    );
                }
            }) {
                eprintln!("Warning: could not register hotkey '{}': {e}", hk.hotkey);
            }
        } else if hk.snippet_type == "video" {
            let project_path = hk.project_path.clone();
            let video_file = hk.video_file.clone().unwrap_or_default();
            let start_time = hk.start_time.unwrap_or(0.0);
            let end_time = hk.end_time.unwrap_or(0.0);
            let speed = hk.speed.unwrap_or(1.0);
            let transition_actions = hk.transition_actions.clone();
            let target_monitor = hk.target_monitor.clone();
            let end_behavior = hk.end_behavior.clone();

            if let Err(e) = gs.on_shortcut(hk.hotkey.as_str(), move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let app = app.clone();
                    let project_path = project_path.clone();
                    let video_file = video_file.clone();
                    let transition_actions = transition_actions.clone();
                    let target_monitor = target_monitor.clone();
                    let end_behavior = end_behavior.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = crate::playback::play_video(
                            app,
                            project_path,
                            video_file,
                            start_time,
                            end_time,
                            speed,
                            transition_actions,
                            target_monitor,
                            end_behavior,
                        )
                        .await
                        {
                            eprintln!("Video playback error: {e}");
                        }
                    });
                }
            }) {
                eprintln!("Warning: could not register hotkey '{}': {e}", hk.hotkey);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn exit_demo_mode(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let mut demo = state.demo.lock().map_err(|e| format!("Lock error: {e}"))?;
    demo.active = false;

    let gs = app.global_shortcut();
    for hk in &demo.registered_hotkeys {
        let _ = gs.unregister(hk.hotkey.as_str());
    }
    demo.registered_hotkeys.clear();

    Ok(())
}

#[tauri::command]
pub fn is_demo_mode(state: tauri::State<AppState>) -> Result<bool, String> {
    let demo = state.demo.lock().map_err(|e| format!("Lock error: {e}"))?;
    Ok(demo.active)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn demo_state_default() {
        let state = DemoState::default();
        assert!(!state.active);
        assert!(state.registered_hotkeys.is_empty());
    }

    #[test]
    fn snippet_hotkey_serialization() {
        let hotkey = SnippetHotkey {
            id: "ts-1".into(),
            hotkey: "CmdOrControl+Shift+1".into(),
            snippet_type: "text".into(),
            text: Some("hello world".into()),
            delivery: Some("fast-type".into()),
            type_delay: Some(30),
            project_path: None,
            video_file: None,
            start_time: None,
            end_time: None,
            speed: None,
            transition_actions: None,
            target_monitor: None,
            end_behavior: None,
        };
        let json = serde_json::to_string(&hotkey).unwrap();
        let deserialized: SnippetHotkey = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "ts-1");
        assert_eq!(deserialized.snippet_type, "text");
        assert_eq!(deserialized.text.unwrap(), "hello world");
    }

    #[test]
    fn video_hotkey_serialization() {
        let hotkey = SnippetHotkey {
            id: "vs-1".into(),
            hotkey: "CmdOrControl+Shift+2".into(),
            snippet_type: "video".into(),
            text: None,
            delivery: None,
            type_delay: None,
            project_path: Some("/path/to/project".into()),
            video_file: Some("videos/demo.mp4".into()),
            start_time: Some(5.0),
            end_time: Some(30.0),
            speed: Some(2.0),
            transition_actions: None,
            target_monitor: Some("Primary Monitor".into()),
            end_behavior: Some("freeze".into()),
        };
        let json = serde_json::to_string(&hotkey).unwrap();
        let deserialized: SnippetHotkey = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "vs-1");
        assert_eq!(deserialized.snippet_type, "video");
        assert_eq!(deserialized.video_file.unwrap(), "videos/demo.mp4");
        assert_eq!(deserialized.speed.unwrap(), 2.0);
        assert_eq!(deserialized.end_behavior.unwrap(), "freeze");
    }
}
