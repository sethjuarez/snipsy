/// Low-level keyboard hook fallback for when RegisterHotKey fails
/// (e.g., another app already owns the shortcut).
///
/// Uses WH_KEYBOARD_LL which intercepts ALL keyboard input at a very low
/// level — before RegisterHotKey processing — so it can "hijack" any
/// key combination regardless of other registrations.
#[cfg(windows)]
use std::sync::{LazyLock, Mutex};

#[cfg(windows)]
use std::collections::HashMap;

#[cfg(windows)]
use windows::{
    Win32::Foundation::{LPARAM, LRESULT, WPARAM},
    Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, UnhookWindowsHookEx, HHOOK,
        KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
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

/// Callback that fires when the hooked key combo is pressed
#[cfg(windows)]
type HookCallback = Box<dyn Fn() + Send + 'static>;

/// Wrapper to make HHOOK Send-safe (the hook handle is only used from our
/// dedicated hook thread and during cleanup, both properly synchronized).
#[cfg(windows)]
struct SendHook(HHOOK);
#[cfg(windows)]
unsafe impl Send for SendHook {}

#[cfg(windows)]
struct HookState {
    bindings: HashMap<HookKey, HookCallback>,
    hook_handle: Option<SendHook>,
    thread_handle: Option<std::thread::JoinHandle<()>>,
}

#[cfg(windows)]
static HOOK_STATE: LazyLock<Mutex<HookState>> = LazyLock::new(|| {
    Mutex::new(HookState {
        bindings: HashMap::new(),
        hook_handle: None,
        thread_handle: None,
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

/// The actual hook callback invoked by Windows
#[cfg(windows)]
unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let msg_type = wparam.0 as u32;
        if msg_type == WM_KEYDOWN || msg_type == WM_SYSKEYDOWN {
            let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            let vk = kb.vkCode;
            let mods = current_modifiers();
            let key: HookKey = (vk, mods);

            if let Ok(state) = HOOK_STATE.try_lock() {
                if let Some(cb) = state.bindings.get(&key) {
                    cb();
                    // Swallow the key so it doesn't reach the other app
                    return LRESULT(1);
                }
            }
        }
    }
    CallNextHookEx(Some(HHOOK(std::ptr::null_mut() as *mut c_void)), code, wparam, lparam)
}

/// Start the hook thread if not already running
#[cfg(windows)]
fn ensure_hook_thread() {
    let mut state = HOOK_STATE.lock().unwrap();
    if state.thread_handle.is_some() {
        return;
    }

    let handle = std::thread::spawn(|| unsafe {
        let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), None, 0)
            .expect("Failed to install keyboard hook");

        {
            let mut state = HOOK_STATE.lock().unwrap();
            state.hook_handle = Some(SendHook(hook));
        }

        // WH_KEYBOARD_LL requires a message loop on the thread that installed it
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            // We just pump messages to keep the hook alive.
            // A WM_QUIT will break us out of this loop.
        }

        UnhookWindowsHookEx(hook).ok();
    });

    state.thread_handle = Some(handle);
}

/// Register a hotkey via the low-level hook fallback.
/// Call this when tauri_plugin_global_shortcut fails.
#[cfg(windows)]
pub fn register_hook_fallback(accelerator: &str, callback: HookCallback) -> Result<(), String> {
    let key = parse_accelerator(accelerator)
        .ok_or_else(|| format!("Could not parse accelerator: {accelerator}"))?;

    ensure_hook_thread();

    let mut state = HOOK_STATE.lock().unwrap();
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
    let mut state = HOOK_STATE.lock().unwrap();
    state.bindings.clear();

    if let Some(SendHook(hook)) = state.hook_handle.take() {
        unsafe {
            let _ = UnhookWindowsHookEx(hook);
        }
    }
    // We don't join the thread — it will exit when the hook is removed and GetMessage returns false
    state.thread_handle = None;
}

// No-op stubs for non-Windows platforms
#[cfg(not(windows))]
pub fn register_hook_fallback(_accelerator: &str, _callback: Box<dyn Fn() + Send + 'static>) -> Result<(), String> {
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

    #[test]
    #[cfg(windows)]
    fn parse_accelerator_single_key() {
        let (vk, mods) = parse_accelerator("Alt+1").unwrap();
        assert_eq!(vk, 0x31);
        assert_eq!(mods, MOD_ALT);
    }
}
