use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;

use crate::app_settings::{self, AppSettings};
use crate::clipboard_guard::{self, Clipboard, ClipboardGuard};
use crate::focus;
use crate::images::{self, DecodedImage};
use crate::snippet_text::{self, Segment};
use crate::tokens::{self, Piece, Resolved};
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

// ─── One delivery at a time ─────────────────────────────────────────────────

/// Returned when a delivery starts while another is still running.
pub const DELIVERY_BUSY: &str =
    "Another text delivery is already running. Try again when it finishes.";

/// Admits one delivery at a time across hotkeys, Stream Deck, and IPC.
/// Overlapping deliveries would interleave keystrokes, race on the clipboard,
/// and release each other's input block early. Busy callers fail fast instead
/// of queuing, so an extra press never types a snippet twice.
struct DeliveryGate {
    busy: AtomicBool,
}

impl DeliveryGate {
    const fn new() -> Self {
        Self {
            busy: AtomicBool::new(false),
        }
    }

    fn try_enter(&'static self) -> Result<DeliveryPermit, String> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| DeliveryPermit { gate: self })
            .map_err(|_| DELIVERY_BUSY.to_string())
    }
}

static DELIVERY_GATE: DeliveryGate = DeliveryGate::new();

/// Proof that the caller holds the delivery gate. Released on drop, including
/// during a panic. `Send`, so it can be reserved before spawning a delivery.
#[must_use]
pub struct DeliveryPermit {
    gate: &'static DeliveryGate,
}

impl Drop for DeliveryPermit {
    fn drop(&mut self) {
        self.gate.busy.store(false, Ordering::Release);
    }
}

pub fn try_begin_delivery() -> Result<DeliveryPermit, String> {
    DELIVERY_GATE.try_enter()
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
    fn paste_image(&mut self, image: &DecodedImage) -> Result<(), String>;
    /// Moves the caret one character left, for `{{cursor}}`.
    fn move_left(&mut self) -> Result<(), String>;
}

/// Presses Ctrl+V (Cmd+V on macOS).
fn press_paste(enigo: &mut Enigo) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let modifier = Key::Meta;
    #[cfg(not(target_os = "macos"))]
    let modifier = Key::Control;
    enigo
        .key(modifier, Direction::Press)
        .map_err(|e| format!("Failed to press paste modifier: {e}"))?;
    let pressed = enigo
        .key(Key::Unicode('v'), Direction::Click)
        .map_err(|e| format!("Failed to press V: {e}"));
    let released = enigo
        .key(modifier, Direction::Release)
        .map_err(|e| format!("Failed to release paste modifier: {e}"));
    pressed.and(released)
}

struct EnigoOutput<'a> {
    enigo: Enigo,
    focus_ctx: Option<focus::FocusContext>,
    clipboard: &'a mut ClipboardGuard,
    shift_enter: bool,
}

/// How one planned character reaches the target.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Keystroke {
    Text(char),
    Key(Key),
    /// Shift+key, e.g. Shift+Enter for a line break chat apps won't send.
    ShiftKey(Key),
    /// Sends nothing: the `\r` of a CRLF when line breaks are Shift+Enter.
    Skip,
}

fn keystroke_for(ch: char, shift_enter: bool) -> Keystroke {
    match ch {
        '\n' if shift_enter => Keystroke::ShiftKey(Key::Return),
        '\r' if shift_enter => Keystroke::Skip,
        '\n' => Keystroke::Key(Key::Return),
        '\t' => Keystroke::Key(Key::Tab),
        _ => Keystroke::Text(ch),
    }
}

impl EnigoOutput<'_> {
    /// Refocuses the target if another window took focus. Fails rather than
    /// send keys to the wrong window when the target can't be brought back.
    fn ensure_focused(&self) -> Result<(), String> {
        match &self.focus_ctx {
            Some(ctx) if !focus::ensure_focused(ctx) => Err(
                "Typing stopped: the target window lost focus and could not be refocused.".into(),
            ),
            _ => Ok(()),
        }
    }
}

impl KeyOutput for EnigoOutput<'_> {
    fn type_char(&mut self, ch: char) -> Result<(), String> {
        self.ensure_focused()?;
        match keystroke_for(ch, self.shift_enter) {
            Keystroke::Text(ch) => self
                .enigo
                .text(&ch.to_string())
                .map_err(|e| format!("Failed to type character '{ch}': {e}")),
            Keystroke::Key(key) => self
                .enigo
                .key(key, Direction::Click)
                .map_err(|e| format!("Failed to press {key:?}: {e}")),
            Keystroke::ShiftKey(key) => {
                self.enigo
                    .key(Key::Shift, Direction::Press)
                    .map_err(|e| format!("Failed to press Shift: {e}"))?;
                let pressed = self
                    .enigo
                    .key(key, Direction::Click)
                    .map_err(|e| format!("Failed to press Shift+{key:?}: {e}"));
                let released = self
                    .enigo
                    .key(Key::Shift, Direction::Release)
                    .map_err(|e| format!("Failed to release Shift: {e}"));
                pressed.and(released)
            }
            Keystroke::Skip => Ok(()),
        }
    }

    fn backspace(&mut self) -> Result<(), String> {
        self.ensure_focused()?;
        self.enigo
            .key(Key::Backspace, Direction::Click)
            .map_err(|e| format!("Failed to press Backspace: {e}"))
    }

    fn paste_image(&mut self, image: &DecodedImage) -> Result<(), String> {
        self.ensure_focused()?;
        self.clipboard.write_image(image)?;
        self.clipboard.pasting();
        press_paste(&mut self.enigo)?;
        // Not cancellable: the target must read the clipboard before anything
        // else can replace it.
        thread::sleep(Duration::from_millis(IMAGE_SETTLE_MS));
        Ok(())
    }

    fn move_left(&mut self) -> Result<(), String> {
        self.ensure_focused()?;
        self.enigo
            .key(Key::LeftArrow, Direction::Click)
            .map_err(|e| format!("Failed to press Left: {e}"))
    }
}

/// Time for the target to read an image from the clipboard. Longer than for
/// text because apps decode and lay out the image before typing resumes.
const IMAGE_SETTLE_MS: u64 = 500;

/// One unit of fast-type work: planned keystrokes for a run of text, or an
/// image pasted as-is. Images are never humanized.
enum Op {
    Keys(Vec<Step>),
    Image(usize),
}

fn plan_ops(pieces: &[Piece], image_index: &[String], options: &FastTypeOptions) -> Vec<Op> {
    let mut rng = fastrand::Rng::new();
    plan_ops_with(pieces, image_index, options, &mut rng)
}

fn plan_ops_with(
    pieces: &[Piece],
    image_index: &[String],
    options: &FastTypeOptions,
    rng: &mut fastrand::Rng,
) -> Vec<Op> {
    pieces
        .iter()
        .map(|piece| match piece {
            Piece::Text(text) => Op::Keys(typing::plan(text, options, rng)),
            Piece::Image(key) => Op::Image(
                image_index
                    .iter()
                    .position(|loaded| loaded == key)
                    .expect("every referenced image is loaded"),
            ),
        })
        .collect()
}

/// Runs each op in order. Text runs clean up their own typos, so an image is
/// only pasted with nothing mistyped on screen, and Backspace never reaches it.
fn run_ops(
    ops: &[Op],
    images: &[DecodedImage],
    output: &mut impl KeyOutput,
    cancel_token: Option<&Arc<AtomicBool>>,
    cleanup_delay_ms: u64,
) -> Result<(), String> {
    for op in ops {
        if is_cancelled(cancel_token) {
            return Ok(());
        }
        match op {
            Op::Keys(steps) => run_steps(steps, output, cancel_token, cleanup_delay_ms)?,
            Op::Image(index) => output.paste_image(&images[*index])?,
        }
    }
    Ok(())
}

/// Runs the ops, then moves the caret back to `{{cursor}}`. The caret only
/// moves after the whole snippet is typed, never after a stop or failure.
fn run_ops_then_place_cursor(
    ops: &[Op],
    images: &[DecodedImage],
    cursor_back: usize,
    output: &mut impl KeyOutput,
    cancel_token: Option<&Arc<AtomicBool>>,
    cleanup_delay_ms: u64,
) -> Result<(), String> {
    run_ops(ops, images, output, cancel_token, cleanup_delay_ms)?;
    move_cursor_back(cursor_back, output, cancel_token)
}

fn move_cursor_back(
    count: usize,
    output: &mut impl KeyOutput,
    cancel_token: Option<&Arc<AtomicBool>>,
) -> Result<(), String> {
    for _ in 0..count {
        if is_cancelled(cancel_token) {
            return Ok(());
        }
        output.move_left()?;
    }
    Ok(())
}

fn deliver_fast_type_with_cancel(
    prepared: &mut PreparedText,
    options: FastTypeOptions,
    cancel_token: Option<Arc<AtomicBool>>,
) -> Result<(), String> {
    let ops = plan_ops(&prepared.resolved.pieces, &prepared.image_keys, &options);
    let steps: Vec<Step> = ops
        .iter()
        .filter_map(|op| match op {
            Op::Keys(steps) => Some(steps.as_slice()),
            Op::Image(_) => None,
        })
        .flatten()
        .copied()
        .collect();
    let summary = typing::summarize(&steps);
    let chars = prepared.resolved.text().chars().count();
    tracing::info!(
        chars,
        cursor_back = prepared.resolved.cursor_back,
        images = ops.iter().filter(|op| matches!(op, Op::Image(_))).count(),
        keystrokes = summary.keystrokes,
        typos = summary.typos,
        planned_ms = summary.planned_ms,
        delay_ms = options.delay_ms,
        typo_chance = options.typo_chance,
        variation = options.variation,
        shift_enter = options.shift_enter,
        "Fast-type planned"
    );

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create enigo instance: {e}"))?;

    // Release any held modifier keys from the hotkey trigger
    release_modifiers(&mut enigo);

    // Remember the target so typing can refocus it, or stop, if focus moves
    let focus_ctx = focus::capture_focused_window();

    // Block all user mouse/keyboard input while we type
    let _guard = InputBlock::new();

    let mut output = EnigoOutput {
        enigo,
        focus_ctx,
        clipboard: &mut prepared.clipboard,
        shift_enter: options.shift_enter,
    };
    let cleanup_delay_ms = u64::from(options.delay_ms.min(MAX_CLEANUP_DELAY_MS));
    let started = std::time::Instant::now();
    let result = run_ops_then_place_cursor(
        &ops,
        &prepared.images,
        prepared.resolved.cursor_back,
        &mut output,
        cancel_token.as_ref(),
        cleanup_delay_ms,
    );
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

/// Time for the target to read the clipboard after Ctrl/Cmd+V. Input injection
/// only queues the keys, so returning (and releasing the delivery gate) sooner
/// would let the next delivery replace the clipboard before this paste reads it.
const PASTE_SETTLE_MS: u64 = 200;

/// Deliver text using paste (clipboard + Ctrl+V).
/// Blocks user input briefly during the paste action.
fn deliver_paste(prepared: &mut PreparedText) -> Result<(), String> {
    prepared.clipboard.write_text(&prepared.resolved.text())?;

    let focus_ctx = focus::capture_focused_window();
    if let Some(ref ctx) = focus_ctx {
        focus::ensure_focused(ctx);
    }

    let _guard = InputBlock::new();

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create enigo instance: {e}"))?;

    // Release any held modifier keys from the hotkey trigger
    release_modifiers(&mut enigo);
    prepared.clipboard.pasting();
    press_paste(&mut enigo)?;

    thread::sleep(Duration::from_millis(PASTE_SETTLE_MS));
    for _ in 0..prepared.resolved.cursor_back {
        enigo
            .key(Key::LeftArrow, Direction::Click)
            .map_err(|e| format!("Failed to press Left: {e}"))?;
    }
    // _guard drops here → unblocks input
    Ok(())
}

/// Returned when a paste-delivery snippet references images.
pub const PASTE_WITH_IMAGES: &str =
    "Paste delivery can't include images. Switch this snippet to Fast-type.";
const IMAGES_NEED_PROJECT: &str = "Images can only be delivered from an open project.";

const VARIABLES_NEED_PROJECT: &str = "Variables can only be delivered from an open project.";

enum Method {
    FastType,
    Paste,
}

/// Snippet text checked and ready to deliver: tokens resolved and every
/// referenced image loaded, so problems fail before any keystroke.
pub struct PreparedText {
    method: Method,
    resolved: Resolved,
    image_keys: Vec<String>,
    images: Vec<DecodedImage>,
    /// Holds the clipboard as it was before delivery, restored afterwards.
    clipboard: ClipboardGuard,
}

/// Call while holding the delivery permit: it saves the clipboard, which the
/// delivery will restore.
pub fn prepare_text(
    text: &str,
    method: &str,
    project_path: Option<&str>,
    raw: bool,
) -> Result<PreparedText, String> {
    prepare_with(
        text,
        method,
        project_path,
        raw,
        clipboard_guard::system(),
        app_settings::current(),
        &mut tokens::random_value,
    )
}

fn prepare_with(
    text: &str,
    method: &str,
    project_path: Option<&str>,
    raw: bool,
    clipboard: Box<dyn Clipboard>,
    settings: AppSettings,
    random: &mut impl FnMut(u32) -> String,
) -> Result<PreparedText, String> {
    let method = match method {
        "fast-type" => Method::FastType,
        "paste" => Method::Paste,
        _ => return Err(format!("Unknown delivery method: {method}")),
    };
    let segments = snippet_text::parse_snippet(text, raw)?;
    let project_dir = project_path.filter(|path| !path.trim().is_empty());
    let mut image_keys: Vec<String> = Vec::new();
    for key in snippet_text::image_keys(&segments) {
        if !image_keys.iter().any(|loaded| loaded == key) {
            image_keys.push(key.to_string());
        }
    }
    if !image_keys.is_empty() && matches!(method, Method::Paste) {
        return Err(PASTE_WITH_IMAGES.into());
    }
    let variables = if segments.iter().any(|s| matches!(s, Segment::Var(_))) {
        let dir = project_dir.ok_or(VARIABLES_NEED_PROJECT)?;
        crate::commands::load_project_variables(Path::new(dir))?
    } else {
        Vec::new()
    };
    let mut images = Vec::new();
    if !image_keys.is_empty() {
        let dir = project_dir.ok_or(IMAGES_NEED_PROJECT)?;
        for key in &image_keys {
            images.push(images::load_decoded(Path::new(dir), key)?);
        }
    }
    let will_write = matches!(method, Method::Paste) || !images.is_empty();
    let needs_text = segments.iter().any(|s| matches!(s, Segment::Clipboard));
    let clipboard = ClipboardGuard::begin(clipboard, settings, will_write, needs_text)?;
    let values = tokens::Values {
        variables: &variables,
        now: chrono::Local::now(),
        clipboard: clipboard.text(),
    };
    let resolved = tokens::resolve(&segments, &values, random)?;
    Ok(PreparedText {
        method,
        resolved,
        image_keys,
        images,
        clipboard,
    })
}

/// Delivers prepared text under a permit the caller already holds. The
/// clipboard is restored, and then the permit released, before returning.
pub fn deliver_prepared(
    _permit: DeliveryPermit,
    mut prepared: PreparedText,
    options: FastTypeOptions,
    cancel_token: Option<Arc<AtomicBool>>,
) -> Result<(), String> {
    let result = match prepared.method {
        Method::FastType => deliver_fast_type_with_cancel(&mut prepared, options, cancel_token),
        Method::Paste => deliver_paste(&mut prepared),
    };
    prepared.clipboard.finish();
    result
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
#[allow(clippy::too_many_arguments)]
pub fn deliver_text(
    text: String,
    method: String,
    type_delay: Option<u32>,
    typo_chance: Option<u32>,
    type_variation: Option<u32>,
    shift_enter: Option<bool>,
    project_path: Option<String>,
    raw: Option<bool>,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<(), String> {
    deliver_text_with_permit(
        try_begin_delivery()?,
        &text,
        &method,
        project_path.as_deref(),
        raw.unwrap_or(false),
        FastTypeOptions::new(type_delay, typo_chance, type_variation, shift_enter),
        None,
    )
}

/// Prepares and delivers under a permit the caller already holds.
pub fn deliver_text_with_permit(
    permit: DeliveryPermit,
    text: &str,
    method: &str,
    project_path: Option<&str>,
    raw: bool,
    options: FastTypeOptions,
    cancel_token: Option<Arc<AtomicBool>>,
) -> Result<(), String> {
    let prepared = prepare_text(text, method, project_path, raw)?;
    deliver_prepared(permit, prepared, options, cancel_token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deliver_text_rejects_unknown_method() {
        let result = deliver_text(
            "hello".into(),
            "unknown".into(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown delivery method"));
    }

    #[test]
    fn delivery_gate_admits_one_delivery_at_a_time() {
        static GATE: DeliveryGate = DeliveryGate::new();
        let first = GATE.try_enter().expect("an idle gate admits a delivery");
        assert_eq!(GATE.try_enter().err().as_deref(), Some(DELIVERY_BUSY));
        drop(first);
        assert!(
            GATE.try_enter().is_ok(),
            "the gate reopens when the permit drops"
        );
    }

    #[test]
    fn delivery_gate_admits_exactly_one_concurrent_caller() {
        static GATE: DeliveryGate = DeliveryGate::new();
        let callers = 8;
        let start = std::sync::Barrier::new(callers);
        let admitted: Vec<DeliveryPermit> = thread::scope(|scope| {
            let handles: Vec<_> = (0..callers)
                .map(|_| {
                    scope.spawn(|| {
                        start.wait();
                        GATE.try_enter().ok()
                    })
                })
                .collect();
            handles
                .into_iter()
                .filter_map(|handle| handle.join().unwrap())
                .collect()
        });
        assert_eq!(admitted.len(), 1);
    }

    #[test]
    fn failed_delivery_releases_the_gate() {
        static GATE: DeliveryGate = DeliveryGate::new();
        let permit = GATE.try_enter().unwrap();
        let options = FastTypeOptions::new(None, None, None, None);
        let result =
            deliver_text_with_permit(permit, "hello", "unknown", None, false, options, None);
        assert!(result.unwrap_err().contains("Unknown delivery method"));
        assert!(GATE.try_enter().is_ok());
    }

    #[test]
    fn line_breaks_press_enter_or_shift_enter() {
        assert_eq!(keystroke_for('\n', false), Keystroke::Key(Key::Return));
        assert_eq!(keystroke_for('\n', true), Keystroke::ShiftKey(Key::Return));
        assert_eq!(keystroke_for('\r', true), Keystroke::Skip);
        for shift_enter in [false, true] {
            assert_eq!(keystroke_for('\t', shift_enter), Keystroke::Key(Key::Tab));
            assert_eq!(keystroke_for('a', shift_enter), Keystroke::Text('a'));
        }
    }

    #[derive(Debug, Clone, PartialEq)]
    enum Cell {
        Char(char),
        Image(usize),
    }

    #[derive(Default)]
    struct FakeOutput {
        screen: Vec<Cell>,
        lefts: usize,
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
            self.screen
                .iter()
                .map(|cell| match cell {
                    Cell::Char(ch) => *ch,
                    Cell::Image(_) => '■',
                })
                .collect()
        }
    }

    impl KeyOutput for FakeOutput {
        fn type_char(&mut self, ch: char) -> Result<(), String> {
            self.press()?;
            self.screen.push(Cell::Char(ch));
            Ok(())
        }

        fn backspace(&mut self) -> Result<(), String> {
            self.press()?;
            match self.screen.pop() {
                Some(Cell::Char(_)) => Ok(()),
                Some(Cell::Image(_)) => panic!("backspace deleted an image"),
                None => panic!("backspace on an empty screen"),
            }
        }

        fn paste_image(&mut self, image: &DecodedImage) -> Result<(), String> {
            self.press()?;
            self.screen.push(Cell::Image(image.width));
            Ok(())
        }

        fn move_left(&mut self) -> Result<(), String> {
            self.press()?;
            self.lefts += 1;
            Ok(())
        }
    }

    const TEXT: &str = "Typing quickly, with typos!\n\tDone 42";

    fn typo_heavy_plan() -> Vec<Step> {
        let options = FastTypeOptions {
            delay_ms: 0,
            typo_chance: 40,
            variation: 0,
            shift_enter: false,
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

    const IMAGE_TEXT: &str =
        "Logo: {{image:one.png}}then {{image:two.png}}{{image:one.png}} and done 42!";

    /// Images whose width doubles as an id, so the screen shows which pasted.
    fn fake_images(keys: &[String]) -> Vec<DecodedImage> {
        (0..keys.len())
            .map(|index| DecodedImage {
                width: index,
                height: 1,
                rgba: Vec::new(),
            })
            .collect()
    }

    fn image_plan(seed: u64) -> (Vec<Op>, Vec<DecodedImage>, Vec<Cell>) {
        let segments: Vec<Piece> = snippet_text::parse(IMAGE_TEXT)
            .unwrap()
            .into_iter()
            .map(|segment| match segment {
                Segment::Text(text) => Piece::Text(text),
                Segment::Image(key) => Piece::Image(key),
                other => panic!("unexpected {other:?}"),
            })
            .collect();
        let keys = vec!["one.png".to_string(), "two.png".to_string()];
        let options = FastTypeOptions {
            delay_ms: 0,
            typo_chance: 30,
            variation: 100,
            shift_enter: false,
        };
        let ops = plan_ops_with(
            &segments,
            &keys,
            &options,
            &mut fastrand::Rng::with_seed(seed),
        );
        let expected = segments
            .iter()
            .flat_map(|segment| match segment {
                Piece::Text(text) => text.chars().map(Cell::Char).collect::<Vec<_>>(),
                Piece::Image(key) => {
                    vec![Cell::Image(keys.iter().position(|k| k == key).unwrap())]
                }
            })
            .collect();
        (ops, fake_images(&keys), expected)
    }

    fn keystrokes(ops: &[Op]) -> usize {
        ops.iter()
            .map(|op| match op {
                Op::Keys(steps) => steps.len(),
                Op::Image(_) => 1,
            })
            .sum()
    }

    #[test]
    fn images_paste_in_place_and_are_never_humanized() {
        let mut saw_typo = false;
        for seed in 0..200 {
            let (ops, images, expected) = image_plan(seed);
            saw_typo |= ops.iter().any(|op| match op {
                Op::Keys(steps) => steps.iter().any(|s| s.action == Action::Backspace),
                Op::Image(_) => false,
            });
            let mut output = FakeOutput::default();
            run_ops(&ops, &images, &mut output, None, 0).unwrap();
            assert_eq!(output.screen, expected, "seed {seed}");
        }
        assert!(saw_typo, "the plans should include typos");
    }

    #[test]
    fn stopping_mid_run_leaves_a_clean_prefix_with_images_intact() {
        for seed in 0..20 {
            let (ops, images, expected) = image_plan(seed);
            for cancel_after in 0..=keystrokes(&ops) {
                let mut output = FakeOutput {
                    cancel_after: Some(cancel_after),
                    ..FakeOutput::default()
                };
                let cancel = output.cancel.clone();
                cancel.store(cancel_after == 0, Ordering::SeqCst);
                run_ops(&ops, &images, &mut output, Some(&cancel), 0).unwrap();
                assert!(
                    expected.starts_with(&output.screen),
                    "seed {seed}, cancelled after {cancel_after}: {:?}",
                    output.typed()
                );
            }
            for fail_at in 0..keystrokes(&ops) {
                let mut output = FakeOutput {
                    fail_at: Some(fail_at),
                    ..FakeOutput::default()
                };
                assert!(run_ops(&ops, &images, &mut output, None, 0).is_err());
                assert!(
                    expected.starts_with(&output.screen),
                    "seed {seed}, failed at {fail_at}: {:?}",
                    output.typed()
                );
            }
        }
    }

    fn project_with_image() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("project.json"),
            r#"{"name":"Demo","variables":[{"name":"host","value":"contoso.com"}]}"#,
        )
        .unwrap();
        let images_dir = dir.path().join(images::IMAGES_DIR);
        std::fs::create_dir_all(&images_dir).unwrap();
        image::RgbaImage::from_pixel(2, 3, image::Rgba([1, 2, 3, 255]))
            .save(images_dir.join("logo.png"))
            .unwrap();
        dir
    }

    type FakeState = std::sync::Arc<std::sync::Mutex<clipboard_guard::fake::State>>;

    fn prepare_on(
        state: &FakeState,
        text: &str,
        method: &str,
        path: Option<&str>,
        raw: bool,
    ) -> Result<PreparedText, String> {
        prepare_with(
            text,
            method,
            path,
            raw,
            Box::new(clipboard_guard::fake::FakeClipboard(state.clone())),
            AppSettings {
                restore_clipboard: true,
                clipboard_restore_delay_ms: 0,
            },
            &mut |n| "x".repeat(n as usize),
        )
    }

    fn prepare(text: &str, method: &str, path: Option<&str>) -> Result<PreparedText, String> {
        let state = FakeState::new(clipboard_guard::fake::State::with_text("copied").into());
        prepare_on(&state, text, method, path, false)
    }

    #[test]
    fn prepare_loads_each_referenced_image_once() {
        let dir = project_with_image();
        let path = dir.path().to_str();
        let prepared =
            prepare("a{{image:logo.png}}b{{image:logo.png}}", "fast-type", path).unwrap();
        assert_eq!(prepared.image_keys, ["logo.png"]);
        assert_eq!(prepared.images.len(), 1);
        assert_eq!(
            (prepared.images[0].width, prepared.images[0].height),
            (2, 3)
        );
    }

    #[test]
    fn prepare_rejects_images_it_cannot_deliver() {
        let dir = project_with_image();
        let path = dir.path().to_str();
        let error = |text: &str, method: &str, path: Option<&str>| {
            prepare(text, method, path).err().unwrap()
        };
        assert_eq!(
            error("{{image:logo.png}}", "paste", path),
            PASTE_WITH_IMAGES
        );
        assert_eq!(
            error("{{image:logo.png}}", "fast-type", None),
            IMAGES_NEED_PROJECT
        );
        assert!(error("{{image:gone.png}}", "fast-type", path).contains("gone.png"));
        assert!(error("{{image:Bad Key}}", "fast-type", path).contains("Invalid image reference"));
        assert!(error("{{image:logo.png", "fast-type", path).contains("Unclosed"));
    }

    #[test]
    fn prepare_accepts_plain_text_without_a_project() {
        for method in ["fast-type", "paste"] {
            let prepared = prepare("Hello {{name}}", method, None).unwrap();
            assert!(prepared.images.is_empty());
            assert_eq!(prepared.resolved.text(), "Hello {{name}}");
        }
    }

    #[test]
    fn prepare_resolves_tokens_before_any_keystroke() {
        let dir = project_with_image();
        let path = dir.path().to_str();
        let prepared = prepare(
            "https://{{var:host}}/{{random:4}}?q={{clipboard}}&n={{cursor}}{{random:4}}",
            "paste",
            path,
        )
        .unwrap();
        assert_eq!(
            prepared.resolved.text(),
            "https://contoso.com/xxxx?q=copied&n=xxxx"
        );
        assert_eq!(prepared.resolved.cursor_back, 4);

        assert_eq!(
            prepare("{{var:host}}", "paste", None).err().unwrap(),
            VARIABLES_NEED_PROJECT
        );
        assert!(prepare("{{var:nope}}", "fast-type", path)
            .err()
            .unwrap()
            .contains("Undefined variable: nope"));
        assert!(prepare("{{date:fancy}}", "fast-type", None).is_err());
    }

    #[test]
    fn raw_snippets_deliver_tokens_literally() {
        let state = FakeState::new(clipboard_guard::fake::State::with_text("copied").into());
        let prepared = prepare_on(&state, "{{cursor}}{{var:x}}", "paste", None, true).unwrap();
        assert_eq!(prepared.resolved.text(), "{{cursor}}{{var:x}}");
        assert_eq!(prepared.resolved.cursor_back, 0);
    }

    #[test]
    fn clipboard_token_reads_the_clipboard_before_snipsy_writes() {
        let state = FakeState::new(clipboard_guard::fake::State::with_text("before").into());
        let mut prepared = prepare_on(&state, "[{{clipboard}}]", "paste", None, false).unwrap();
        assert_eq!(prepared.resolved.text(), "[before]");
        prepared.clipboard.write_text("[before]").unwrap();
        prepared.clipboard.finish();
        assert_eq!(state.lock().unwrap().text().as_deref(), Some("before"));

        let empty = FakeState::default();
        assert_eq!(
            prepare_on(&empty, "{{clipboard}}", "fast-type", None, false)
                .err()
                .unwrap(),
            clipboard_guard::NO_CLIPBOARD_TEXT
        );
    }

    #[test]
    fn the_caret_moves_back_only_after_a_complete_run() {
        let options = FastTypeOptions {
            delay_ms: 0,
            typo_chance: 0,
            variation: 0,
            shift_enter: false,
        };
        let ops = plan_ops(&[Piece::Text("f(x)".into())], &[], &options);

        let mut output = FakeOutput::default();
        run_ops_then_place_cursor(&ops, &[], 2, &mut output, None, 0).unwrap();
        assert_eq!((output.typed().as_str(), output.lefts), ("f(x)", 2));

        for cancel_after in 1..=4 {
            let mut output = FakeOutput {
                cancel_after: Some(cancel_after),
                ..FakeOutput::default()
            };
            let cancel = output.cancel.clone();
            run_ops_then_place_cursor(&ops, &[], 2, &mut output, Some(&cancel), 0).unwrap();
            assert_eq!(output.lefts, 0, "cancelled after {cancel_after}");
        }

        let mut output = FakeOutput {
            fail_at: Some(1),
            ..FakeOutput::default()
        };
        assert!(run_ops_then_place_cursor(&ops, &[], 2, &mut output, None, 0).is_err());
        assert_eq!(output.lefts, 0);
    }
}
