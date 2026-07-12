use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_auditaur::IpcTraceContext;

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

/// Build the idle-mode menu (Show + Quit).
fn build_idle_menu(app: &tauri::AppHandle) -> Result<Menu<tauri::Wry>, String> {
    let show = MenuItem::with_id(app, "show", "Show Snipsy", true, None::<&str>)
        .map_err(|e| format!("Failed to create menu item: {e}"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
        .map_err(|e| format!("Failed to create menu item: {e}"))?;
    Menu::with_items(app, &[&show, &quit]).map_err(|e| format!("Failed to create menu: {e}"))
}

/// Build the demo-mode menu (Exit Demo + Show + Quit).
fn build_demo_menu(app: &tauri::AppHandle) -> Result<Menu<tauri::Wry>, String> {
    let exit_demo = MenuItem::with_id(app, "exit_demo", "Exit Demo Mode", true, None::<&str>)
        .map_err(|e| format!("Failed to create menu item: {e}"))?;
    let show = MenuItem::with_id(app, "show", "Show Snipsy", true, None::<&str>)
        .map_err(|e| format!("Failed to create menu item: {e}"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
        .map_err(|e| format!("Failed to create menu item: {e}"))?;
    Menu::with_items(app, &[&exit_demo, &show, &quit])
        .map_err(|e| format!("Failed to create menu: {e}"))
}

/// Create the always-on tray icon at app startup. Call from `setup()`.
pub fn init_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let menu = build_idle_menu(app)?;
    let icon = Image::from_bytes(idle_icon_bytes())
        .map_err(|e| format!("Failed to load tray icon: {e}"))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Snipsy")
        .icon(icon)
        .icon_as_template(TRAY_ICON_AS_TEMPLATE)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app_handle, event| match event.id.as_ref() {
            "exit_demo" => {
                let _ = app_handle.emit("exit-demo-mode", ());
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
    let tray = app.tray_by_id(TRAY_ID).ok_or("Tray icon not found")?;
    let icon = Image::from_bytes(demo_icon_bytes())
        .map_err(|e| format!("Failed to load demo icon: {e}"))?;
    tray.set_icon_with_as_template(Some(icon), TRAY_ICON_AS_TEMPLATE)
        .map_err(|e| format!("Failed to set tray icon: {e}"))?;
    tray.set_tooltip(Some("Snipsy — Demo Mode Active"))
        .map_err(|e| format!("Failed to set tooltip: {e}"))?;
    let menu = build_demo_menu(&app)?;
    tray.set_menu(Some(menu))
        .map_err(|e| format!("Failed to set menu: {e}"))?;
    Ok(())
}

/// Switch tray back to idle appearance (purple icon, idle menu).
#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(app))]
pub fn deactivate_demo_tray(
    app: tauri::AppHandle,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<(), String> {
    let tray = app.tray_by_id(TRAY_ID).ok_or("Tray icon not found")?;
    let icon = Image::from_bytes(idle_icon_bytes())
        .map_err(|e| format!("Failed to load idle icon: {e}"))?;
    tray.set_icon_with_as_template(Some(icon), TRAY_ICON_AS_TEMPLATE)
        .map_err(|e| format!("Failed to set tray icon: {e}"))?;
    tray.set_tooltip(Some("Snipsy"))
        .map_err(|e| format!("Failed to set tooltip: {e}"))?;
    let menu = build_idle_menu(&app)?;
    tray.set_menu(Some(menu))
        .map_err(|e| format!("Failed to set menu: {e}"))?;
    Ok(())
}
