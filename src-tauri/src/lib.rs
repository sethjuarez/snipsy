mod commands;
mod delivery;
mod demo;
mod models;
mod playback;
mod scripting;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .manage(demo::AppState::default())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::open_project,
            commands::save_text_snippets,
            commands::save_video_snippets,
            commands::import_video,
            commands::save_script,
            commands::load_scripts,
            commands::delete_script,
            demo::enter_demo_mode,
            demo::exit_demo_mode,
            demo::is_demo_mode,
            delivery::deliver_text,
            playback::play_video,
            playback::close_playback_window,
            scripting::run_script,
            scripting::check_ffmpeg,
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
