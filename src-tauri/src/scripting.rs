use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::models::{AutomationContribution, Script, ScriptStep};
use tauri_plugin_auditaur::IpcTraceContext;

/// Parse a key name string into an enigo Key.
fn parse_key(name: &str) -> Result<enigo::Key, String> {
    use enigo::Key;
    Ok(match name.trim() {
        "Enter" | "Return" => Key::Return,
        "Tab" => Key::Tab,
        "Escape" | "Esc" => Key::Escape,
        "Backspace" => Key::Backspace,
        "Delete" => Key::Delete,
        "Space" | " " => Key::Space,
        "Up" | "ArrowUp" => Key::UpArrow,
        "Down" | "ArrowDown" => Key::DownArrow,
        "Left" | "ArrowLeft" => Key::LeftArrow,
        "Right" | "ArrowRight" => Key::RightArrow,
        "Home" => Key::Home,
        "End" => Key::End,
        "PageUp" => Key::PageUp,
        "PageDown" => Key::PageDown,
        "Shift" => Key::Shift,
        "Ctrl" | "Control" => Key::Control,
        "Alt" => Key::Alt,
        "Meta" | "Cmd" | "Win" | "Super" => Key::Meta,
        "F1" => Key::F1,
        "F2" => Key::F2,
        "F3" => Key::F3,
        "F4" => Key::F4,
        "F5" => Key::F5,
        "F6" => Key::F6,
        "F7" => Key::F7,
        "F8" => Key::F8,
        "F9" => Key::F9,
        "F10" => Key::F10,
        "F11" => Key::F11,
        "F12" => Key::F12,
        other => {
            let ch = other
                .chars()
                .next()
                .ok_or_else(|| format!("Empty key name: {}", other))?;
            Key::Other(ch as u32)
        }
    })
}

/// Find a window by title pattern and return its position + size.
/// Uses active-win-pos-rs to enumerate — if the active window matches, use it.
/// Falls back to a substring match via platform APIs.
fn find_window_by_title(title_pattern: &str) -> Option<(f64, f64, f64, f64)> {
    if let Ok(win) = active_win_pos_rs::get_active_window() {
        if win.title.contains(title_pattern) || title_pattern.contains(&win.title) {
            return Some((
                win.position.x,
                win.position.y,
                win.position.width,
                win.position.height,
            ));
        }
    }
    // If active window doesn't match, we can't enumerate all windows with this crate.
    // Fall back to None (will use absolute coords).
    None
}

/// Resolve mouse coordinates: prefer window-relative percentages, fall back to absolute.
fn resolve_coords(
    abs_x: i32,
    abs_y: i32,
    window_title: &Option<String>,
    x_percent: &Option<f64>,
    y_percent: &Option<f64>,
) -> (i32, i32) {
    if let (Some(title), Some(xp), Some(yp)) = (window_title, x_percent, y_percent) {
        if let Some((wx, wy, ww, wh)) = find_window_by_title(title) {
            let resolved_x = (wx + xp * ww) as i32;
            let resolved_y = (wy + yp * wh) as i32;
            return (resolved_x, resolved_y);
        }
        tracing::warn!(
            window_title = %title,
            abs_x,
            abs_y,
            "Script target window not found; falling back to absolute coordinates"
        );
    }
    (abs_x, abs_y)
}

/// Execute a single script step.
fn execute_step(step: &ScriptStep) -> Result<(), String> {
    match step {
        ScriptStep::Wait { duration } => {
            std::thread::sleep(std::time::Duration::from_millis(*duration));
            Ok(())
        }
        ScriptStep::Type { text, delay } => {
            use enigo::{Enigo, Keyboard, Settings};
            let mut enigo =
                Enigo::new(&Settings::default()).map_err(|e| format!("enigo error: {}", e))?;
            let delay_ms = delay.unwrap_or(0);
            for ch in text.chars() {
                enigo
                    .text(&ch.to_string())
                    .map_err(|e| format!("type error: {}", e))?;
                if delay_ms > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(delay_ms as u64));
                }
            }
            Ok(())
        }
        ScriptStep::Keypress { key } => {
            use enigo::{Enigo, Keyboard, Settings};
            let mut enigo =
                Enigo::new(&Settings::default()).map_err(|e| format!("enigo error: {}", e))?;

            // Handle modifier combos like "Ctrl+S", "Shift+Enter", etc.
            let parts: Vec<&str> = key.split('+').collect();
            if parts.len() > 1 {
                // Press modifier keys down
                let modifiers = &parts[..parts.len() - 1];
                let main_key = parts[parts.len() - 1];
                for m in modifiers {
                    let mod_key = parse_key(m)?;
                    enigo
                        .key(mod_key, enigo::Direction::Press)
                        .map_err(|e| format!("modifier press error: {}", e))?;
                }
                // Click the main key
                let mk = parse_key(main_key)?;
                enigo
                    .key(mk, enigo::Direction::Click)
                    .map_err(|e| format!("keypress error: {}", e))?;
                // Release modifier keys
                for m in modifiers.iter().rev() {
                    let mod_key = parse_key(m)?;
                    enigo
                        .key(mod_key, enigo::Direction::Release)
                        .map_err(|e| format!("modifier release error: {}", e))?;
                }
            } else {
                let enigo_key = parse_key(key)?;
                enigo
                    .key(enigo_key, enigo::Direction::Click)
                    .map_err(|e| format!("keypress error: {}", e))?;
            }
            Ok(())
        }
        ScriptStep::Click {
            x,
            y,
            button,
            window_title,
            x_percent,
            y_percent,
            ..
        } => {
            use enigo::{Enigo, Mouse, Settings};
            let mut enigo =
                Enigo::new(&Settings::default()).map_err(|e| format!("enigo error: {}", e))?;
            let (rx, ry) = resolve_coords(*x, *y, window_title, x_percent, y_percent);
            enigo
                .move_mouse(rx, ry, enigo::Coordinate::Abs)
                .map_err(|e| format!("move error: {}", e))?;
            let btn = match button.as_deref() {
                Some("right") => enigo::Button::Right,
                Some("middle") => enigo::Button::Middle,
                _ => enigo::Button::Left,
            };
            enigo
                .button(btn, enigo::Direction::Click)
                .map_err(|e| format!("click error: {}", e))?;
            Ok(())
        }
        ScriptStep::Launch { target } => {
            #[cfg(target_os = "windows")]
            Command::new("cmd")
                .args(["/C", "start", "", target])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .spawn()
                .map_err(|e| format!("launch error: {}", e))?;
            #[cfg(target_os = "macos")]
            Command::new("open")
                .arg(target)
                .spawn()
                .map_err(|e| format!("launch error: {}", e))?;
            #[cfg(target_os = "linux")]
            Command::new("xdg-open")
                .arg(target)
                .spawn()
                .map_err(|e| format!("launch error: {}", e))?;
            Ok(())
        }
        ScriptStep::Scroll {
            x,
            y,
            delta,
            window_title,
            x_percent,
            y_percent,
            ..
        } => {
            use enigo::{Enigo, Mouse, Settings};
            let mut enigo =
                Enigo::new(&Settings::default()).map_err(|e| format!("enigo error: {}", e))?;
            if x.is_some() || y.is_some() {
                let (rx, ry) = resolve_coords(
                    x.unwrap_or(0),
                    y.unwrap_or(0),
                    window_title,
                    x_percent,
                    y_percent,
                );
                enigo
                    .move_mouse(rx, ry, enigo::Coordinate::Abs)
                    .map_err(|e| format!("move error: {}", e))?;
            }
            enigo
                .scroll(*delta, enigo::Axis::Vertical)
                .map_err(|e| format!("scroll error: {}", e))?;
            Ok(())
        }
        ScriptStep::Move {
            x,
            y,
            window_title,
            x_percent,
            y_percent,
        } => {
            use enigo::{Enigo, Mouse, Settings};
            let mut enigo =
                Enigo::new(&Settings::default()).map_err(|e| format!("enigo error: {}", e))?;
            let (rx, ry) = resolve_coords(*x, *y, window_title, x_percent, y_percent);
            enigo
                .move_mouse(rx, ry, enigo::Coordinate::Abs)
                .map_err(|e| format!("move error: {}", e))?;
            Ok(())
        }
    }
}

fn automation_file(project_path: &str, script_id: &str) -> PathBuf {
    PathBuf::from(project_path)
        .join("automations")
        .join(format!("{}.json", script_id))
}

fn load_automation(project_path: &str, script_id: &str) -> Result<Script, String> {
    let script_file = automation_file(project_path, script_id);
    let content = std::fs::read_to_string(&script_file)
        .map_err(|e| format!("Failed to read automation: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse automation: {}", e))
}

fn idempotency_key(contribution: &AutomationContribution) -> String {
    match contribution {
        AutomationContribution::OpenSite {
            id,
            url,
            idempotency_key,
            ..
        } => {
            let key = idempotency_key
                .clone()
                .unwrap_or_else(|| format!("openSite:{}", url.trim().to_ascii_lowercase()));
            if key.trim().is_empty() {
                id.clone()
            } else {
                key
            }
        }
    }
}

fn validate_site_url(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("Open site contributions require an http:// or https:// URL.".into());
    }
    if trimmed.chars().any(char::is_control) || trimmed.contains('"') {
        return Err("Open site URL contains unsupported characters.".into());
    }
    Ok(())
}

fn open_site(url: &str) -> Result<(), String> {
    validate_site_url(url)?;
    let url = url.trim();
    #[cfg(target_os = "windows")]
    Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url])
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("open site error: {}", e))?;
    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|e| format!("open site error: {}", e))?;
    #[cfg(target_os = "linux")]
    Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map_err(|e| format!("open site error: {}", e))?;
    Ok(())
}

fn execute_contribution(contribution: &AutomationContribution) -> Result<(), String> {
    match contribution {
        AutomationContribution::OpenSite { url, .. } => open_site(url),
    }
}

fn execute_contribution_groups(script: &Script) -> Result<usize, String> {
    let mut executed = HashSet::new();
    let mut count = 0;
    for group in &script.contribution_groups {
        for contribution in &group.contributions {
            let key = idempotency_key(contribution);
            if !executed.insert(key.clone()) {
                tracing::info!(idempotency_key = %key, "Skipping already executed automation contribution");
                continue;
            }
            execute_contribution(contribution)?;
            count += 1;
        }
    }
    Ok(count)
}

fn validate_script_platform(script: &Script) -> Result<(), String> {
    if let Some(ref platform) = script.platform {
        let current = match std::env::consts::OS {
            "windows" => "windows",
            "macos" => "macos",
            "linux" => "linux",
            other => other,
        };
        if platform != current {
            return Err(format!(
                "This automation was recorded on {} and cannot run on {}. Recorded steps are OS-specific.",
                platform, current
            ));
        }
    }
    Ok(())
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub async fn run_automation(
    project_path: String,
    script_id: String,
    auditaur_trace_context: Option<IpcTraceContext>,
) -> Result<String, String> {
    let script = load_automation(&project_path, &script_id)?;
    validate_script_platform(&script)?;

    let contribution_count = execute_contribution_groups(&script)?;
    for (i, step) in script.steps.iter().enumerate() {
        if let Err(e) = execute_step(step) {
            tracing::error!(step_index = i, error = %e, "Automation step failed");
            return Err(format!("Automation step {} failed: {}", i + 1, e));
        }
    }

    Ok(format!(
        "Ran {} contribution{} and {} recording step{}.",
        contribution_count,
        if contribution_count == 1 { "" } else { "s" },
        script.steps.len(),
        if script.steps.len() == 1 { "" } else { "s" },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_wait_step() {
        let step = ScriptStep::Wait { duration: 10 };
        let result = execute_step(&step);
        assert!(result.is_ok());
    }

    #[test]
    fn test_execute_step_returns_ok_for_valid_wait() {
        let step = ScriptStep::Wait { duration: 1 };
        assert!(execute_step(&step).is_ok());
    }

    #[test]
    fn resolve_coords_uses_absolute_when_no_window_info() {
        let (rx, ry) = resolve_coords(500, 300, &None, &None, &None);
        assert_eq!(rx, 500);
        assert_eq!(ry, 300);
    }

    #[test]
    fn resolve_coords_uses_absolute_when_partial_info() {
        // Missing y_percent — should fall back to absolute
        let (rx, ry) = resolve_coords(500, 300, &Some("VS Code".into()), &Some(0.5), &None);
        assert_eq!(rx, 500);
        assert_eq!(ry, 300);
    }

    #[test]
    fn rejects_non_http_open_site_urls() {
        assert!(validate_site_url("file:///tmp/demo").is_err());
        assert!(validate_site_url("https://snipsy.dev").is_ok());
    }

    #[test]
    fn duplicate_contribution_keys_are_idempotent_per_run() {
        let script = Script {
            id: "automation-1".into(),
            title: "Demo".into(),
            description: "".into(),
            hotkey: None,
            steps: vec![],
            contribution_groups: vec![crate::models::AutomationContributionGroup {
                id: "group-1".into(),
                title: "Setup".into(),
                contributions: vec![
                    AutomationContribution::OpenSite {
                        id: "site-1".into(),
                        title: None,
                        url: "https://snipsy.dev".into(),
                        idempotency_key: Some("docs".into()),
                    },
                    AutomationContribution::OpenSite {
                        id: "site-2".into(),
                        title: None,
                        url: "https://snipsy.dev".into(),
                        idempotency_key: Some("docs".into()),
                    },
                ],
            }],
            output_video: None,
            platform: None,
            start_screenshot: None,
            recorded_at: None,
            stream_deck_icon: None,
        };

        let keys = script.contribution_groups[0]
            .contributions
            .iter()
            .map(idempotency_key)
            .collect::<Vec<_>>();

        assert_eq!(keys, vec!["docs", "docs"]);
    }
}
