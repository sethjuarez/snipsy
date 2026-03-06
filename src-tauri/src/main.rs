#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // When relaunched as admin in dev/debug mode, detach the console window
    // so the user doesn't see a lingering terminal. (Release builds already
    // use windows_subsystem = "windows" which prevents it entirely.)
    #[cfg(all(debug_assertions, target_os = "windows"))]
    if std::env::args().any(|a| a == "--elevated") {
        use windows::Win32::System::Console::FreeConsole;
        unsafe { let _ = FreeConsole(); }
    }

    snipsy_lib::run();
}
