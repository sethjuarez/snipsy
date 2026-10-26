use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;

use crate::focus;
use crate::typing::{self, Action, FastTypeOptions, Step};
use tauri_plugin_auditaur::IpcTraceContext;

const MAX_CLEANUP_DELAY_MS: u32 = 20;

// ─── Platform input blocking ────────────────────────────────────────────────
// Primary: BlockInput (needs admin). Fallback: ClipCursor (locks mouse in place).

#[cfg(target_os = "windows")]
fn block_input(block: bool) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::Input::KeyboardAndMouse::BlockInput;
    use windows::Win32::UI::WindowsAndMessaging::{ClipCursor, GetCursorPos};

    unsafe {
        if block {
            // Try BlockInput first (requires admin)
            let blocked = BlockInput(true).is_ok();
            if !blocked {
                // Fallback: lock mouse cursor to a 1px rect at current position
                let mut pt = POINT::default();
                let _ = GetCursorPos(&mut pt);
                let rect = RECT {
                    left: pt.x,
                    top: pt.y,
                    right: pt.x + 1,
                    bottom: pt.y + 1,
                };
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

/// Release all modifier keys to ensure a clean state before simulating input.
/// When a global hotkey like Ctrl+Shift+1 triggers delivery, those modifiers
/// are still physically held — releasing them prevents "stuck" modifiers from
/// turning every keystroke into Ctrl+Shift+<char>.
fn release_modifiers(enigo: &mut Enigo) {
    let modifiers = [Key::Control, Key::Shift, Key::Alt, Key::Meta];
    for key in modifiers {
        let _ = enigo.key(key, Direction::Release);
    }
    // Brief pause for the OS to register the releases
    thread::sleep(Duration::from_millis(30));
}

/// Sends keystrokes to the focused window. A trait so the fast-type executor
/// can be tested without simulating real input.
trait KeyOutput {
    fn type_char(&mut self, ch: char) -> Result<(), String>;
    fn backspace(&mut self) -> Result<(), String>;
}

struct EnigoOutput {
    enigo: Enigo,
    focus_ctx: Option<focus::FocusContext>,
}

impl EnigoOutput {
    fn ensure_focused(&self) {
        // Fallback: re-focus if somehow stolen (non-Windows platforms)
        if let Some(ref ctx) = self.focus_ctx {
            focus::ensure_focused(ctx);
        }
    }
}

impl KeyOutput for EnigoOutput {
    fn type_char(&mut self, ch: char) -> Result<(), String> {
        self.ensure_focused();
        match ch {
            '\n' => self
                .enigo
                .key(Key::Return, Direction::Click)
                .map_err(|e| format!("Failed to press Return: {e}")),
            '\t' => self
                .enigo
                .key(Key::Tab, Direction::Click)
                .map_err(|e| format!("Failed to press Tab: {e}")),
            _ => self
                .enigo
                .text(&ch.to_string())
                .map_err(|e| format!("Failed to type character '{ch}': {e}")),
        }
    }

    fn backspace(&mut self) -> Result<(), String> {
        self.ensure_focused();
        self.enigo
            .key(Key::Backspace, Direction::Click)
            .map_err(|e| format!("Failed to press Backspace: {e}"))
    }
}

pub fn deliver_fast_type_with_cancel(
    text: &str,
    options: FastTypeOptions,
    cancel_token: Option<Arc<AtomicBool>>,
) -> Result<(), String> {
    let steps = typing::plan(text, &options, &mut fastrand::Rng::new());
    let summary = typing::summarize(&steps);
    tracing::info!(
        chars = text.chars().count(),
        keystrokes = summary.keystrokes,
        typos = summary.typos,
        planned_ms = summary.planned_ms,
        delay_ms = options.delay_ms,
        typo_chance = options.typo_chance,
        variation = options.variation,
        "Fast-type planned"
    );

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create enigo instance: {e}"))?;

    // Release any held modifier keys from the hotkey trigger
    release_modifiers(&mut enigo);

    // Capture focus context as a safety net for non-Windows platforms
    let focus_ctx = focus::capture_focused_window();

    // Block all user mouse/keyboard input while we type
    let _guard = InputBlock::new();

    let mut output = EnigoOutput { enigo, focus_ctx };
    let cleanup_delay_ms = u64::from(options.delay_ms.min(MAX_CLEANUP_DELAY_MS));
    let started = std::time::Instant::now();
    let result = run_steps(&steps, &mut output, cancel_token.as_ref(), cleanup_delay_ms);
    tracing::info!(
        elapsed_ms = started.elapsed().as_millis() as u64,
        cancelled = is_cancelled(cancel_token.as_ref()),
        ok = result.is_ok(),
        "Fast-type finished"
    );
    result
    // _guard drops here → unblocks input
}

/// Runs planned keystrokes. When cancelled or a keystroke fails, erases any
/// typo still on screen so a stopped run never leaves one behind. Assumes a
/// failed keystroke had no effect, so cleanup after an error is best effort.
fn run_steps(
    steps: &[Step],
    output: &mut impl KeyOutput,
    cancel_token: Option<&Arc<AtomicBool>>,
    cleanup_delay_ms: u64,
) -> Result<(), String> {
    let mut mistakes = 0;
    for step in steps {
        if is_cancelled(cancel_token) {
            erase_mistakes(output, mistakes, cleanup_delay_ms);
            return Ok(());
        }
        let sent = match step.action {
            Action::Type(ch) => output.type_char(ch),
            Action::Backspace => output.backspace(),
        };
        if let Err(error) = sent {
            erase_mistakes(output, mistakes, cleanup_delay_ms);
            return Err(error);
        }
        mistakes = step.dirty_after;
        if !sleep_with_cancel(step.delay_ms, cancel_token) {
            erase_mistakes(output, mistakes, cleanup_delay_ms);
            return Ok(());
        }
    }
    Ok(())
}

/// Best effort and not cancellable; stops at the first failed keystroke.
fn erase_mistakes(output: &mut impl KeyOutput, count: usize, delay_ms: u64) {
    for index in 0..count {
        if index > 0 {
            thread::sleep(Duration::from_millis(delay_ms));
        }
        if output.backspace().is_err() {
            return;
        }
    }
}

fn is_cancelled(cancel_token: Option<&Arc<AtomicBool>>) -> bool {
    cancel_token
        .map(|token| token.load(Ordering::SeqCst))
        .unwrap_or(false)
}

fn sleep_with_cancel(duration_ms: u64, cancel_token: Option<&Arc<AtomicBool>>) -> bool {
    let mut remaining = duration_ms;
    while remaining > 0 {
        if is_cancelled(cancel_token) {
            return false;
        }
        let chunk = remaining.min(10);
        thread::sleep(Duration::from_millis(chunk));
        remaining -= chunk;
    }
    !is_cancelled(cancel_token)
}

/// Deliver text using paste (clipboard + Ctrl+V).
/// Blocks user input briefly during the paste action.
pub fn deliver_paste(text: &str) -> Result<(), String> {
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("Failed to access clipboard: {e}"))?;
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

    // Release any held modifier keys from the hotkey trigger
    release_modifiers(&mut enigo);

    #[cfg(target_os = "macos")]
    {
        enigo
            .key(Key::Meta, Direction::Press)
            .map_err(|e| format!("Failed to press Meta: {e}"))?;
        enigo
            .key(Key::Unicode('v'), Direction::Click)
            .map_err(|e| format!("Failed to press V: {e}"))?;
        enigo
            .key(Key::Meta, Direction::Release)
            .map_err(|e| format!("Failed to release Meta: {e}"))?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        enigo
            .key(Key::Control, Direction::Press)
            .map_err(|e| format!("Failed to press Control: {e}"))?;
        enigo
            .key(Key::Unicode('v'), Direction::Click)
            .map_err(|e| format!("Failed to press V: {e}"))?;
        enigo
            .key(Key::Control, Direction::Release)
            .map_err(|e| format!("Failed to release Control: {e}"))?;
    }

    // _guard drops here → unblocks input
    Ok(())
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub fn deliver_text(
    text: String,
    method: String,
    type_delay: Option<u32>,
    typo_chance: Option<u32>,
    type_variation: Option<u32>,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<(), String> {
    deliver_text_with_cancel(
        text,
        method,
        FastTypeOptions::new(type_delay, typo_chance, type_variation),
        None,
        auditaur_trace_context,
    )
}

pub fn deliver_text_with_cancel(
    text: String,
    method: String,
    options: FastTypeOptions,
    cancel_token: Option<Arc<AtomicBool>>,
    _auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<(), String> {
    match method.as_str() {
        "fast-type" => deliver_fast_type_with_cancel(&text, options, cancel_token),
        "paste" => deliver_paste(&text),
        _ => Err(format!("Unknown delivery method: {method}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deliver_text_rejects_unknown_method() {
        let result = deliver_text("hello".into(), "unknown".into(), None, None, None, None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown delivery method"));
    }

    #[derive(Default)]
    struct FakeOutput {
        screen: Vec<char>,
        keystrokes: usize,
        cancel_after: Option<usize>,
        fail_at: Option<usize>,
        cancel: Arc<AtomicBool>,
    }

    impl FakeOutput {
        fn press(&mut self) -> Result<(), String> {
            if self.fail_at == Some(self.keystrokes) {
                self.fail_at = None;
                return Err("keystroke rejected".into());
            }
            self.keystrokes += 1;
            if self.cancel_after == Some(self.keystrokes) {
                self.cancel.store(true, Ordering::SeqCst);
            }
            Ok(())
        }

        fn typed(&self) -> String {
            self.screen.iter().collect()
        }
    }

    impl KeyOutput for FakeOutput {
        fn type_char(&mut self, ch: char) -> Result<(), String> {
            self.press()?;
            self.screen.push(ch);
            Ok(())
        }

        fn backspace(&mut self) -> Result<(), String> {
            self.press()?;
            assert!(self.screen.pop().is_some(), "backspace on an empty screen");
            Ok(())
        }
    }

    const TEXT: &str = "Typing quickly, with typos!\n\tDone 42";

    fn typo_heavy_plan() -> Vec<Step> {
        let options = FastTypeOptions {
            delay_ms: 0,
            typo_chance: 40,
            variation: 0,
        };
        let steps = typing::plan(TEXT, &options, &mut fastrand::Rng::with_seed(11));
        assert!(steps.iter().any(|step| step.action == Action::Backspace));
        steps
    }

    /// The correct part of what the first `applied` keystrokes put on screen.
    fn correct_prefix_after(steps: &[Step], applied: usize) -> String {
        let mut screen = Vec::new();
        for step in &steps[..applied] {
            match step.action {
                Action::Type(ch) => screen.push(ch),
                Action::Backspace => {
                    screen.pop();
                }
            }
        }
        screen
            .into_iter()
            .zip(TEXT.chars())
            .take_while(|(shown, wanted)| shown == wanted)
            .map(|(ch, _)| ch)
            .collect()
    }

    #[test]
    fn run_steps_types_through_typos_to_the_exact_text() {
        let mut output = FakeOutput::default();
        run_steps(&typo_heavy_plan(), &mut output, None, 0).unwrap();
        assert_eq!(output.typed(), TEXT);
    }

    #[test]
    fn cancelling_at_any_keystroke_erases_only_the_typo() {
        let steps = typo_heavy_plan();
        for cancel_after in 0..=steps.len() {
            let mut output = FakeOutput {
                cancel_after: Some(cancel_after),
                ..FakeOutput::default()
            };
            let cancel = output.cancel.clone();
            cancel.store(cancel_after == 0, Ordering::SeqCst);
            run_steps(&steps, &mut output, Some(&cancel), 0).unwrap();
            assert_eq!(
                output.typed(),
                correct_prefix_after(&steps, cancel_after),
                "cancelled after {cancel_after} keys"
            );
        }
    }

    #[test]
    fn failed_keystrokes_erase_only_the_typo() {
        let steps = typo_heavy_plan();
        for fail_at in 0..steps.len() {
            let mut output = FakeOutput {
                fail_at: Some(fail_at),
                ..FakeOutput::default()
            };
            assert!(run_steps(&steps, &mut output, None, 0).is_err());
            assert_eq!(
                output.typed(),
                correct_prefix_after(&steps, fail_at),
                "failed at key {fail_at}"
            );
        }
    }
}
