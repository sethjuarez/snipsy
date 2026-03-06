use enigo::{Enigo, Keyboard, Settings, Key, Direction};
use std::thread;
use std::time::Duration;

use crate::focus;

// ─── Platform input blocking ────────────────────────────────────────────────
// Primary: BlockInput (needs admin). Fallback: ClipCursor (locks mouse in place).

#[cfg(target_os = "windows")]
fn block_input(block: bool) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::Input::KeyboardAndMouse::BlockInput;
    use windows::Win32::UI::WindowsAndMessaging::{ClipCursor, GetCursorPos};
    use windows::Win32::Foundation::RECT;

    unsafe {
        if block {
            // Try BlockInput first (requires admin)
            let blocked = BlockInput(true).is_ok();
            if !blocked {
                // Fallback: lock mouse cursor to a 1px rect at current position
                let mut pt = POINT::default();
                let _ = GetCursorPos(&mut pt);
                let rect = RECT { left: pt.x, top: pt.y, right: pt.x + 1, bottom: pt.y + 1 };
                let _ = ClipCursor(Some(&rect));
            }
        } else {
            // Unblock both — safe to call even if only one was active
            let _ = BlockInput(false);
            let _ = ClipCursor(None); // release cursor constraint
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn block_input(_block: bool) {
    // No equivalent on macOS/Linux — rely on focus restore fallback
}

/// RAII guard that blocks user input on creation and unblocks on drop.
/// Ensures input is always unblocked, even if delivery panics.
struct InputBlock;

impl InputBlock {
    fn new() -> Self {
        block_input(true);
        Self
    }
}

impl Drop for InputBlock {
    fn drop(&mut self) {
        block_input(false);
    }
}

/// Deliver text using fast-type (simulated keystrokes).
/// Blocks user input during delivery so focus can't be stolen.
pub fn deliver_fast_type(text: &str, type_delay_ms: u32) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create enigo instance: {e}"))?;

    // Capture focus context as a safety net for non-Windows platforms
    let focus_ctx = focus::capture_focused_window();

    // Block all user mouse/keyboard input while we type
    let _guard = InputBlock::new();

    for ch in text.chars() {
        // Fallback: re-focus if somehow stolen (non-Windows platforms)
        if let Some(ref ctx) = focus_ctx {
            focus::ensure_focused(ctx);
        }

        if ch == '\n' {
            enigo.key(Key::Return, Direction::Click)
                .map_err(|e| format!("Failed to press Return: {e}"))?;
        } else if ch == '\t' {
            enigo.key(Key::Tab, Direction::Click)
                .map_err(|e| format!("Failed to press Tab: {e}"))?;
        } else {
            enigo.text(&ch.to_string())
                .map_err(|e| format!("Failed to type character '{ch}': {e}"))?;
        }
        thread::sleep(Duration::from_millis(type_delay_ms as u64));
    }

    // _guard drops here → unblocks input
    Ok(())
}

/// Deliver text using paste (clipboard + Ctrl+V).
/// Blocks user input briefly during the paste action.
pub fn deliver_paste(text: &str) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {e}"))?;
    clipboard
        .set_text(text)
        .map_err(|e| format!("Failed to set clipboard text: {e}"))?;

    let focus_ctx = focus::capture_focused_window();
    if let Some(ref ctx) = focus_ctx {
        focus::ensure_focused(ctx);
    }

    let _guard = InputBlock::new();

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create enigo instance: {e}"))?;

    #[cfg(target_os = "macos")]
    {
        enigo.key(Key::Meta, Direction::Press)
            .map_err(|e| format!("Failed to press Meta: {e}"))?;
        enigo.key(Key::Unicode('v'), Direction::Click)
            .map_err(|e| format!("Failed to press V: {e}"))?;
        enigo.key(Key::Meta, Direction::Release)
            .map_err(|e| format!("Failed to release Meta: {e}"))?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        enigo.key(Key::Control, Direction::Press)
            .map_err(|e| format!("Failed to press Control: {e}"))?;
        enigo.key(Key::Unicode('v'), Direction::Click)
            .map_err(|e| format!("Failed to press V: {e}"))?;
        enigo.key(Key::Control, Direction::Release)
            .map_err(|e| format!("Failed to release Control: {e}"))?;
    }

    // _guard drops here → unblocks input
    Ok(())
}

#[tauri::command]
pub fn deliver_text(text: String, method: String, type_delay: Option<u32>) -> Result<(), String> {
    match method.as_str() {
        "fast-type" => deliver_fast_type(&text, type_delay.unwrap_or(30)),
        "paste" => deliver_paste(&text),
        _ => Err(format!("Unknown delivery method: {method}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deliver_text_rejects_unknown_method() {
        let result = deliver_text("hello".into(), "unknown".into(), None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown delivery method"));
    }
}
