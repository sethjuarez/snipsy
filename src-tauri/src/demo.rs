use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// A snippet hotkey registration for demo mode
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetHotkey {
    pub id: String,
    pub hotkey: String,
    pub snippet_type: String,
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
    state: tauri::State<AppState>,
    hotkeys: Vec<SnippetHotkey>,
) -> Result<(), String> {
    let mut demo = state.demo.lock().map_err(|e| format!("Lock error: {e}"))?;
    demo.active = true;
    demo.registered_hotkeys = hotkeys;
    Ok(())
}

#[tauri::command]
pub fn exit_demo_mode(state: tauri::State<AppState>) -> Result<(), String> {
    let mut demo = state.demo.lock().map_err(|e| format!("Lock error: {e}"))?;
    demo.active = false;
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
        };
        let json = serde_json::to_string(&hotkey).unwrap();
        let deserialized: SnippetHotkey = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "ts-1");
        assert_eq!(deserialized.snippet_type, "text");
    }
}
