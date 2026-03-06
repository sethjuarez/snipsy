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
        }
        // Video snippets will emit events to the frontend
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
        };
        let json = serde_json::to_string(&hotkey).unwrap();
        let deserialized: SnippetHotkey = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "ts-1");
        assert_eq!(deserialized.snippet_type, "text");
        assert_eq!(deserialized.text.unwrap(), "hello world");
    }
}
