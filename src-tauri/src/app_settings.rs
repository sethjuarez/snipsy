//! App-wide settings that the backend needs before (or without) the UI, kept
//! in `<app data dir>/settings.json`.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_auditaur::IpcTraceContext;

pub const MIN_RESTORE_DELAY_MS: u32 = 100;
pub const MAX_RESTORE_DELAY_MS: u32 = 5000;
pub const DEFAULT_RESTORE_DELAY_MS: u32 = 500;
const FILE_NAME: &str = "settings.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    /// Put back what was on the clipboard after Snipsy pastes through it.
    pub restore_clipboard: bool,
    /// How long after the last paste to wait before restoring, so slow
    /// targets (browsers, remote sessions) have read the clipboard.
    pub clipboard_restore_delay_ms: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            restore_clipboard: true,
            clipboard_restore_delay_ms: DEFAULT_RESTORE_DELAY_MS,
        }
    }
}

impl AppSettings {
    fn normalized(mut self) -> Self {
        self.clipboard_restore_delay_ms = self
            .clipboard_restore_delay_ms
            .clamp(MIN_RESTORE_DELAY_MS, MAX_RESTORE_DELAY_MS);
        self
    }
}

static SETTINGS: RwLock<Option<AppSettings>> = RwLock::new(None);
static SETTINGS_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

/// The settings in effect; defaults until [`init`] runs.
pub fn current() -> AppSettings {
    SETTINGS
        .read()
        .map(|settings| settings.unwrap_or_default())
        .unwrap_or_default()
}

fn publish(settings: AppSettings) {
    if let Ok(mut slot) = SETTINGS.write() {
        *slot = Some(settings);
    }
}

/// Reads a settings file, falling back to defaults when it is missing or
/// unreadable so a bad file never stops the app from starting.
pub fn read_file(path: &Path) -> AppSettings {
    match fs::read_to_string(path) {
        Ok(json) => match serde_json::from_str::<AppSettings>(&json) {
            Ok(settings) => settings.normalized(),
            Err(error) => {
                tracing::warn!(%error, path = %path.display(), "Ignoring unreadable app settings");
                AppSettings::default()
            }
        },
        Err(_) => AppSettings::default(),
    }
}

/// Writes atomically so a crash mid-save never leaves half a file.
pub fn write_file(path: &Path, settings: &AppSettings) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Failed to create settings folder: {e}"))?;
    }
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, json).map_err(|e| format!("Failed to write settings: {e}"))?;
    fs::rename(&temp, path).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("Failed to write settings: {e}")
    })
}

/// Loads settings from the app data dir at startup.
pub fn init(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else {
        tracing::warn!("No app data dir; using default app settings");
        return;
    };
    let path = dir.join(FILE_NAME);
    let settings = read_file(&path);
    tracing::info!(
        restore_clipboard = settings.restore_clipboard,
        clipboard_restore_delay_ms = settings.clipboard_restore_delay_ms,
        "App settings loaded"
    );
    publish(settings);
    if let Ok(mut slot) = SETTINGS_PATH.lock() {
        *slot = Some(path);
    }
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub fn get_app_settings(
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<AppSettings, String> {
    Ok(current())
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub fn set_app_settings(
    settings: AppSettings,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<AppSettings, String> {
    let settings = settings.normalized();
    let path = SETTINGS_PATH
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?
        .clone()
        .ok_or("App settings are not available yet.")?;
    write_file(&path, &settings)?;
    publish(settings);
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_or_broken_files_fall_back_to_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(FILE_NAME);
        assert_eq!(read_file(&path), AppSettings::default());
        fs::write(&path, "{not json").unwrap();
        assert_eq!(read_file(&path), AppSettings::default());
        fs::write(&path, r#"{"restoreClipboard":false}"#).unwrap();
        assert_eq!(
            read_file(&path),
            AppSettings {
                restore_clipboard: false,
                clipboard_restore_delay_ms: DEFAULT_RESTORE_DELAY_MS
            }
        );
    }

    #[test]
    fn settings_round_trip_and_clamp_the_delay() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join(FILE_NAME);
        let settings = AppSettings {
            restore_clipboard: false,
            clipboard_restore_delay_ms: 1500,
        };
        write_file(&path, &settings).unwrap();
        assert_eq!(read_file(&path), settings);
        assert!(!path.with_extension("json.tmp").exists());

        fs::write(&path, r#"{"clipboardRestoreDelayMs":5}"#).unwrap();
        assert_eq!(
            read_file(&path).clipboard_restore_delay_ms,
            MIN_RESTORE_DELAY_MS
        );
        fs::write(&path, r#"{"clipboardRestoreDelayMs":999999}"#).unwrap();
        assert_eq!(
            read_file(&path).clipboard_restore_delay_ms,
            MAX_RESTORE_DELAY_MS
        );
    }
}
