use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::models::{Script, ScriptStep};

/// Raw input event captured during recording, before consolidation.
#[derive(Debug, Clone)]
struct RawEvent {
    timestamp: Instant,
    kind: RawEventKind,
}

#[derive(Debug, Clone)]
enum RawEventKind {
    KeyPress {
        key: rdev::Key,
        name: Option<String>,
    },
    KeyRelease {
        key: rdev::Key,
    },
    MouseClick {
        x: f64,
        y: f64,
        button: rdev::Button,
    },
    MouseRelease {
        #[allow(dead_code)]
        x: f64,
        #[allow(dead_code)]
        y: f64,
        #[allow(dead_code)]
        button: rdev::Button,
    },
    MouseMove {
        x: f64,
        y: f64,
    },
    Scroll {
        x: f64,
        y: f64,
        delta_y: i64,
    },
}

/// Window context captured at the time of a mouse event.
#[derive(Debug, Clone)]
struct WindowContext {
    title: String,
    #[allow(dead_code)]
    class: Option<String>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn capture_window_context() -> Option<WindowContext> {
    let win = active_win_pos_rs::get_active_window().ok()?;
    Some(WindowContext {
        title: win.title,
        class: None, // active-win-pos-rs doesn't expose window class
        x: win.position.x,
        y: win.position.y,
        width: win.position.width,
        height: win.position.height,
    })
}

/// Compute window-relative percentage coordinates.
fn to_percent(
    abs_x: f64,
    abs_y: f64,
    ctx: &WindowContext,
) -> (f64, f64) {
    if ctx.width > 0.0 && ctx.height > 0.0 {
        let xp = ((abs_x - ctx.x) / ctx.width).clamp(0.0, 1.0);
        let yp = ((abs_y - ctx.y) / ctx.height).clamp(0.0, 1.0);
        (xp, yp)
    } else {
        (0.5, 0.5)
    }
}

fn button_str(button: &rdev::Button) -> &'static str {
    match button {
        rdev::Button::Left => "left",
        rdev::Button::Right => "right",
        rdev::Button::Middle => "middle",
        _ => "left",
    }
}

/// Shared state for recording session.
pub struct RecorderState {
    recording: AtomicBool,
    events: Mutex<Vec<RawEvent>>,
    start_time: Mutex<Option<Instant>>,
    stop_flag: Arc<AtomicBool>,
}

impl Default for RecorderState {
    fn default() -> Self {
        Self {
            recording: AtomicBool::new(false),
            events: Mutex::new(Vec::new()),
            start_time: Mutex::new(None),
            stop_flag: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// Take a screenshot of the primary monitor and save it.
fn capture_start_screenshot(project_path: &str) -> Option<String> {
    let monitors = xcap::Monitor::all().ok()?;
    let primary = monitors.into_iter().find(|m| m.is_primary().unwrap_or(false))?;
    let img = primary.capture_image().ok()?;
    let screenshots_dir = PathBuf::from(project_path).join("screenshots");
    std::fs::create_dir_all(&screenshots_dir).ok()?;
    let filename = format!("start-{}.png", uuid::Uuid::new_v4());
    let path = screenshots_dir.join(&filename);
    img.save(&path).ok()?;
    Some(format!("screenshots/{}", filename))
}

/// Start recording global input events.
#[tauri::command]
pub fn start_recording_script(
    project_path: String,
    state: tauri::State<'_, RecorderState>,
) -> Result<String, String> {
    if state.recording.load(Ordering::SeqCst) {
        return Err("Already recording".into());
    }

    // Capture initial screenshot
    let screenshot = capture_start_screenshot(&project_path);

    // Reset state
    state.events.lock().unwrap().clear();
    *state.start_time.lock().unwrap() = Some(Instant::now());
    state.stop_flag.store(false, Ordering::SeqCst);
    state.recording.store(true, Ordering::SeqCst);

    let events = Arc::new(Mutex::new(Vec::<RawEvent>::new()));
    let stop_flag = state.stop_flag.clone();
    let events_clone = events.clone();

    // Spawn listener thread
    std::thread::spawn(move || {
        let events_inner = events_clone;
        let stop = stop_flag;

        // rdev::listen is blocking — it calls our callback for every event
        let _ = rdev::listen(move |event| {
            if stop.load(Ordering::SeqCst) {
                return;
            }

            let kind = match event.event_type {
                rdev::EventType::KeyPress(key) => Some(RawEventKind::KeyPress {
                    key,
                    name: event.name.clone(),
                }),
                rdev::EventType::KeyRelease(key) => {
                    Some(RawEventKind::KeyRelease { key })
                }
                rdev::EventType::ButtonPress(button) => {
                    // Get mouse position from the last known move or use (0,0)
                    let events = events_inner.lock().unwrap();
                    let (x, y) = events
                        .iter()
                        .rev()
                        .find_map(|e| match &e.kind {
                            RawEventKind::MouseMove { x, y } => Some((*x, *y)),
                            _ => None,
                        })
                        .unwrap_or((0.0, 0.0));
                    drop(events);
                    Some(RawEventKind::MouseClick { x, y, button })
                }
                rdev::EventType::ButtonRelease(button) => {
                    let events = events_inner.lock().unwrap();
                    let (x, y) = events
                        .iter()
                        .rev()
                        .find_map(|e| match &e.kind {
                            RawEventKind::MouseMove { x, y } => Some((*x, *y)),
                            _ => None,
                        })
                        .unwrap_or((0.0, 0.0));
                    drop(events);
                    Some(RawEventKind::MouseRelease { x, y, button })
                }
                rdev::EventType::MouseMove { x, y } => {
                    Some(RawEventKind::MouseMove { x, y })
                }
                rdev::EventType::Wheel { delta_x: _, delta_y } => {
                    let events = events_inner.lock().unwrap();
                    let (x, y) = events
                        .iter()
                        .rev()
                        .find_map(|e| match &e.kind {
                            RawEventKind::MouseMove { x, y } => Some((*x, *y)),
                            _ => None,
                        })
                        .unwrap_or((0.0, 0.0));
                    drop(events);
                    Some(RawEventKind::Scroll { x, y, delta_y })
                }
            };

            if let Some(kind) = kind {
                events_inner.lock().unwrap().push(RawEvent {
                    timestamp: Instant::now(),
                    kind,
                });
            }
        });
    });

    // Store the events Arc in a global so stop can access it
    // We use the Mutex<Vec> inside RecorderState for this
    *state.events.lock().unwrap() = Vec::new();

    // We need a way to get the events from the listener thread back.
    // Since rdev::listen blocks, we store the Arc<Mutex<Vec>> in a separate global.
    RECORDING_EVENTS
        .lock()
        .unwrap()
        .replace(events);
    RECORDING_SCREENSHOT
        .lock()
        .unwrap()
        .clone_from(&screenshot);

    Ok(screenshot.unwrap_or_default())
}

/// Global storage for the events Arc used by the listener thread.
static RECORDING_EVENTS: std::sync::LazyLock<Mutex<Option<Arc<Mutex<Vec<RawEvent>>>>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));
static RECORDING_SCREENSHOT: std::sync::LazyLock<Mutex<Option<String>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

/// Stop recording and return the consolidated Script.
#[tauri::command]
pub fn stop_recording_script(
    project_path: String,
    title: String,
    description: String,
    state: tauri::State<'_, RecorderState>,
) -> Result<Script, String> {
    if !state.recording.load(Ordering::SeqCst) {
        return Err("Not recording".into());
    }

    // Signal the listener to stop
    state.stop_flag.store(true, Ordering::SeqCst);
    state.recording.store(false, Ordering::SeqCst);

    // Give a moment for any in-flight events
    std::thread::sleep(Duration::from_millis(100));

    // Grab the events
    let events_arc = RECORDING_EVENTS
        .lock()
        .unwrap()
        .take()
        .ok_or("No recording events found")?;
    let events = events_arc.lock().unwrap().clone();
    let screenshot = RECORDING_SCREENSHOT.lock().unwrap().take();

    // Consolidate raw events into script steps
    let steps = consolidate_events(&events);

    let platform = match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        "linux" => "linux",
        other => other,
    }
    .to_string();

    let script_id = uuid::Uuid::new_v4().to_string();
    let output_video = format!("videos/script-{}.mp4", &script_id[..8]);

    let script = Script {
        id: script_id.clone(),
        title,
        description,
        steps,
        output_video,
        platform: Some(platform),
        start_screenshot: screenshot,
        recorded_at: Some(chrono_now()),
    };

    // Save the script to disk
    let scripts_dir = PathBuf::from(&project_path).join("scripts");
    std::fs::create_dir_all(&scripts_dir)
        .map_err(|e| format!("Failed to create scripts dir: {}", e))?;
    let script_file = scripts_dir.join(format!("{}.json", script_id));
    let json = serde_json::to_string_pretty(&script)
        .map_err(|e| format!("Failed to serialize script: {}", e))?;
    std::fs::write(&script_file, json)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    Ok(script)
}

/// Check if currently recording.
#[tauri::command]
pub fn is_recording(state: tauri::State<'_, RecorderState>) -> bool {
    state.recording.load(Ordering::SeqCst)
}

/// Generate an ISO timestamp string without requiring chrono crate.
fn chrono_now() -> String {
    let now = std::time::SystemTime::now();
    let duration = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // Simple ISO-8601-ish format: just seconds since epoch as a string
    // For a proper ISO string we'd need chrono, but this is fine for now
    format!("{}", secs)
}

/// Modifier keys we track for combo detection.
fn is_modifier(key: &rdev::Key) -> bool {
    matches!(
        key,
        rdev::Key::ShiftLeft
            | rdev::Key::ShiftRight
            | rdev::Key::ControlLeft
            | rdev::Key::ControlRight
            | rdev::Key::Alt
            | rdev::Key::AltGr
            | rdev::Key::MetaLeft
            | rdev::Key::MetaRight
    )
}

fn key_to_name(key: &rdev::Key, name: &Option<String>) -> String {
    // If rdev provides a character name, use it
    if let Some(n) = name {
        if !n.is_empty() {
            return n.clone();
        }
    }
    // Otherwise map known keys
    match key {
        rdev::Key::Return => "Enter".into(),
        rdev::Key::Tab => "Tab".into(),
        rdev::Key::Escape => "Escape".into(),
        rdev::Key::Backspace => "Backspace".into(),
        rdev::Key::Delete => "Delete".into(),
        rdev::Key::Space => "Space".into(),
        rdev::Key::UpArrow => "ArrowUp".into(),
        rdev::Key::DownArrow => "ArrowDown".into(),
        rdev::Key::LeftArrow => "ArrowLeft".into(),
        rdev::Key::RightArrow => "ArrowRight".into(),
        rdev::Key::Home => "Home".into(),
        rdev::Key::End => "End".into(),
        rdev::Key::PageUp => "PageUp".into(),
        rdev::Key::PageDown => "PageDown".into(),
        rdev::Key::ShiftLeft | rdev::Key::ShiftRight => "Shift".into(),
        rdev::Key::ControlLeft | rdev::Key::ControlRight => "Ctrl".into(),
        rdev::Key::Alt | rdev::Key::AltGr => "Alt".into(),
        rdev::Key::MetaLeft | rdev::Key::MetaRight => "Meta".into(),
        rdev::Key::F1 => "F1".into(),
        rdev::Key::F2 => "F2".into(),
        rdev::Key::F3 => "F3".into(),
        rdev::Key::F4 => "F4".into(),
        rdev::Key::F5 => "F5".into(),
        rdev::Key::F6 => "F6".into(),
        rdev::Key::F7 => "F7".into(),
        rdev::Key::F8 => "F8".into(),
        rdev::Key::F9 => "F9".into(),
        rdev::Key::F10 => "F10".into(),
        rdev::Key::F11 => "F11".into(),
        rdev::Key::F12 => "F12".into(),
        other => format!("{:?}", other),
    }
}

/// Convert raw events into consolidated ScriptSteps.
fn consolidate_events(events: &[RawEvent]) -> Vec<ScriptStep> {
    if events.is_empty() {
        return Vec::new();
    }

    let mut steps: Vec<ScriptStep> = Vec::new();
    let mut char_buffer: Vec<String> = Vec::new();
    let mut char_start: Option<Instant> = None;
    let mut last_event_time = events[0].timestamp;
    let mut held_modifiers: Vec<rdev::Key> = Vec::new();

    // Flush accumulated characters as a Type step
    let flush_chars = |buf: &mut Vec<String>, steps: &mut Vec<ScriptStep>| {
        if !buf.is_empty() {
            let text = buf.join("");
            steps.push(ScriptStep::Type {
                text,
                delay: Some(30), // default inter-char delay
            });
            buf.clear();
        }
    };

    for event in events {
        // Insert wait steps for gaps > 200ms
        let gap = event.timestamp.duration_since(last_event_time);
        if gap > Duration::from_millis(200) && !char_buffer.is_empty() {
            // Flush any pending chars before the wait
            flush_chars(&mut char_buffer, &mut steps);
            char_start = None;
        }
        if gap > Duration::from_millis(200) {
            steps.push(ScriptStep::Wait {
                duration: gap.as_millis() as u64,
            });
        }

        match &event.kind {
            RawEventKind::KeyPress { key, name } => {
                if is_modifier(key) {
                    if !held_modifiers.contains(key) {
                        held_modifiers.push(*key);
                    }
                } else if !held_modifiers.is_empty() {
                    // Modifier combo → keypress step
                    flush_chars(&mut char_buffer, &mut steps);
                    char_start = None;
                    let mut combo_parts: Vec<String> = held_modifiers
                        .iter()
                        .map(|m| key_to_name(m, &None))
                        .collect();
                    combo_parts.push(key_to_name(key, name));
                    steps.push(ScriptStep::Keypress {
                        key: combo_parts.join("+"),
                    });
                } else {
                    // Regular key — check if it's a printable character
                    let key_name = key_to_name(key, name);
                    if key_name.len() == 1 && key_name.chars().next().map_or(false, |c| !c.is_control()) {
                        // Printable character → accumulate into type buffer
                        if char_start.is_none() {
                            char_start = Some(event.timestamp);
                        }
                        char_buffer.push(key_name);
                    } else {
                        // Special key (Enter, Tab, etc.) → keypress step
                        flush_chars(&mut char_buffer, &mut steps);
                        char_start = None;
                        steps.push(ScriptStep::Keypress { key: key_name });
                    }
                }
            }
            RawEventKind::KeyRelease { key } => {
                if is_modifier(key) {
                    held_modifiers.retain(|m| m != key);
                }
                // Key releases are not recorded as steps
            }
            RawEventKind::MouseClick { x, y, button } => {
                flush_chars(&mut char_buffer, &mut steps);
                char_start = None;
                let ctx = capture_window_context();
                let (xp, yp) = ctx
                    .as_ref()
                    .map(|c| to_percent(*x, *y, c))
                    .unwrap_or((0.5, 0.5));
                steps.push(ScriptStep::Click {
                    x: *x as i32,
                    y: *y as i32,
                    window_title: ctx.as_ref().map(|c| c.title.clone()),
                    window_class: None,
                    x_percent: Some(xp),
                    y_percent: Some(yp),
                    button: Some(button_str(button).to_string()),
                    automation_id: None,
                    control_name: None,
                    control_type: None,
                });
            }
            RawEventKind::MouseRelease { .. } => {
                // Mouse releases are not recorded as separate steps
            }
            RawEventKind::MouseMove { .. } => {
                // Mouse moves are thinned: only record if significant movement
                // and part of a drag. For now, skip standalone moves.
                // Phase 3 can add drag detection.
            }
            RawEventKind::Scroll { x, y, delta_y } => {
                flush_chars(&mut char_buffer, &mut steps);
                char_start = None;

                // Coalesce with previous scroll if within 100ms and same position area
                let coalesced = if let Some(ScriptStep::Scroll { delta, .. }) = steps.last_mut() {
                    *delta += *delta_y as i32;
                    true
                } else {
                    false
                };

                if !coalesced {
                    let ctx = capture_window_context();
                    let (xp, yp) = ctx
                        .as_ref()
                        .map(|c| to_percent(*x, *y, c))
                        .unwrap_or((0.5, 0.5));
                    steps.push(ScriptStep::Scroll {
                        delta: *delta_y as i32,
                        x: Some(*x as i32),
                        y: Some(*y as i32),
                        window_title: ctx.as_ref().map(|c| c.title.clone()),
                        window_class: None,
                        x_percent: Some(xp),
                        y_percent: Some(yp),
                        automation_id: None,
                        control_name: None,
                        control_type: None,
                    });
                }
            }
        }

        last_event_time = event.timestamp;
    }

    // Flush remaining chars
    flush_chars(&mut char_buffer, &mut steps);

    // Remove leading/trailing waits that are likely noise
    while steps.first().map_or(false, |s| matches!(s, ScriptStep::Wait { .. })) {
        steps.remove(0);
    }
    while steps.last().map_or(false, |s| matches!(s, ScriptStep::Wait { .. })) {
        steps.pop();
    }

    steps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn consolidate_empty_events() {
        let steps = consolidate_events(&[]);
        assert!(steps.is_empty());
    }

    #[test]
    fn consolidate_keypresses_into_type() {
        let base = Instant::now();
        let events = vec![
            RawEvent {
                timestamp: base,
                kind: RawEventKind::KeyPress {
                    key: rdev::Key::KeyH,
                    name: Some("h".into()),
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(50),
                kind: RawEventKind::KeyRelease {
                    key: rdev::Key::KeyH,
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(100),
                kind: RawEventKind::KeyPress {
                    key: rdev::Key::KeyI,
                    name: Some("i".into()),
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(150),
                kind: RawEventKind::KeyRelease {
                    key: rdev::Key::KeyI,
                },
            },
        ];
        let steps = consolidate_events(&events);
        assert_eq!(steps.len(), 1);
        if let ScriptStep::Type { text, .. } = &steps[0] {
            assert_eq!(text, "hi");
        } else {
            panic!("Expected Type step, got {:?}", steps[0]);
        }
    }

    #[test]
    fn consolidate_modifier_combo() {
        let base = Instant::now();
        let events = vec![
            RawEvent {
                timestamp: base,
                kind: RawEventKind::KeyPress {
                    key: rdev::Key::ControlLeft,
                    name: None,
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(50),
                kind: RawEventKind::KeyPress {
                    key: rdev::Key::KeyS,
                    name: Some("s".into()),
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(100),
                kind: RawEventKind::KeyRelease {
                    key: rdev::Key::KeyS,
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(120),
                kind: RawEventKind::KeyRelease {
                    key: rdev::Key::ControlLeft,
                },
            },
        ];
        let steps = consolidate_events(&events);
        assert_eq!(steps.len(), 1);
        if let ScriptStep::Keypress { key } = &steps[0] {
            assert_eq!(key, "Ctrl+s");
        } else {
            panic!("Expected Keypress step, got {:?}", steps[0]);
        }
    }

    #[test]
    fn consolidate_wait_gap() {
        let base = Instant::now();
        let events = vec![
            RawEvent {
                timestamp: base,
                kind: RawEventKind::KeyPress {
                    key: rdev::Key::KeyA,
                    name: Some("a".into()),
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(50),
                kind: RawEventKind::KeyRelease {
                    key: rdev::Key::KeyA,
                },
            },
            // 500ms gap
            RawEvent {
                timestamp: base + Duration::from_millis(550),
                kind: RawEventKind::KeyPress {
                    key: rdev::Key::KeyB,
                    name: Some("b".into()),
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(600),
                kind: RawEventKind::KeyRelease {
                    key: rdev::Key::KeyB,
                },
            },
        ];
        let steps = consolidate_events(&events);
        // Should be: Type("a"), Wait(500), Type("b")
        assert_eq!(steps.len(), 3);
        assert!(matches!(&steps[0], ScriptStep::Type { text, .. } if text == "a"));
        assert!(matches!(&steps[1], ScriptStep::Wait { duration } if *duration >= 450));
        assert!(matches!(&steps[2], ScriptStep::Type { text, .. } if text == "b"));
    }

    #[test]
    fn consolidate_mouse_click() {
        let base = Instant::now();
        let events = vec![
            RawEvent {
                timestamp: base,
                kind: RawEventKind::MouseMove { x: 500.0, y: 300.0 },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(50),
                kind: RawEventKind::MouseClick {
                    x: 500.0,
                    y: 300.0,
                    button: rdev::Button::Left,
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(100),
                kind: RawEventKind::MouseRelease {
                    x: 500.0,
                    y: 300.0,
                    button: rdev::Button::Left,
                },
            },
        ];
        let steps = consolidate_events(&events);
        assert_eq!(steps.len(), 1);
        if let ScriptStep::Click { x, y, button, .. } = &steps[0] {
            assert_eq!(*x, 500);
            assert_eq!(*y, 300);
            assert_eq!(button.as_deref(), Some("left"));
        } else {
            panic!("Expected Click step");
        }
    }

    #[test]
    fn consolidate_scroll_coalesce() {
        let base = Instant::now();
        let events = vec![
            RawEvent {
                timestamp: base,
                kind: RawEventKind::MouseMove { x: 400.0, y: 200.0 },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(10),
                kind: RawEventKind::Scroll { x: 400.0, y: 200.0, delta_y: -3 },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(30),
                kind: RawEventKind::Scroll { x: 400.0, y: 200.0, delta_y: -2 },
            },
        ];
        let steps = consolidate_events(&events);
        assert_eq!(steps.len(), 1);
        if let ScriptStep::Scroll { delta, .. } = &steps[0] {
            assert_eq!(*delta, -5); // coalesced
        } else {
            panic!("Expected Scroll step");
        }
    }

    #[test]
    fn consolidate_special_key_breaks_type() {
        let base = Instant::now();
        let events = vec![
            RawEvent {
                timestamp: base,
                kind: RawEventKind::KeyPress {
                    key: rdev::Key::KeyH,
                    name: Some("h".into()),
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(50),
                kind: RawEventKind::KeyRelease { key: rdev::Key::KeyH },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(100),
                kind: RawEventKind::KeyPress {
                    key: rdev::Key::Return,
                    name: None,
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(150),
                kind: RawEventKind::KeyRelease { key: rdev::Key::Return },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(180),
                kind: RawEventKind::KeyPress {
                    key: rdev::Key::KeyW,
                    name: Some("w".into()),
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(200),
                kind: RawEventKind::KeyRelease { key: rdev::Key::KeyW },
            },
        ];
        let steps = consolidate_events(&events);
        // h → Type("h"), Enter → Keypress("Enter"), w → Type("w")
        assert_eq!(steps.len(), 3);
        assert!(matches!(&steps[0], ScriptStep::Type { text, .. } if text == "h"));
        assert!(matches!(&steps[1], ScriptStep::Keypress { key } if key == "Enter"));
        assert!(matches!(&steps[2], ScriptStep::Type { text, .. } if text == "w"));
    }

    #[test]
    fn strips_leading_trailing_waits() {
        let base = Instant::now();
        let events = vec![
            RawEvent {
                timestamp: base + Duration::from_millis(500),
                kind: RawEventKind::KeyPress {
                    key: rdev::Key::KeyA,
                    name: Some("a".into()),
                },
            },
            RawEvent {
                timestamp: base + Duration::from_millis(550),
                kind: RawEventKind::KeyRelease { key: rdev::Key::KeyA },
            },
        ];
        let steps = consolidate_events(&events);
        // Should not start with a Wait even though first event is 500ms from base
        assert_eq!(steps.len(), 1);
        assert!(matches!(&steps[0], ScriptStep::Type { text, .. } if text == "a"));
    }

    #[test]
    fn to_percent_calculates_correctly() {
        let ctx = WindowContext {
            title: "Test".into(),
            class: None,
            x: 100.0,
            y: 50.0,
            width: 800.0,
            height: 600.0,
        };
        let (xp, yp) = to_percent(500.0, 350.0, &ctx);
        assert!((xp - 0.5).abs() < 0.001);
        assert!((yp - 0.5).abs() < 0.001);
    }

    #[test]
    fn to_percent_clamps() {
        let ctx = WindowContext {
            title: "Test".into(),
            class: None,
            x: 100.0,
            y: 50.0,
            width: 800.0,
            height: 600.0,
        };
        // Outside window bounds
        let (xp, yp) = to_percent(50.0, 20.0, &ctx);
        assert_eq!(xp, 0.0);
        assert_eq!(yp, 0.0);
    }
}
