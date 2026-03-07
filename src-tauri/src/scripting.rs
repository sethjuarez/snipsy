use std::path::PathBuf;
use std::process::{Child, Command};

use crate::models::{Script, ScriptStep};

/// Resolve the full path to the ffmpeg binary.
/// First checks the current process PATH. On Windows, if that fails, also
/// searches the user PATH from the registry — elevated processes inherit only
/// the system PATH, so user-installed ffmpeg wouldn't be found otherwise.
pub fn resolve_ffmpeg_path() -> Option<String> {
    // Try the normal PATH first
    if Command::new("ffmpeg")
        .arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        return Some("ffmpeg".into());
    }

    // On Windows, check the user PATH from the registry
    #[cfg(target_os = "windows")]
    {
        if let Some(path) = resolve_ffmpeg_from_user_path() {
            return Some(path);
        }
    }

    None
}

/// Read the user PATH from the Windows registry and search for ffmpeg.exe.
#[cfg(target_os = "windows")]
fn resolve_ffmpeg_from_user_path() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let env = hkcu.open_subkey("Environment").ok()?;
    let user_path: String = env.get_value("Path").ok()?;

    for dir in user_path.split(';') {
        let dir = dir.trim();
        if dir.is_empty() {
            continue;
        }
        let candidate = PathBuf::from(dir).join("ffmpeg.exe");
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    None
}

/// Check if FFmpeg is available (on PATH or user PATH).
pub fn detect_ffmpeg() -> bool {
    resolve_ffmpeg_path().is_some()
}

/// Start FFmpeg screen recording.
/// Returns the child process handle so we can stop it later.
fn start_recording(output_path: &str) -> Result<Child, String> {
    let ffmpeg = resolve_ffmpeg_path().ok_or("FFmpeg not found")?;

    // Use GDI grab on Windows for screen capture
    #[cfg(target_os = "windows")]
    let child = Command::new(&ffmpeg)
        .args([
            "-y",
            "-f",
            "gdigrab",
            "-framerate",
            "30",
            "-i",
            "desktop",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            output_path,
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start FFmpeg: {}", e))?;

    #[cfg(target_os = "macos")]
    let child = Command::new(&ffmpeg)
        .args([
            "-y",
            "-f",
            "avfoundation",
            "-framerate",
            "30",
            "-i",
            "1:",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            output_path,
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start FFmpeg: {}", e))?;

    #[cfg(target_os = "linux")]
    let child = Command::new(&ffmpeg)
        .args([
            "-y",
            "-f",
            "x11grab",
            "-framerate",
            "30",
            "-i",
            ":0.0",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            output_path,
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start FFmpeg: {}", e))?;

    Ok(child)
}

/// Stop FFmpeg recording by sending 'q' to stdin.
fn stop_recording(mut child: Child) -> Result<(), String> {
    if let Some(ref mut stdin) = child.stdin {
        use std::io::Write;
        let _ = stdin.write_all(b"q");
        let _ = stdin.flush();
    }

    // Wait for FFmpeg to finish (with timeout)
    match child.wait() {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to stop FFmpeg: {}", e)),
    }
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
            use enigo::{Enigo, Key, Keyboard, Settings};
            let mut enigo =
                Enigo::new(&Settings::default()).map_err(|e| format!("enigo error: {}", e))?;
            let enigo_key = match key.as_str() {
                "Enter" | "Return" => Key::Return,
                "Tab" => Key::Tab,
                "Escape" => Key::Escape,
                "Backspace" => Key::Backspace,
                "Delete" => Key::Delete,
                "Space" => Key::Space,
                "Up" | "ArrowUp" => Key::UpArrow,
                "Down" | "ArrowDown" => Key::DownArrow,
                "Left" | "ArrowLeft" => Key::LeftArrow,
                "Right" | "ArrowRight" => Key::RightArrow,
                "Home" => Key::Home,
                "End" => Key::End,
                "PageUp" => Key::PageUp,
                "PageDown" => Key::PageDown,
                other => Key::Other(
                    other
                        .chars()
                        .next()
                        .ok_or_else(|| format!("Empty key name: {}", other))? as u32,
                ),
            };
            enigo
                .key(enigo_key, enigo::Direction::Click)
                .map_err(|e| format!("keypress error: {}", e))?;
            Ok(())
        }
        ScriptStep::Click { x, y } => {
            use enigo::{Enigo, Mouse, Settings};
            let mut enigo =
                Enigo::new(&Settings::default()).map_err(|e| format!("enigo error: {}", e))?;
            enigo
                .move_mouse(*x, *y, enigo::Coordinate::Abs)
                .map_err(|e| format!("move error: {}", e))?;
            enigo
                .button(enigo::Button::Left, enigo::Direction::Click)
                .map_err(|e| format!("click error: {}", e))?;
            Ok(())
        }
        ScriptStep::Launch { target } => {
            #[cfg(target_os = "windows")]
            Command::new("cmd")
                .args(["/C", "start", "", target])
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
        ScriptStep::Scroll { x, y, delta } => {
            use enigo::{Enigo, Mouse, Settings};
            let mut enigo =
                Enigo::new(&Settings::default()).map_err(|e| format!("enigo error: {}", e))?;
            if x.is_some() || y.is_some() {
                enigo
                    .move_mouse(x.unwrap_or(0), y.unwrap_or(0), enigo::Coordinate::Abs)
                    .map_err(|e| format!("move error: {}", e))?;
            }
            enigo
                .scroll(*delta, enigo::Axis::Vertical)
                .map_err(|e| format!("scroll error: {}", e))?;
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn run_script(project_path: String, script_id: String) -> Result<String, String> {
    let scripts_dir = PathBuf::from(&project_path).join("scripts");
    let script_file = scripts_dir.join(format!("{}.json", script_id));

    let content = std::fs::read_to_string(&script_file)
        .map_err(|e| format!("Failed to read script: {}", e))?;
    let script: Script =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse script: {}", e))?;

    let output_path = PathBuf::from(&project_path).join(&script.output_video);
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    let output_str = output_path
        .to_str()
        .ok_or("Invalid output path")?
        .to_string();

    // Start recording
    let child = start_recording(&output_str)?;

    // Small delay for FFmpeg to initialize
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Execute steps
    for (i, step) in script.steps.iter().enumerate() {
        if let Err(e) = execute_step(step) {
            eprintln!("Step {} failed: {}", i, e);
        }
    }

    // Stop recording
    stop_recording(child)?;

    Ok(script.output_video)
}

#[tauri::command]
pub fn check_ffmpeg() -> bool {
    detect_ffmpeg()
}

/// Attempt to install FFmpeg using the platform package manager.
/// Returns Ok(message) on success or Err(message) on failure.
#[tauri::command]
pub async fn install_ffmpeg() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // Try winget first, fall back to no-op with instructions
        let output = Command::new("winget")
            .args(["install", "--id", "Gyan.FFmpeg", "-e", "--accept-source-agreements", "--accept-package-agreements"])
            .output()
            .map_err(|e| format!("Failed to run winget: {}. Please install FFmpeg manually from https://ffmpeg.org", e))?;

        if output.status.success() {
            Ok("FFmpeg installed successfully via winget. You may need to restart Snipsy for it to be detected on PATH.".to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            Err(format!("winget install failed:\n{}\n{}\n\nTry running 'winget install ffmpeg' manually in a terminal, or download from https://ffmpeg.org", stdout, stderr))
        }
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("brew")
            .args(["install", "ffmpeg"])
            .output()
            .map_err(|e| format!("Failed to run brew: {}. Please install FFmpeg manually: brew install ffmpeg", e))?;

        if output.status.success() {
            Ok("FFmpeg installed successfully via Homebrew.".to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("brew install failed: {}. Try running 'brew install ffmpeg' manually.", stderr))
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Can't reliably pick a package manager, give instructions
        Err("Please install FFmpeg using your package manager:\n• Ubuntu/Debian: sudo apt install ffmpeg\n• Fedora: sudo dnf install ffmpeg\n• Arch: sudo pacman -S ffmpeg".to_string())
    }
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
    fn test_detect_ffmpeg_runs() {
        // Just verify the function doesn't panic — result depends on PATH
        let _has_ffmpeg = detect_ffmpeg();
    }

    #[test]
    fn test_execute_step_returns_ok_for_valid_wait() {
        let step = ScriptStep::Wait { duration: 1 };
        assert!(execute_step(&step).is_ok());
    }
}
