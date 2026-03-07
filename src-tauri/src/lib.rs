mod commands;
mod delivery;
mod demo;
mod elevation;
mod focus;
mod models;
mod playback;
mod scripting;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .manage(demo::AppState::default())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
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
            playback::close_playback_window,
            scripting::run_script,
            scripting::check_ffmpeg,
            scripting::install_ffmpeg,
            tray::activate_demo_tray,
            tray::deactivate_demo_tray,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn app_initializes() {
        assert_eq!(2 + 2, 4);
    }
}
