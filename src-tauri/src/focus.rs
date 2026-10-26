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

/// A restored window gets this long to settle before each check, up to
/// `RESTORE_CHECKS` times.
const RESTORE_CHECK_INTERVAL: Duration = Duration::from_millis(50);
const RESTORE_CHECKS: u32 = 4;

/// Whether the saved window is in front, or `None` when the foreground window
/// can't be read (for example, while activation is changing).
fn focus_state(ctx: &FocusContext) -> Option<bool> {
    get_active_window()
        .ok()
        .map(|current| current.window_id == ctx.window_id)
}

/// Attempt to restore focus to the saved window. Returns true only when the
/// window is confirmed in front again.
pub fn restore_focus(ctx: &FocusContext) -> bool {
    platform_restore(ctx) && wait_for_focus(|| focus_state(ctx), RESTORE_CHECK_INTERVAL)
}

/// Checks a few times for the restored window. Activation can be slow, be
/// redirected (for example to a modal dialog), or briefly leave no window in
/// front, so only a confirmed match counts.
fn wait_for_focus(mut read: impl FnMut() -> Option<bool>, interval: Duration) -> bool {
    for _ in 0..RESTORE_CHECKS {
        thread::sleep(interval);
        if read() == Some(true) {
            return true;
        }
    }
    false
}

/// Ensure the saved window is in front, restoring it when another window, or
/// none, is. Returns true only when the window is confirmed in front.
pub fn ensure_focused(ctx: &FocusContext) -> bool {
    focus_state(ctx) == Some(true) || restore_focus(ctx)
}

// ─── Windows ────────────────────────────────────────────────────────────────

/// Reads the handle from a Windows window id. `active-win-pos-rs` reports the
/// `Debug` form, `HWND(<decimal>)`; hex covers newer `windows` crate versions.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn parse_hwnd(window_id: &str) -> Option<isize> {
    let id = window_id.trim();
    let raw = id
        .strip_prefix("HWND(")
        .and_then(|rest| rest.strip_suffix(')'))
        .unwrap_or(id)
        .trim();
    let value = match raw.strip_prefix("0x").or_else(|| raw.strip_prefix("0X")) {
        Some(hex) => usize::from_str_radix(hex, 16).ok()? as isize,
        None => raw.parse::<isize>().ok()?,
    };
    (value != 0).then_some(value)
}

#[cfg(target_os = "windows")]
fn platform_restore(ctx: &FocusContext) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
        IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };

    let Some(hwnd_val) = parse_hwnd(&ctx.window_id) else {
        tracing::warn!(window_id = %ctx.window_id, "Unrecognized window id; cannot restore focus");
        return false;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_window_ids_from_active_win() {
        assert_eq!(parse_hwnd("HWND(1508212)"), Some(1_508_212));
        assert_eq!(parse_hwnd(" HWND(-42) "), Some(-42));
        assert_eq!(parse_hwnd("HWND(0x1a2b)"), Some(0x1a2b));
        assert_eq!(parse_hwnd("917"), Some(917));
    }

    #[test]
    fn rejects_null_and_malformed_window_ids() {
        for id in [
            "",
            "HWND(0)",
            "HWND()",
            "HWND(abc)",
            "HWND(12",
            "0x",
            "HWND(0xzz)",
        ] {
            assert_eq!(parse_hwnd(id), None, "{id:?}");
        }
    }

    #[test]
    fn unknown_focus_is_never_confirmed() {
        let mut checks = 0;
        let read = || {
            checks += 1;
            None
        };
        assert!(!wait_for_focus(read, Duration::ZERO));
        assert_eq!(checks, RESTORE_CHECKS);
    }

    #[test]
    fn restore_waits_for_a_confirmed_match() {
        let mut readings = [None, Some(false), Some(true)].into_iter();
        assert!(wait_for_focus(|| readings.next().flatten(), Duration::ZERO));
    }

    #[test]
    fn focus_redirected_elsewhere_is_not_confirmed() {
        assert!(!wait_for_focus(|| Some(false), Duration::ZERO));
    }

    /// Pins the id format of the installed `active-win-pos-rs`, when a window is in front.
    #[test]
    #[cfg(target_os = "windows")]
    fn active_window_ids_are_parseable() {
        if let Some(ctx) = capture_focused_window() {
            assert!(parse_hwnd(&ctx.window_id).is_some(), "{}", ctx.window_id);
        }
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn restoring_a_window_that_cannot_come_forward_fails() {
        let missing = FocusContext {
            window_id: "HWND(1)".into(),
            process_id: 0,
        };
        assert!(!restore_focus(&missing));
    }
}
