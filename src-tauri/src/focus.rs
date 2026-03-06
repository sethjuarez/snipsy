use active_win_pos_rs::get_active_window;
use std::thread;
use std::time::Duration;

/// Saved window context for focus restoration
#[derive(Debug, Clone)]
pub struct FocusContext {
    pub window_id: String,
    #[allow(dead_code)]
    pub process_id: u64,
}

/// Capture the currently focused window. Returns None if detection fails.
pub fn capture_focused_window() -> Option<FocusContext> {
    let win = get_active_window().ok()?;
    Some(FocusContext {
        window_id: win.window_id.clone(),
        process_id: win.process_id,
    })
}

/// Check whether the originally focused window is still in front.
pub fn is_still_focused(ctx: &FocusContext) -> bool {
    match get_active_window() {
        Ok(current) => current.window_id == ctx.window_id,
        Err(_) => true, // assume focused if we can't detect
    }
}

/// Attempt to restore focus to the saved window. Returns true on success.
pub fn restore_focus(ctx: &FocusContext) -> bool {
    let ok = platform_restore(ctx);
    if ok {
        // Small sleep to let the OS settle after focus change
        thread::sleep(Duration::from_millis(50));
    }
    ok
}

/// Ensure the target window is focused; restore if stolen.
/// Returns false only if restoration was attempted and failed.
pub fn ensure_focused(ctx: &FocusContext) -> bool {
    if is_still_focused(ctx) {
        return true;
    }
    restore_focus(ctx)
}

// ─── Windows ────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn platform_restore(ctx: &FocusContext) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
        IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };

    let hwnd_val: isize = match ctx.window_id.parse() {
        Ok(v) => v,
        Err(_) => return false,
    };
    let hwnd = HWND(hwnd_val as *mut _);

    unsafe {
        // Restore minimised windows first
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }

        let fg = GetForegroundWindow();
        let fg_thread = GetWindowThreadProcessId(fg, None);
        let cur_thread = GetCurrentThreadId();

        // Attach threads to bypass Windows focus-stealing prevention
        let _ = AttachThreadInput(fg_thread, cur_thread, true);
        let result = SetForegroundWindow(hwnd);
        let _ = AttachThreadInput(fg_thread, cur_thread, false);

        result.as_bool()
    }
}

// ─── macOS ──────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn platform_restore(ctx: &FocusContext) -> bool {
    use std::process::Command;
    let script = format!(
        "tell application \"System Events\" to set frontmost of \
         (first process whose unix id is {}) to true",
        ctx.process_id
    );
    Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// ─── Linux ──────────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn platform_restore(ctx: &FocusContext) -> bool {
    use std::process::Command;
    Command::new("xdotool")
        .args(["windowactivate", &ctx.window_id])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
