//! Stream Deck control protocol scaffolding.
//!
//! The descriptor advertises the intended native transport endpoint, but the
//! transport remains inactive until the pipe/socket server is implemented. When
//! that server is added, bind it owner-only because trigger requests can type
//! into the foreground app and start video playback.

use std::{fs, path::PathBuf, process};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

pub const CONTROL_PROTOCOL_VERSION: u32 = 1;
const DESCRIPTOR_FILE: &str = "stream-deck-control.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamDeckControlDescriptor {
    pub schema_version: u32,
    pub app: String,
    pub app_version: String,
    pub protocol_version: u32,
    pub pid: u32,
    pub transport: StreamDeckTransportDescriptor,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamDeckTransportDescriptor {
    pub kind: String,
    pub endpoint: String,
    pub active: bool,
    pub status: StreamDeckTransportStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum StreamDeckTransportStatus {
    NotStarted,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "command", rename_all = "camelCase")]
pub enum StreamDeckControlRequest {
    Status,
    ListButtons {
        #[serde(rename = "projectPath")]
        project_path: String,
    },
    TriggerButton {
        #[serde(rename = "projectPath")]
        project_path: String,
        #[serde(rename = "snippetId")]
        snippet_id: String,
        #[serde(rename = "snippetType")]
        snippet_type: String,
    },
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamDeckControlResponse {
    pub protocol_version: u32,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<StreamDeckControlError>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamDeckControlError {
    pub code: String,
    pub message: String,
}

pub fn write_discovery_descriptor(app: &AppHandle) -> Result<PathBuf, String> {
    let path = discovery_descriptor_path(app)?;
    let descriptor = descriptor_for_process(app.package_info().version.to_string(), process::id());
    let json = serde_json::to_string_pretty(&descriptor)
        .map_err(|error| format!("Failed to serialize Stream Deck descriptor: {error}"))?;
    let parent = path
        .parent()
        .ok_or_else(|| "Stream Deck descriptor path has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create Stream Deck descriptor directory: {error}"))?;
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, json)
        .map_err(|error| format!("Failed to write Stream Deck descriptor: {error}"))?;
    fs::rename(&temp_path, &path)
        .map_err(|error| format!("Failed to publish Stream Deck descriptor: {error}"))?;
    Ok(path)
}

pub fn remove_discovery_descriptor(app: &AppHandle) {
    if let Ok(path) = discovery_descriptor_path(app) {
        if descriptor_belongs_to_current_process(&path) {
            let _ = fs::remove_file(path);
        }
    }
}

pub fn discovery_descriptor_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        format!("Failed to determine the Stream Deck descriptor directory: {error}")
    })?;
    Ok(app_data_dir.join(DESCRIPTOR_FILE))
}

pub fn descriptor_for_process(app_version: String, pid: u32) -> StreamDeckControlDescriptor {
    StreamDeckControlDescriptor {
        schema_version: 1,
        app: "snipsy".into(),
        app_version,
        protocol_version: CONTROL_PROTOCOL_VERSION,
        pid,
        transport: transport_descriptor(pid),
    }
}

#[allow(dead_code)]
pub fn parse_request_line(line: &str) -> Result<StreamDeckControlRequest, StreamDeckControlError> {
    let value: Value = serde_json::from_str(line.trim()).map_err(|error| StreamDeckControlError {
        code: "invalidJson".into(),
        message: format!("Invalid Stream Deck control request JSON: {error}"),
    })?;
    match value.get("command").and_then(Value::as_str) {
        Some("status" | "listButtons" | "triggerButton") => {}
        Some(command) => {
            return Err(StreamDeckControlError {
                code: "unknownCommand".into(),
                message: format!("Unknown Stream Deck control command: {command}"),
            });
        }
        None => {
            return Err(StreamDeckControlError {
                code: "invalidJson".into(),
                message: "Stream Deck control request is missing command".into(),
            });
        }
    }
    serde_json::from_value(value).map_err(|error| StreamDeckControlError {
        code: "invalidJson".into(),
        message: format!("Invalid Stream Deck control request JSON: {error}"),
    })
}

#[allow(dead_code)]
pub async fn execute_request(
    app: AppHandle,
    request: StreamDeckControlRequest,
) -> StreamDeckControlResponse {
    match execute_request_inner(app, request).await {
        Ok(result) => success_response(result),
        Err(error) => error_response("commandFailed", error),
    }
}

#[allow(dead_code)]
async fn execute_request_inner(
    app: AppHandle,
    request: StreamDeckControlRequest,
) -> Result<Value, String> {
    match request {
        StreamDeckControlRequest::Status => serde_json::to_value(descriptor_for_process(
            app.package_info().version.to_string(),
            process::id(),
        ))
        .map_err(|error| format!("Failed to encode Stream Deck status: {error}")),
        StreamDeckControlRequest::ListButtons { project_path } => {
            let buttons = crate::stream_deck::list_stream_deck_buttons(project_path, None)?;
            serde_json::to_value(buttons)
                .map_err(|error| format!("Failed to encode Stream Deck buttons: {error}"))
        }
        StreamDeckControlRequest::TriggerButton {
            project_path,
            snippet_id,
            snippet_type,
        } => {
            let result = crate::stream_deck::trigger_stream_deck_button(
                app,
                project_path,
                snippet_id,
                snippet_type,
                None,
            )
            .await?;
            serde_json::to_value(result)
                .map_err(|error| format!("Failed to encode Stream Deck trigger result: {error}"))
        }
    }
}

#[allow(dead_code)]
pub fn success_response(result: Value) -> StreamDeckControlResponse {
    StreamDeckControlResponse {
        protocol_version: CONTROL_PROTOCOL_VERSION,
        ok: true,
        result: Some(result),
        error: None,
    }
}

#[allow(dead_code)]
pub fn error_response(
    code: impl Into<String>,
    message: impl Into<String>,
) -> StreamDeckControlResponse {
    StreamDeckControlResponse {
        protocol_version: CONTROL_PROTOCOL_VERSION,
        ok: false,
        result: None,
        error: Some(StreamDeckControlError {
            code: code.into(),
            message: message.into(),
        }),
    }
}

#[cfg(target_os = "windows")]
fn transport_descriptor(pid: u32) -> StreamDeckTransportDescriptor {
    StreamDeckTransportDescriptor {
        kind: "windowsNamedPipe".into(),
        endpoint: format!(r"\\.\pipe\snipsy-streamdeck-{pid}"),
        active: false,
        status: StreamDeckTransportStatus::NotStarted,
    }
}

#[cfg(not(target_os = "windows"))]
fn transport_descriptor(pid: u32) -> StreamDeckTransportDescriptor {
    #[cfg(target_os = "macos")]
    let endpoint = PathBuf::from("/tmp").join(format!("snipsy-streamdeck-{pid}.sock"));

    #[cfg(not(target_os = "macos"))]
    let endpoint = std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join(format!("snipsy-streamdeck-{pid}.sock"));
    StreamDeckTransportDescriptor {
        kind: "unixSocket".into(),
        endpoint: endpoint.to_string_lossy().into_owned(),
        active: false,
        status: StreamDeckTransportStatus::NotStarted,
    }
}

fn descriptor_belongs_to_current_process(path: &PathBuf) -> bool {
    let Ok(json) = fs::read_to_string(path) else {
        return false;
    };
    let Ok(descriptor) = serde_json::from_str::<StreamDeckControlDescriptor>(&json) else {
        return false;
    };
    descriptor.pid == process::id()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "windows")]
    #[test]
    fn descriptor_uses_windows_named_pipe_endpoint() {
        let descriptor = descriptor_for_process("0.17.1-test".into(), 42);

        assert_eq!(descriptor.app, "snipsy");
        assert_eq!(descriptor.protocol_version, CONTROL_PROTOCOL_VERSION);
        assert_eq!(descriptor.transport.kind, "windowsNamedPipe");
        assert_eq!(
            descriptor.transport.endpoint,
            r"\\.\pipe\snipsy-streamdeck-42"
        );
        assert_eq!(
            descriptor.transport.status,
            StreamDeckTransportStatus::NotStarted
        );
        assert!(!descriptor.transport.active);
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn descriptor_uses_unix_socket_endpoint() {
        let descriptor = descriptor_for_process("0.17.1-test".into(), 42);

        assert_eq!(descriptor.app, "snipsy");
        assert_eq!(descriptor.protocol_version, CONTROL_PROTOCOL_VERSION);
        assert_eq!(descriptor.transport.kind, "unixSocket");
        assert!(descriptor
            .transport
            .endpoint
            .ends_with("snipsy-streamdeck-42.sock"));
        assert_eq!(
            descriptor.transport.status,
            StreamDeckTransportStatus::NotStarted
        );
        assert!(!descriptor.transport.active);
    }

    #[test]
    fn parses_status_request() {
        let request = parse_request_line(r#"{"command":"status"}"#).unwrap();

        assert_eq!(request, StreamDeckControlRequest::Status);
    }

    #[test]
    fn parses_list_buttons_request() {
        let request = parse_request_line(
            r#"{"command":"listButtons","projectPath":"C:\\Users\\seth\\snipsy-demo"}"#,
        )
        .unwrap();

        assert_eq!(
            request,
            StreamDeckControlRequest::ListButtons {
                project_path: r"C:\Users\seth\snipsy-demo".into()
            }
        );
    }

    #[test]
    fn parses_trigger_button_request() {
        let request = parse_request_line(
            r#"{"command":"triggerButton","projectPath":"C:\\demo","snippetId":"ts-1","snippetType":"text"}"#,
        )
        .unwrap();

        assert_eq!(
            request,
            StreamDeckControlRequest::TriggerButton {
                project_path: r"C:\demo".into(),
                snippet_id: "ts-1".into(),
                snippet_type: "text".into(),
            }
        );
    }

    #[test]
    fn invalid_json_returns_protocol_error() {
        let error = parse_request_line("{").unwrap_err();

        assert_eq!(error.code, "invalidJson");
        assert!(error
            .message
            .contains("Invalid Stream Deck control request JSON"));
    }

    #[test]
    fn unknown_command_returns_protocol_error() {
        let error =
            parse_request_line(r#"{"command":"runShell","projectPath":"C:\\demo"}"#).unwrap_err();

        assert_eq!(error.code, "unknownCommand");
        assert!(error.message.contains("runShell"));
    }

    #[test]
    fn descriptor_ownership_checks_pid_before_cleanup() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("stream-deck-control.json");
        let current = descriptor_for_process("0.17.1-test".into(), process::id());
        fs::write(&path, serde_json::to_string(&current).unwrap()).unwrap();

        assert!(descriptor_belongs_to_current_process(&path));

        let stale = descriptor_for_process("0.17.1-test".into(), process::id() + 1);
        fs::write(&path, serde_json::to_string(&stale).unwrap()).unwrap();

        assert!(!descriptor_belongs_to_current_process(&path));
    }

    #[test]
    fn error_response_has_protocol_version_and_no_result() {
        let response = error_response("missingProject", "Project is required");

        assert_eq!(response.protocol_version, CONTROL_PROTOCOL_VERSION);
        assert!(!response.ok);
        assert!(response.result.is_none());
        assert_eq!(response.error.unwrap().code, "missingProject");
    }
}
