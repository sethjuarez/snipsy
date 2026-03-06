use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, Emitter,
};

const TRAY_ID: &str = "demo-tray";

/// Create the tray if it doesn't exist yet, then make it visible.
fn ensure_tray_visible(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        // Already exists — just show it
        tray.set_visible(true)
            .map_err(|e| format!("Failed to show tray: {e}"))?;
        return Ok(());
    }

    let exit_demo = MenuItem::with_id(app, "exit_demo", "Exit Demo Mode", true, None::<&str>)
        .map_err(|e| format!("Failed to create menu item: {e}"))?;
    let show = MenuItem::with_id(app, "show", "Show Snipsy", true, None::<&str>)
        .map_err(|e| format!("Failed to create menu item: {e}"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
        .map_err(|e| format!("Failed to create menu item: {e}"))?;

    let menu = Menu::with_items(app, &[&exit_demo, &show, &quit])
        .map_err(|e| format!("Failed to create menu: {e}"))?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Snipsy — Demo Mode Active")
        .menu(&menu)
        .on_menu_event(move |app_handle, event| match event.id.as_ref() {
            "exit_demo" => {
                let _ = app_handle.emit("exit-demo-mode", ());
            }
            "show" => {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app_handle.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                let app_handle = tray.app_handle();
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });

    // Use the app's default window icon for the tray
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder
        .build(app)
        .map_err(|e| format!("Failed to build tray icon: {e}"))?;

    Ok(())
}

fn hide_tray(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_visible(false)
            .map_err(|e| format!("Failed to hide tray: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn activate_demo_tray(app: tauri::AppHandle) -> Result<(), String> {
    ensure_tray_visible(&app)
}

#[tauri::command]
pub fn deactivate_demo_tray(app: tauri::AppHandle) -> Result<(), String> {
    hide_tray(&app)
}
