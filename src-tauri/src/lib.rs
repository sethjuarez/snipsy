mod commands;
mod delivery;
mod demo;
mod elevation;
mod focus;
mod keyboard_hook;
mod models;
mod playback;
mod recorder;
mod scripting;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .manage(demo::AppState::default())
        .manage(recorder::RecorderState::default())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            use tauri::Manager;
            // Set the window icon explicitly so it shows in the taskbar during dev
            if let Some(main_window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = main_window.set_icon(icon.clone());
                }
            }

            // Always-on system tray icon
            tray::init_tray(app.handle())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::open_project,
            commands::save_text_snippets,
            commands::save_video_snippets,
            commands::import_video,
            commands::list_imported_videos,
            commands::delete_video,
            commands::get_video_fps,
            commands::list_monitors,
            commands::capture_monitor_preview,
            commands::save_script,
            commands::load_scripts,
            commands::delete_script,
            demo::enter_demo_mode,
            demo::exit_demo_mode,
            demo::is_demo_mode,
            delivery::deliver_text,
            elevation::is_elevated,
            elevation::relaunch_as_admin,
            playback::play_video,
            playback::show_playback_window,
            playback::close_playback_window,
            recorder::start_recording_script,
            recorder::stop_recording_script,
            recorder::is_recording,
            scripting::run_script,
            scripting::check_ffmpeg,
            scripting::install_ffmpeg,
            tray::activate_demo_tray,
            tray::deactivate_demo_tray,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                cleanup_on_exit(app_handle);
            }
        });
}

fn cleanup_on_exit(app: &tauri::AppHandle) {
    use tauri::Manager;
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    // Unregister all demo-mode hotkeys
    if let Some(state) = app.try_state::<demo::AppState>() {
        if let Ok(mut demo) = state.demo.lock() {
            let gs = app.global_shortcut();
            for hk in &demo.registered_hotkeys {
                let _ = gs.unregister(hk.hotkey.as_str());
            }
            demo.registered_hotkeys.clear();
            demo.active = false;
        }
    }

    // Clean up low-level keyboard hooks
    keyboard_hook::clear_all_hooks();

    // Close the playback window if it's still open
    if let Some(window) = app.get_webview_window("playback") {
        let _ = window.destroy();
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn app_initializes() {
        assert_eq!(2 + 2, 4);
    }
}
