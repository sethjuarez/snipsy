use enigo::{Enigo, Keyboard, Settings, Key, Direction};
use std::thread;
use std::time::Duration;

/// Deliver text using fast-type (simulated keystrokes)
pub fn deliver_fast_type(text: &str, type_delay_ms: u32) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create enigo instance: {e}"))?;

    for ch in text.chars() {
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

    Ok(())
}

/// Deliver text using paste (clipboard + Ctrl+V)
pub fn deliver_paste(text: &str) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| format!("Failed to access clipboard: {e}"))?;
    clipboard
        .set_text(text)
        .map_err(|e| format!("Failed to set clipboard text: {e}"))?;

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create enigo instance: {e}"))?;

    // Simulate Ctrl+V (Cmd+V on macOS)
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
