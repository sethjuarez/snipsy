use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "ffmpeg-settings.json";

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FfmpegSettings {
    ffmpeg_executable_path: Option<String>,
    ffprobe_executable_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegStatus {
    pub available: bool,
    pub ffmpeg: ToolStatus,
    pub ffprobe: ToolStatus,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to determine the Snipsy settings directory: {error}"))?;
    Ok(app_data_dir.join(SETTINGS_FILE))
}

fn read_settings(app: &AppHandle) -> Result<FfmpegSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(FfmpegSettings::default());
    }

    let content = fs::read_to_string(&path).map_err(|error| {
        format!(
            "Failed to read FFmpeg settings at {}: {error}",
            path.display()
        )
    })?;
    serde_json::from_str(&content).map_err(|error| {
        format!(
            "Failed to parse FFmpeg settings at {}: {error}",
            path.display()
        )
    })
}

fn write_settings(app: &AppHandle, settings: &FfmpegSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "FFmpeg settings path has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create the Snipsy settings directory: {error}"))?;
    let content = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Failed to serialize FFmpeg settings: {error}"))?;
    fs::write(&path, content).map_err(|error| {
        format!(
            "Failed to save FFmpeg settings at {}: {error}",
            path.display()
        )
    })
}

fn executable_names(tool: &str) -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        vec![format!("{tool}.exe"), tool.to_string()]
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![tool.to_string()]
    }
}

fn path_candidates(tool: &str) -> Vec<PathBuf> {
    env::var_os("PATH")
        .map(|path| {
            env::split_paths(&path)
                .flat_map(|directory| {
                    executable_names(tool)
                        .into_iter()
                        .map(move |name| directory.join(name))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn common_directory_candidates() -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let mut directories = Vec::new();
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            let local_app_data = PathBuf::from(local_app_data);
            directories.push(
                local_app_data
                    .join("Microsoft")
                    .join("WinGet")
                    .join("Links"),
            );
            let winget_packages = local_app_data
                .join("Microsoft")
                .join("WinGet")
                .join("Packages");
            if let Ok(entries) = fs::read_dir(winget_packages) {
                for entry in entries.flatten() {
                    let package = entry.path();
                    if package
                        .file_name()
                        .and_then(|name| name.to_str())
                        .is_some_and(|name| name.starts_with("Gyan.FFmpeg_"))
                    {
                        if let Ok(releases) = fs::read_dir(package) {
                            for release in releases.flatten() {
                                let bin = release.path().join("bin");
                                if bin.is_dir() {
                                    directories.push(bin);
                                }
                            }
                        }
                    }
                }
            }
        }
        if let Some(program_data) = env::var_os("ProgramData") {
            directories.push(PathBuf::from(program_data).join("chocolatey").join("bin"));
        }
        for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Some(program_files) = env::var_os(variable) {
                let program_files = PathBuf::from(program_files);
                directories.push(program_files.join("ffmpeg").join("bin"));
                directories.push(program_files.join("FFmpeg").join("bin"));
            }
        }
        directories
    }
    #[cfg(target_os = "macos")]
    {
        vec![
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/opt/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/bin"),
        ]
    }
    #[cfg(target_os = "linux")]
    {
        vec![
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/bin"),
            PathBuf::from("/snap/bin"),
        ]
    }
}

fn common_path_candidates(tool: &str) -> Vec<PathBuf> {
    common_directory_candidates()
        .into_iter()
        .flat_map(|directory| {
            executable_names(tool)
                .into_iter()
                .map(move |name| directory.join(name))
        })
        .collect()
}

fn configured_paths(settings: &FfmpegSettings, tool: &str) -> Vec<PathBuf> {
    let environment_variable = match tool {
        "ffmpeg" => "SNIPSY_FFMPEG",
        "ffprobe" => "SNIPSY_FFPROBE",
        _ => return Vec::new(),
    };
    let mut paths = env::var_os(environment_variable)
        .map(PathBuf::from)
        .into_iter()
        .collect::<Vec<_>>();
    let saved_path = match tool {
        "ffmpeg" => settings.ffmpeg_executable_path.as_deref(),
        "ffprobe" => settings.ffprobe_executable_path.as_deref(),
        _ => None,
    };
    paths.extend(saved_path.map(PathBuf::from));
    paths
}

fn resolve_tool_with_settings(settings: &FfmpegSettings, tool: &str) -> Option<PathBuf> {
    configured_paths(settings, tool)
        .into_iter()
        .chain(path_candidates(tool))
        .chain(common_path_candidates(tool))
        .find(|candidate| candidate.is_file())
}

fn resolve_tool(app: &AppHandle, tool: &str) -> Result<PathBuf, String> {
    let settings = read_settings(app)?;
    resolve_tool_with_settings(&settings, tool).ok_or_else(|| {
        format!(
            "{tool} was not found. Install FFmpeg, or select the {tool} executable in Snipsy settings."
        )
    })
}

fn infer_sibling_ffprobe_path(ffmpeg_path: &str) -> Option<String> {
    let mut sibling = PathBuf::from(ffmpeg_path);
    sibling.set_file_name(if cfg!(target_os = "windows") {
        "ffprobe.exe"
    } else {
        "ffprobe"
    });
    sibling
        .is_file()
        .then(|| sibling.to_string_lossy().into_owned())
}

pub fn command_for_ffmpeg(app: &AppHandle) -> Result<Command, String> {
    command_for_path(resolve_tool(app, "ffmpeg")?)
}

pub fn command_for_ffprobe(app: &AppHandle) -> Result<Command, String> {
    command_for_path(resolve_tool(app, "ffprobe")?)
}

pub fn command_for_path(path: PathBuf) -> Result<Command, String> {
    if !path.is_file() {
        return Err(format!("FFmpeg tool is not a file: {}", path.display()));
    }
    let mut command = Command::new(path);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    Ok(command)
}

fn status_for(app: &AppHandle, tool: &str) -> ToolStatus {
    let path = match resolve_tool(app, tool) {
        Ok(path) => path,
        Err(error) => {
            return ToolStatus {
                available: false,
                path: None,
                version: None,
                error: Some(error),
            };
        }
    };

    let output = command_for_path(path.clone()).and_then(|mut command| {
        command.arg("-version");
        command
            .output()
            .map_err(|error| format!("Failed to run {}: {error}", path.display()))
    });
    match output {
        Ok(output) if output.status.success() => ToolStatus {
            available: true,
            path: Some(path.to_string_lossy().into_owned()),
            version: first_output_line(&output),
            error: None,
        },
        Ok(output) => ToolStatus {
            available: false,
            path: Some(path.to_string_lossy().into_owned()),
            version: None,
            error: Some(command_failure(tool, &output)),
        },
        Err(error) => ToolStatus {
            available: false,
            path: Some(path.to_string_lossy().into_owned()),
            version: None,
            error: Some(error),
        },
    }
}

fn first_output_line(output: &Output) -> Option<String> {
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(str::to_owned)
        .or_else(|| {
            String::from_utf8_lossy(&output.stderr)
                .lines()
                .find(|line| !line.trim().is_empty())
                .map(str::to_owned)
        })
}

fn command_failure(tool: &str, output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = stderr
        .lines()
        .chain(stdout.lines())
        .find(|line| !line.trim().is_empty())
        .unwrap_or("The command exited unsuccessfully.");
    format!("{tool} validation failed: {detail}")
}

pub fn check_status(app: &AppHandle) -> FfmpegStatus {
    let ffmpeg = status_for(app, "ffmpeg");
    let ffprobe = status_for(app, "ffprobe");
    FfmpegStatus {
        available: ffmpeg.available && ffprobe.available,
        ffmpeg,
        ffprobe,
    }
}

pub fn set_paths(
    app: &AppHandle,
    ffmpeg_executable_path: Option<String>,
    ffprobe_executable_path: Option<String>,
) -> Result<FfmpegStatus, String> {
    for (tool, path) in [
        ("ffmpeg", ffmpeg_executable_path.as_deref()),
        ("ffprobe", ffprobe_executable_path.as_deref()),
    ] {
        if let Some(path) = path {
            if !Path::new(path).is_file() {
                return Err(format!(
                    "The selected {tool} executable is not a file: {path}"
                ));
            }
        }
    }

    let settings = match (&ffmpeg_executable_path, &ffprobe_executable_path) {
        (None, None) => FfmpegSettings::default(),
        _ => {
            let current = read_settings(app)?;
            let resolved_ffmpeg_path = ffmpeg_executable_path.or(current.ffmpeg_executable_path);
            let resolved_ffprobe_path = ffprobe_executable_path.or(current.ffprobe_executable_path);
            FfmpegSettings {
                ffprobe_executable_path: resolved_ffprobe_path.or_else(|| {
                    resolved_ffmpeg_path
                        .as_deref()
                        .and_then(infer_sibling_ffprobe_path)
                }),
                ffmpeg_executable_path: resolved_ffmpeg_path,
            }
        }
    };
    write_settings(app, &settings)?;
    Ok(check_status(app))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn executable_names_include_windows_extension_when_needed() {
        let names = executable_names("ffmpeg");
        #[cfg(target_os = "windows")]
        assert_eq!(names, vec!["ffmpeg.exe", "ffmpeg"]);
        #[cfg(not(target_os = "windows"))]
        assert_eq!(names, vec!["ffmpeg"]);
    }

    #[test]
    fn configured_paths_include_saved_path() {
        let settings = FfmpegSettings {
            ffmpeg_executable_path: Some("saved-ffmpeg".into()),
            ffprobe_executable_path: None,
        };
        assert!(configured_paths(&settings, "ffmpeg").contains(&PathBuf::from("saved-ffmpeg")));
    }

    #[test]
    fn resolver_uses_saved_executable_path() {
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join(executable_names("ffmpeg")[0].clone());
        fs::write(&executable, b"test").unwrap();
        let settings = FfmpegSettings {
            ffmpeg_executable_path: Some(executable.to_string_lossy().into_owned()),
            ffprobe_executable_path: None,
        };
        assert_eq!(
            resolve_tool_with_settings(&settings, "ffmpeg"),
            Some(executable)
        );
    }

    #[test]
    fn infers_ffprobe_beside_ffmpeg() {
        let directory = tempfile::tempdir().unwrap();
        let ffmpeg = directory.path().join(executable_names("ffmpeg")[0].clone());
        let ffprobe = directory
            .path()
            .join(executable_names("ffprobe")[0].clone());
        fs::write(&ffmpeg, b"test").unwrap();
        fs::write(&ffprobe, b"test").unwrap();
        assert_eq!(
            infer_sibling_ffprobe_path(&ffmpeg.to_string_lossy()),
            Some(ffprobe.to_string_lossy().into_owned())
        );
    }
}
