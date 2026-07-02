/// Elevation detection and relaunch-as-admin support.
/// On Windows, BlockInput requires admin privileges to block mouse/keyboard during delivery.
use tauri_plugin_auditaur::IpcTraceContext;

#[cfg(target_os = "windows")]
pub fn check_elevated() -> bool {
    use windows::Win32::UI::Shell::IsUserAnAdmin;
    unsafe { IsUserAnAdmin().as_bool() }
}

#[cfg(not(target_os = "windows"))]
pub fn check_elevated() -> bool {
    // On macOS/Linux, focus lock doesn't require elevation
    true
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc]
pub fn is_elevated(auditaur_trace_context: Option<IpcTraceContext>) -> bool {
    check_elevated()
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub fn relaunch_as_admin(auditaur_trace_context: Option<IpcTraceContext>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        fn to_wide(s: &OsStr) -> Vec<u16> {
            s.encode_wide().chain(std::iter::once(0)).collect()
        }

        let exe =
            std::env::current_exe().map_err(|e| format!("Failed to get current exe path: {e}"))?;

        let verb = to_wide(OsStr::new("runas"));
        let file = to_wide(exe.as_os_str());
        let params = to_wide(OsStr::new("--elevated"));

        unsafe {
            let result = ShellExecuteW(
                None,
                PCWSTR(verb.as_ptr()),
                PCWSTR(file.as_ptr()),
                PCWSTR(params.as_ptr()),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            );

            // ShellExecuteW returns HINSTANCE; values > 32 indicate success
            if (result.0 as isize) <= 32 {
                return Err(
                    "Failed to relaunch as administrator. The UAC prompt may have been cancelled."
                        .into(),
                );
            }
        }

        // Exit current (non-elevated) process
        std::process::exit(0);
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Elevation is only applicable on Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_elevated_returns_bool() {
        // Just verify it doesn't panic
        let _ = check_elevated();
    }
}
