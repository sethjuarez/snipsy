use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_auditaur::IpcTraceContext;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

const TRAY_ID: &str = "snipsy-tray";

#[cfg(not(target_os = "macos"))]
static ICON_IDLE: &[u8] = include_bytes!("../icons/tray-idle.png");
#[cfg(not(target_os = "macos"))]
static ICON_DEMO: &[u8] = include_bytes!("../icons/tray-demo.png");
#[cfg(target_os = "macos")]
static ICON_IDLE_TEMPLATE: &[u8] = include_bytes!("../icons/tray-idle-template.png");
#[cfg(target_os = "macos")]
static ICON_DEMO_TEMPLATE: &[u8] = include_bytes!("../icons/tray-demo-template.png");

#[cfg(target_os = "macos")]
const TRAY_ICON_AS_TEMPLATE: bool = true;
#[cfg(not(target_os = "macos"))]
const TRAY_ICON_AS_TEMPLATE: bool = false;

#[cfg(target_os = "macos")]
fn idle_icon_bytes() -> &'static [u8] {
    ICON_IDLE_TEMPLATE
}

#[cfg(not(target_os = "macos"))]
fn idle_icon_bytes() -> &'static [u8] {
    ICON_IDLE
}

#[cfg(target_os = "macos")]
fn demo_icon_bytes() -> &'static [u8] {
    ICON_DEMO_TEMPLATE
}

#[cfg(not(target_os = "macos"))]
fn demo_icon_bytes() -> &'static [u8] {
    ICON_DEMO
}

pub fn restore_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    window
        .show()
        .map_err(|e| format!("Failed to show main window: {e}"))?;
    window
        .unminimize()
        .map_err(|e| format!("Failed to unminimize main window: {e}"))?;
    window
        .set_focus()
        .map_err(|e| format!("Failed to focus main window: {e}"))?;

    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StageIndicator {
    None,
    Staged,
    /// Staged, but something needs attention (drift, a failed setting,
    /// keep-awake missing, or an unfinished Stage/Unstage).
    Attention,
}

static DEMO_ACTIVE: AtomicBool = AtomicBool::new(false);
static STAGE_INDICATOR: Mutex<StageIndicator> = Mutex::new(StageIndicator::None);

pub fn set_stage_indicator(status: &crate::stage::StageStatus) {
    use crate::stage::StageState;
    let indicator = match status.state {
        StageState::NotStaged => StageIndicator::None,
        StageState::Staged => StageIndicator::Staged,
        StageState::Degraded | StageState::Staging | StageState::Unstaging => {
            StageIndicator::Attention
        }
    };
    if let Ok(mut current) = STAGE_INDICATOR.lock() {
        *current = indicator;
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct TrayView {
    pub demo_icon: bool,
    pub tooltip: String,
    /// Menu items as (id, label), in order.
    pub items: Vec<(&'static str, &'static str)>,
}

/// What the tray shows for a combination of Demo and Stage.
pub fn tray_view(demo: bool, stage: StageIndicator) -> TrayView {
    let mut tooltip = String::from("Snipsy");
    if demo {
        tooltip.push_str(" — Demo Mode Active");
    }
    match stage {
        StageIndicator::None => {}
        StageIndicator::Staged => tooltip.push_str(if demo { " · Staged" } else { " — Staged" }),
        StageIndicator::Attention => tooltip.push_str(if demo {
            " · Staged (needs attention)"
        } else {
            " — Staged (needs attention)"
        }),
    }
    let mut items = Vec::new();
    if demo {
        items.push(("exit_demo", "Exit Demo Mode"));
    }
    if stage != StageIndicator::None {
        items.push(("unstage", "Unstage"));
    }
    items.push(("show", "Show Snipsy"));
    items.push(("quit", "Quit"));
    TrayView {
        demo_icon: demo,
        tooltip,
        items,
    }
}

fn current_view() -> TrayView {
    let stage = STAGE_INDICATOR
        .lock()
        .map(|s| *s)
        .unwrap_or(StageIndicator::None);
    tray_view(DEMO_ACTIVE.load(Ordering::SeqCst), stage)
}

fn build_menu(app: &tauri::AppHandle, view: &TrayView) -> Result<Menu<tauri::Wry>, String> {
    let menu = Menu::new(app).map_err(|e| format!("Failed to create menu: {e}"))?;
    for (id, label) in &view.items {
        let item = MenuItem::with_id(app, *id, *label, true, None::<&str>)
            .map_err(|e| format!("Failed to create menu item: {e}"))?;
        menu.append(&item)
            .map_err(|e| format!("Failed to create menu: {e}"))?;
    }
    Ok(menu)
}

/// Re-renders the tray from the current Demo and Stage state.
pub fn refresh_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let tray = app.tray_by_id(TRAY_ID).ok_or("Tray icon not found")?;
    let view = current_view();
    let icon_bytes = if view.demo_icon {
        demo_icon_bytes()
    } else {
        idle_icon_bytes()
    };
    let icon =
        Image::from_bytes(icon_bytes).map_err(|e| format!("Failed to load tray icon: {e}"))?;
    tray.set_icon_with_as_template(Some(icon), TRAY_ICON_AS_TEMPLATE)
        .map_err(|e| format!("Failed to set tray icon: {e}"))?;
    tray.set_tooltip(Some(view.tooltip.as_str()))
        .map_err(|e| format!("Failed to set tooltip: {e}"))?;
    let menu = build_menu(app, &view)?;
    tray.set_menu(Some(menu))
        .map_err(|e| format!("Failed to set menu: {e}"))?;
    Ok(())
}

/// Create the always-on tray icon at app startup. Call from `setup()`.
pub fn init_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let view = current_view();
    let menu = build_menu(app, &view)?;
    let icon = Image::from_bytes(idle_icon_bytes())
        .map_err(|e| format!("Failed to load tray icon: {e}"))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(view.tooltip.as_str())
        .icon(icon)
        .icon_as_template(TRAY_ICON_AS_TEMPLATE)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app_handle, event| match event.id.as_ref() {
            "exit_demo" => {
                let _ = app_handle.emit("exit-demo-mode", ());
            }
            "unstage" => {
                let app_handle = app_handle.clone();
                std::thread::spawn(move || crate::stage::unstage_from_tray(&app_handle));
            }
            "show" => {
                if let Err(e) = restore_main_window(app_handle) {
                    tracing::warn!(error = %e, "Failed to restore main window from tray menu");
                }
            }
            "quit" => {
                app_handle.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Left-click only — right-click opens the context menu
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                let app_handle = tray.app_handle();
                if let Err(e) = restore_main_window(app_handle) {
                    tracing::warn!(error = %e, "Failed to restore main window from tray click");
                }
            }
        })
        .build(app)
        .map_err(|e| format!("Failed to build tray icon: {e}"))?;

    Ok(())
}

/// Switch tray to demo-mode appearance (green icon, demo menu, updated tooltip).
#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(app))]
pub fn activate_demo_tray(
    app: tauri::AppHandle,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<(), String> {
    DEMO_ACTIVE.store(true, Ordering::SeqCst);
    refresh_tray(&app)
}

/// Switch tray back to idle appearance. Stage status stays visible.
#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(app))]
pub fn deactivate_demo_tray(
    app: tauri::AppHandle,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<(), String> {
    DEMO_ACTIVE.store(false, Ordering::SeqCst);
    refresh_tray(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(view: &TrayView) -> Vec<&str> {
        view.items.iter().map(|(id, _)| *id).collect()
    }

    #[test]
    fn idle_tray_has_show_and_quit() {
        let view = tray_view(false, StageIndicator::None);
        assert_eq!(view.tooltip, "Snipsy");
        assert_eq!(ids(&view), ["show", "quit"]);
        assert!(!view.demo_icon);
    }

    #[test]
    fn leaving_demo_keeps_stage_visible() {
        let both = tray_view(true, StageIndicator::Staged);
        assert_eq!(both.tooltip, "Snipsy — Demo Mode Active · Staged");
        assert_eq!(ids(&both), ["exit_demo", "unstage", "show", "quit"]);

        let after_demo = tray_view(false, StageIndicator::Staged);
        assert_eq!(after_demo.tooltip, "Snipsy — Staged");
        assert_eq!(ids(&after_demo), ["unstage", "show", "quit"]);
        assert!(!after_demo.demo_icon);
    }

    #[test]
    fn attention_is_called_out() {
        let view = tray_view(false, StageIndicator::Attention);
        assert_eq!(view.tooltip, "Snipsy — Staged (needs attention)");
        assert!(ids(&view).contains(&"unstage"));
    }
}
