use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri_plugin_auditaur::IpcTraceContext;
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
    pub hide_cursor: Option<bool>,
    pub background_color: Option<String>,
    pub click_to_play: Option<bool>,
    pub muted: Option<bool>,
    pub pause_stops: Option<Vec<crate::models::PauseStop>>,
    pub script_id: Option<String>,
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
#[tauri_plugin_auditaur::instrument_ipc(err, skip(app, state))]
pub fn enter_demo_mode(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    hotkeys: Vec<SnippetHotkey>,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<(), String> {
    let mut demo = state.demo.lock().map_err(|e| format!("Lock error: {e}"))?;

    // Clean up any stale registrations from a previous session
    let gs = app.global_shortcut();
    for hk in &demo.registered_hotkeys {
        let _ = gs.unregister(hk.hotkey.as_str());
    }
    crate::keyboard_hook::clear_all_hooks();

    demo.active = true;
    demo.registered_hotkeys = hotkeys.clone();

    let mut registered = 0usize;
    let mut failed = Vec::new();
    for hk in &hotkeys {
        if hk.hotkey.is_empty() {
            continue;
        }
        let Some(action) = hotkey_action(&app, hk) else {
            tracing::warn!(hotkey = %hk.hotkey, snippet_type = %hk.snippet_type, "Unknown hotkey snippet type");
            continue;
        };
        match register_hotkey(&app, hk, action) {
            Ok(()) => registered += 1,
            Err(e) => {
                tracing::error!(hotkey = %hk.hotkey, snippet_id = %hk.id, error = %e, "Hotkey registration failed");
                failed.push(hk.hotkey.clone());
            }
        }
    }
    tracing::info!(registered, failed = failed.len(), "Demo hotkeys registered");

    Ok(())
}

type HotkeyAction = crate::keyboard_hook::HookCallback;

static TEXT_DELIVERY_LOCK: Mutex<()> = Mutex::new(());

/// Build the work a hotkey performs. Actions may block (fast-type), so callers
/// must run them off the main and hook threads.
fn hotkey_action(app: &tauri::AppHandle, hk: &SnippetHotkey) -> Option<HotkeyAction> {
    match hk.snippet_type.as_str() {
        "text" => {
            let text = hk.text.clone().unwrap_or_default();
            let delivery = hk.delivery.clone().unwrap_or_else(|| "fast-type".to_string());
            let type_delay = hk.type_delay;
            Some(std::sync::Arc::new(move || {
                // Serialize deliveries so rapid presses can't interleave keystrokes
                // or release another delivery's input block early.
                let _guard = TEXT_DELIVERY_LOCK.lock().unwrap_or_else(|p| p.into_inner());
                if let Err(e) =
                    crate::delivery::deliver_text(text.clone(), delivery.clone(), type_delay, None)
                {
                    tracing::error!(error = %e, "Text hotkey delivery failed");
                }
            }))
        }
        "video" => {
            let app = app.clone();
            let hk = hk.clone();
            Some(std::sync::Arc::new(move || {
                let app = app.clone();
                let hk = hk.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::playback::play_video(
                        app,
                        hk.project_path,
                        hk.video_file.unwrap_or_default(),
                        hk.start_time.unwrap_or(0.0),
                        hk.end_time.unwrap_or(0.0),
                        hk.speed.unwrap_or(1.0),
                        hk.transition_actions,
                        hk.target_monitor,
                        hk.end_behavior,
                        hk.hide_cursor,
                        hk.background_color,
                        hk.click_to_play,
                        hk.muted,
                        hk.pause_stops,
                        None,
                    )
                    .await
                    {
                        tracing::error!(error = %e, "Video playback hotkey action failed");
                    }
                });
            }))
        }
        "automation" => {
            let project_path = hk.project_path.clone().unwrap_or_default();
            let script_id = hk.script_id.clone().unwrap_or_else(|| hk.id.clone());
            Some(std::sync::Arc::new(move || {
                let project_path = project_path.clone();
                let script_id = script_id.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::scripting::run_automation(project_path, script_id, None).await {
                        tracing::error!(error = %e, "Automation hotkey action failed");
                    }
                });
            }))
        }
        _ => None,
    }
}

/// Register via RegisterHotKey, falling back to the low-level hook when the
/// combo is already owned by another app.
fn register_hotkey(
    app: &tauri::AppHandle,
    hk: &SnippetHotkey,
    action: HotkeyAction,
) -> Result<(), String> {
    let plugin_action = action.clone();
    let hotkey = hk.hotkey.clone();
    let result = app.global_shortcut().on_shortcut(hk.hotkey.as_str(), move |_app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            tracing::info!(hotkey = %hotkey, "Hotkey fired");
            // The plugin calls us on the main thread while holding its own lock;
            // never block it with delivery work.
            let action = plugin_action.clone();
            std::thread::spawn(move || action());
        }
    });

    match result {
        Ok(()) => {
            tracing::info!(hotkey = %hk.hotkey, snippet_type = %hk.snippet_type, "Registered hotkey");
            Ok(())
        }
        Err(e) => {
            tracing::warn!(
                hotkey = %hk.hotkey,
                error = %e,
                "RegisterHotKey failed; falling back to low-level hook"
            );
            crate::keyboard_hook::register_hook_fallback(&hk.hotkey, action)
                .map_err(|fallback| format!("{e}; fallback: {fallback}"))
        }
    }
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(app, state))]
pub fn exit_demo_mode(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<(), String> {
    let mut demo = state.demo.lock().map_err(|e| format!("Lock error: {e}"))?;
    demo.active = false;

    let gs = app.global_shortcut();
    for hk in &demo.registered_hotkeys {
        let _ = gs.unregister(hk.hotkey.as_str());
    }
    demo.registered_hotkeys.clear();

    crate::keyboard_hook::clear_all_hooks();

    Ok(())
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(state))]
pub fn is_demo_mode(
    state: tauri::State<AppState>,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<bool, String> {
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
            hide_cursor: None,
            background_color: None,
            click_to_play: None,
            muted: None,
            pause_stops: None,
            script_id: None,
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
            hide_cursor: Some(true),
            background_color: Some("#1e1e1e".into()),
            click_to_play: Some(false),
            muted: Some(true),
            pause_stops: Some(vec![crate::models::PauseStop {
                time: 12.5,
                label: Some("Explain output".into()),
                spotlight: None,
            }]),
            script_id: None,
        };
        let json = serde_json::to_string(&hotkey).unwrap();
        let deserialized: SnippetHotkey = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "vs-1");
        assert_eq!(deserialized.snippet_type, "video");
        assert_eq!(deserialized.video_file.unwrap(), "videos/demo.mp4");
        assert_eq!(deserialized.speed.unwrap(), 2.0);
        assert_eq!(deserialized.end_behavior.unwrap(), "freeze");
        let pause_stops = deserialized.pause_stops.unwrap();
        assert_eq!(pause_stops.len(), 1);
        assert_eq!(pause_stops[0].time, 12.5);
    }
}
