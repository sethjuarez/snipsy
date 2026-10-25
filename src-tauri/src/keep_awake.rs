//! Keeps the computer awake while a demo is live.
//!
//! Windows: a worker thread holds `SetThreadExecutionState` (no sleep, display
//! stays on) and, MouseMover-style, nudges the pointer +1px/-1px via `SendInput`
//! once the user has been idle past a threshold so presence (e.g. Teams) stays
//! Available. It never acts while the user is actively using the machine.
//! macOS: runs `caffeinate -di` tied to this process. Other platforms: no-op.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

pub const IDLE_THRESHOLD: Duration = Duration::from_secs(50);
pub const CHECK_INTERVAL: Duration = Duration::from_secs(15);
const SLICE: Duration = Duration::from_millis(250);

struct Handle {
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
    #[cfg(target_os = "macos")]
    child: Option<std::process::Child>,
}

static ACTIVE: Mutex<Option<Handle>> = Mutex::new(None);

/// Whether a nudge should fire for the given idle time.
pub fn should_nudge(idle: Duration) -> bool {
    idle >= IDLE_THRESHOLD
}

#[cfg(test)]
fn is_active() -> bool {
    ACTIVE.lock().map(|g| g.is_some()).unwrap_or(false)
}

/// Starts keeping the machine awake. Idempotent.
pub fn start() {
    let Ok(mut guard) = ACTIVE.lock() else { return };
    if guard.is_some() {
        return;
    }
    let stop = Arc::new(AtomicBool::new(false));
    let worker = {
        let stop = stop.clone();
        std::thread::Builder::new()
            .name("snipsy-keep-awake".into())
            .spawn(move || worker_loop(stop))
            .map_err(|e| tracing::error!(error = %e, "Failed to start keep-awake thread"))
            .ok()
    };
    #[cfg(target_os = "macos")]
    let child = std::process::Command::new("caffeinate")
        .args(["-di", "-w", &std::process::id().to_string()])
        .spawn()
        .map_err(|e| tracing::warn!(error = %e, "caffeinate failed to start"))
        .ok();
    *guard = Some(Handle {
        stop,
        worker,
        #[cfg(target_os = "macos")]
        child,
    });
    tracing::info!("Keep-awake started");
}

/// Stops keeping the machine awake. Idempotent.
pub fn stop() {
    let handle = ACTIVE.lock().ok().and_then(|mut g| g.take());
    let Some(mut handle) = handle else { return };
    handle.stop.store(true, Ordering::SeqCst);
    if let Some(worker) = handle.worker.take() {
        let _ = worker.join();
    }
    #[cfg(target_os = "macos")]
    if let Some(mut child) = handle.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    tracing::info!("Keep-awake stopped");
}

/// Sleeps up to `total`, returning early (true) when asked to stop.
fn sleep_until_stopped(stop: &AtomicBool, total: Duration) -> bool {
    let mut waited = Duration::ZERO;
    while waited < total {
        if stop.load(Ordering::SeqCst) {
            return true;
        }
        std::thread::sleep(SLICE);
        waited += SLICE;
    }
    stop.load(Ordering::SeqCst)
}

#[cfg(windows)]
fn worker_loop(stop: Arc<AtomicBool>) {
    use windows::Win32::System::Power::{
        SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
    };
    // Execution state is per-thread, so this thread holds it until stop.
    unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED) };
    while !sleep_until_stopped(&stop, CHECK_INTERVAL) {
        if let Some(idle) = win::idle_time() {
            if should_nudge(idle) {
                if let Err(e) = win::nudge() {
                    tracing::warn!(error = %e, "Keep-awake nudge failed");
                }
            }
        }
    }
    unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
}

#[cfg(not(windows))]
fn worker_loop(stop: Arc<AtomicBool>) {
    #[cfg(not(target_os = "macos"))]
    tracing::info!("Keep-awake is not supported on this platform");
    while !sleep_until_stopped(&stop, CHECK_INTERVAL) {}
}

#[cfg(windows)]
mod win {
    use std::time::Duration;
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetLastInputInfo, SendInput, INPUT, INPUT_0, INPUT_MOUSE, LASTINPUTINFO, MOUSEEVENTF_MOVE,
        MOUSEINPUT,
    };

    pub fn idle_time() -> Option<Duration> {
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
            return None;
        }
        let now = unsafe { GetTickCount() };
        Some(Duration::from_millis(now.wrapping_sub(info.dwTime) as u64))
    }

    fn mouse_move(dx: i32) -> INPUT {
        INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_MOVE,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    /// Moves the pointer +1px then -1px so it ends where it started.
    pub fn nudge() -> Result<(), String> {
        let inputs = [mouse_move(1), mouse_move(-1)];
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize == inputs.len() {
            Ok(())
        } else {
            Err(format!("SendInput sent {sent} of {}", inputs.len()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nudges_only_after_idle_threshold() {
        assert!(!should_nudge(Duration::ZERO));
        assert!(!should_nudge(IDLE_THRESHOLD - Duration::from_secs(1)));
        assert!(should_nudge(IDLE_THRESHOLD));
        assert!(should_nudge(Duration::from_secs(600)));
    }

    #[test]
    fn worst_case_idle_stays_under_a_minute_and_a_half() {
        assert!(IDLE_THRESHOLD + CHECK_INTERVAL <= Duration::from_secs(90));
    }

    #[test]
    fn sleep_returns_early_when_stopped() {
        let stop = AtomicBool::new(true);
        let started = std::time::Instant::now();
        assert!(sleep_until_stopped(&stop, Duration::from_secs(30)));
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn start_and_stop_are_idempotent() {
        stop();
        assert!(!is_active());
        start();
        start();
        assert!(is_active());
        stop();
        stop();
        assert!(!is_active());
    }
}
