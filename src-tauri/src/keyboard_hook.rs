/// Low-level keyboard hook fallback for when RegisterHotKey fails
/// (e.g., another app already owns the shortcut).
///
/// Uses WH_KEYBOARD_LL which intercepts ALL keyboard input at a very low
/// level — before RegisterHotKey processing — so it can "hijack" any
/// key combination regardless of other registrations.
#[cfg(windows)]
use std::sync::{mpsc, LazyLock, Mutex};

use std::sync::Arc;

#[cfg(windows)]
use std::collections::{HashMap, HashSet};

#[cfg(windows)]
use windows::{
    Win32::Foundation::{LPARAM, LRESULT, WPARAM},
    Win32::System::Threading::GetCurrentThreadId,
    Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, PeekMessageW, PostThreadMessageW, SetWindowsHookExW,
        UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, MSG, PM_NOREMOVE, WH_KEYBOARD_LL,
        WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
    },
    Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState,
};

#[cfg(windows)]
use std::ffi::c_void;

/// Modifier flags matching the Tauri accelerator format
#[cfg(windows)]
const MOD_CTRL: u8 = 0x01;
#[cfg(windows)]
const MOD_SHIFT: u8 = 0x02;
#[cfg(windows)]
const MOD_ALT: u8 = 0x04;
#[cfg(windows)]
const MOD_WIN: u8 = 0x08;

/// Virtual key code + modifier bitmask as the hook lookup key
#[cfg(windows)]
type HookKey = (u32, u8);

/// Callback that fires when the hooked key combo is pressed. It is invoked on
/// a fresh worker thread so the hook procedure always returns promptly.
pub type HookCallback = Arc<dyn Fn() + Send + Sync + 'static>;

#[cfg(windows)]
struct HookThread {
    thread_id: u32,
    handle: std::thread::JoinHandle<()>,
}

#[cfg(windows)]
struct HookState {
    bindings: HashMap<HookKey, HookCallback>,
    thread: Option<HookThread>,
    /// Keys currently held down, so auto-repeat doesn't fire a binding again
    /// (mirrors RegisterHotKey's MOD_NOREPEAT).
    held: HashSet<u32>,
}

#[cfg(windows)]
static HOOK_STATE: LazyLock<Mutex<HookState>> = LazyLock::new(|| {
    Mutex::new(HookState {
        bindings: HashMap::new(),
        thread: None,
        held: HashSet::new(),
    })
});

/// Parse a Tauri accelerator string like "CmdOrControl+Shift+X" into (vk_code, modifier_mask).
#[cfg(windows)]
fn parse_accelerator(accel: &str) -> Option<HookKey> {
    let parts: Vec<&str> = accel.split('+').map(|s| s.trim()).collect();
    let mut mods: u8 = 0;
    let mut key_str = "";

    for part in &parts {
        match part.to_lowercase().as_str() {
            "ctrl" | "control" | "cmdorcontrol" | "commandorcontrol" => mods |= MOD_CTRL,
            "shift" => mods |= MOD_SHIFT,
            "alt" | "option" => mods |= MOD_ALT,
            "super" | "meta" | "cmd" | "command" => mods |= MOD_WIN,
            _ => key_str = part,
        }
    }

    let vk = key_str_to_vk(key_str)?;
    Some((vk, mods))
}

/// Map a key name to a Windows virtual key code
#[cfg(windows)]
fn key_str_to_vk(s: &str) -> Option<u32> {
    // Single character keys
    if s.len() == 1 {
        let c = s.chars().next()?.to_ascii_uppercase();
        if c.is_ascii_alphanumeric() {
            return Some(c as u32);
        }
    }

    // Named keys
    match s.to_lowercase().as_str() {
        "0" => Some(0x30),
        "1" => Some(0x31),
        "2" => Some(0x32),
        "3" => Some(0x33),
        "4" => Some(0x34),
        "5" => Some(0x35),
        "6" => Some(0x36),
        "7" => Some(0x37),
        "8" => Some(0x38),
        "9" => Some(0x39),
        "f1" => Some(0x70),
        "f2" => Some(0x71),
        "f3" => Some(0x72),
        "f4" => Some(0x73),
        "f5" => Some(0x74),
        "f6" => Some(0x75),
        "f7" => Some(0x76),
        "f8" => Some(0x77),
        "f9" => Some(0x78),
        "f10" => Some(0x79),
        "f11" => Some(0x7A),
        "f12" => Some(0x7B),
        "space" => Some(0x20),
        "enter" | "return" => Some(0x0D),
        "tab" => Some(0x09),
        "escape" | "esc" => Some(0x1B),
        "backspace" => Some(0x08),
        "delete" => Some(0x2E),
        "insert" => Some(0x2D),
        "home" => Some(0x24),
        "end" => Some(0x23),
        "pageup" => Some(0x21),
        "pagedown" => Some(0x22),
        "up" | "arrowup" => Some(0x26),
        "down" | "arrowdown" => Some(0x28),
        "left" | "arrowleft" => Some(0x25),
        "right" | "arrowright" => Some(0x27),
        _ => None,
    }
}

/// Get the current modifier state using GetAsyncKeyState
#[cfg(windows)]
fn current_modifiers() -> u8 {
    let mut mods: u8 = 0;
    unsafe {
        if GetAsyncKeyState(0xA2) < 0 || GetAsyncKeyState(0xA3) < 0 {
            // VK_LCONTROL or VK_RCONTROL
            mods |= MOD_CTRL;
        }
        if GetAsyncKeyState(0xA0) < 0 || GetAsyncKeyState(0xA1) < 0 {
            // VK_LSHIFT or VK_RSHIFT
            mods |= MOD_SHIFT;
        }
        if GetAsyncKeyState(0xA4) < 0 || GetAsyncKeyState(0xA5) < 0 {
            // VK_LMENU or VK_RMENU (Alt)
            mods |= MOD_ALT;
        }
        if GetAsyncKeyState(0x5B) < 0 || GetAsyncKeyState(0x5C) < 0 {
            // VK_LWIN or VK_RWIN
            mods |= MOD_WIN;
        }
    }
    mods
}

/// Decide what a key event means for the bindings. Returns `(swallow, callback)`.
#[cfg(windows)]
fn handle_key_event(
    state: &mut HookState,
    vk: u32,
    mods: u8,
    is_down: bool,
) -> (bool, Option<HookCallback>) {
    if !is_down {
        state.held.remove(&vk);
        return (false, None);
    }
    let first_press = state.held.insert(vk);
    let Some(cb) = state.bindings.get(&(vk, mods)) else {
        return (false, None);
    };
    (true, first_press.then(|| cb.clone()))
}

/// The actual hook callback invoked by Windows. It must return quickly:
/// Windows silently removes low-level hooks that exceed LowLevelHooksTimeout,
/// so the binding callback is dispatched to a worker thread.
#[cfg(windows)]
unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let msg_type = wparam.0 as u32;
        let is_down = msg_type == WM_KEYDOWN || msg_type == WM_SYSKEYDOWN;
        let is_up = msg_type == WM_KEYUP || msg_type == WM_SYSKEYUP;
        if is_down || is_up {
            let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            let mods = if is_down { current_modifiers() } else { 0 };
            let decision = HOOK_STATE
                .try_lock()
                .ok()
                .map(|mut state| handle_key_event(&mut state, kb.vkCode, mods, is_down));
            if let Some((swallow, callback)) = decision {
                if let Some(cb) = callback {
                    tracing::info!(virtual_key = kb.vkCode, modifiers = mods, "Low-level hook hotkey fired");
                    std::thread::spawn(move || cb());
                }
                if swallow {
                    // Swallow the key so it doesn't reach the other app
                    return LRESULT(1);
                }
            }
        }
    }
    CallNextHookEx(Some(HHOOK(std::ptr::null_mut() as *mut c_void)), code, wparam, lparam)
}

/// Start the hook thread if not already running, waiting until the hook is installed.
#[cfg(windows)]
fn ensure_hook_thread(state: &mut HookState) -> Result<(), String> {
    if let Some(thread) = &state.thread {
        if !thread.handle.is_finished() {
            return Ok(());
        }
    }
    state.thread = None;

    let (ready_tx, ready_rx) = mpsc::channel::<Result<u32, String>>();
    let handle = std::thread::spawn(move || unsafe {
        let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), None, 0) {
            Ok(hook) => hook,
            Err(e) => {
                let _ = ready_tx.send(Err(format!("Failed to install keyboard hook: {e}")));
                return;
            }
        };

        // Force creation of this thread's message queue so WM_QUIT can be posted to it.
        let mut msg = MSG::default();
        let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);
        let _ = ready_tx.send(Ok(GetCurrentThreadId()));

        // WH_KEYBOARD_LL requires a message loop on the thread that installed it.
        // clear_all_hooks posts WM_QUIT, which makes GetMessageW return false.
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {}

        let _ = UnhookWindowsHookEx(hook);
    });

    let thread_id = ready_rx
        .recv()
        .map_err(|_| "Keyboard hook thread exited before installing".to_string())??;
    state.thread = Some(HookThread { thread_id, handle });
    Ok(())
}

/// Register a hotkey via the low-level hook fallback.
/// Call this when tauri_plugin_global_shortcut fails.
#[cfg(windows)]
pub fn register_hook_fallback(accelerator: &str, callback: HookCallback) -> Result<(), String> {
    let key = parse_accelerator(accelerator)
        .ok_or_else(|| format!("Could not parse accelerator: {accelerator}"))?;

    let mut state = HOOK_STATE.lock().map_err(|e| format!("Hook state lock error: {e}"))?;
    ensure_hook_thread(&mut state)?;
    state.bindings.insert(key, callback);
    tracing::info!(
        accelerator = %accelerator,
        virtual_key = key.0,
        modifiers = key.1,
        "Registered low-level hook fallback"
    );
    Ok(())
}

/// Remove all hook bindings and stop the hook thread.
#[cfg(windows)]
pub fn clear_all_hooks() {
    let thread = {
        let mut state = match HOOK_STATE.lock() {
            Ok(state) => state,
            Err(poisoned) => poisoned.into_inner(),
        };
        state.bindings.clear();
        state.held.clear();
        state.thread.take()
    };

    if let Some(thread) = thread {
        // The hook thread unhooks itself after its message loop exits.
        let posted = unsafe { PostThreadMessageW(thread.thread_id, WM_QUIT, WPARAM(0), LPARAM(0)) };
        if posted.is_ok() {
            let _ = thread.handle.join();
        } else if !thread.handle.is_finished() {
            tracing::warn!("Failed to stop keyboard hook thread; keeping it for reuse");
            if let Ok(mut state) = HOOK_STATE.lock() {
                state.thread.get_or_insert(thread);
            }
        }
    }
}

// No-op stubs for non-Windows platforms
#[cfg(not(windows))]
pub fn register_hook_fallback(_accelerator: &str, _callback: HookCallback) -> Result<(), String> {
    Err("Low-level keyboard hooks are only supported on Windows".into())
}

#[cfg(not(windows))]
pub fn clear_all_hooks() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(windows)]
    fn parse_accelerator_basic() {
        let (vk, mods) = parse_accelerator("CmdOrControl+Shift+X").unwrap();
        assert_eq!(vk, 'X' as u32);
        assert_eq!(mods, MOD_CTRL | MOD_SHIFT);
    }

    #[test]
    #[cfg(windows)]
    fn parse_accelerator_f_key() {
        let (vk, mods) = parse_accelerator("Ctrl+F5").unwrap();
        assert_eq!(vk, 0x74);
        assert_eq!(mods, MOD_CTRL);
    }

    #[cfg(windows)]
    fn test_state(key: HookKey) -> HookState {
        let mut bindings: HashMap<HookKey, HookCallback> = HashMap::new();
        bindings.insert(key, Arc::new(|| {}));
        HookState { bindings, thread: None, held: HashSet::new() }
    }

    #[test]
    #[cfg(windows)]
    fn key_event_fires_once_until_released() {
        let key = parse_accelerator("Ctrl+Shift+1").unwrap();
        let mut state = test_state(key);

        let (swallow, cb) = handle_key_event(&mut state, key.0, key.1, true);
        assert!(swallow && cb.is_some());

        // Auto-repeat while held is swallowed but does not fire again.
        let (swallow, cb) = handle_key_event(&mut state, key.0, key.1, true);
        assert!(swallow && cb.is_none());

        let (swallow, cb) = handle_key_event(&mut state, key.0, 0, false);
        assert!(!swallow && cb.is_none());

        let (_, cb) = handle_key_event(&mut state, key.0, key.1, true);
        assert!(cb.is_some());
    }

    #[test]
    #[cfg(windows)]
    fn held_binding_does_not_refire_while_another_is_pressed() {
        let one = parse_accelerator("Ctrl+1").unwrap();
        let two = parse_accelerator("Ctrl+2").unwrap();
        let mut state = test_state(one);
        state.bindings.insert(two, Arc::new(|| {}));

        assert!(handle_key_event(&mut state, one.0, one.1, true).1.is_some());
        assert!(handle_key_event(&mut state, two.0, two.1, true).1.is_some());
        // Auto-repeat of the first key still held must not fire again.
        assert!(handle_key_event(&mut state, one.0, one.1, true).1.is_none());
        assert!(handle_key_event(&mut state, two.0, two.1, true).1.is_none());
    }

    #[test]
    #[cfg(windows)]
    fn key_event_ignores_unbound_combos() {
        let key = parse_accelerator("Ctrl+Shift+1").unwrap();
        let mut state = test_state(key);
        let (swallow, cb) = handle_key_event(&mut state, key.0, MOD_CTRL, true);
        assert!(!swallow && cb.is_none());
    }

    #[test]
    #[cfg(windows)]
    fn fallback_hook_can_be_cleared_and_reinstalled() {
        register_hook_fallback("Ctrl+Shift+Alt+F12", Arc::new(|| {})).unwrap();
        clear_all_hooks();
        assert!(HOOK_STATE.lock().unwrap().thread.is_none());
        register_hook_fallback("Ctrl+Shift+Alt+F12", Arc::new(|| {})).unwrap();
        assert!(HOOK_STATE.lock().unwrap().thread.is_some());
        clear_all_hooks();
        assert!(HOOK_STATE.lock().unwrap().bindings.is_empty());
    }

    #[test]
    #[cfg(windows)]
    fn parse_accelerator_single_key() {
        let (vk, mods) = parse_accelerator("Alt+1").unwrap();
        assert_eq!(vk, 0x31);
        assert_eq!(mods, MOD_ALT);
    }
}
