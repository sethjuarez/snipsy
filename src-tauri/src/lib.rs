mod commands;
mod models;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::open_project,
            commands::save_text_snippets,
            commands::save_video_snippets,
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
