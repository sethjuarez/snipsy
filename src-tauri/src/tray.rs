use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, Emitter,
};

pub fn create_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let exit_demo = MenuItem::with_id(app, "exit_demo", "Exit Demo Mode", true, None::<&str>)
        .map_err(|e| format!("Failed to create menu item: {e}"))?;
    let show = MenuItem::with_id(app, "show", "Show Snipsy", true, None::<&str>)
        .map_err(|e| format!("Failed to create menu item: {e}"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
        .map_err(|e| format!("Failed to create menu item: {e}"))?;

    let menu = Menu::with_items(app, &[&exit_demo, &show, &quit])
        .map_err(|e| format!("Failed to create menu: {e}"))?;

    TrayIconBuilder::new()
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
        })
        .build(app)
        .map_err(|e| format!("Failed to build tray icon: {e}"))?;

    Ok(())
}
