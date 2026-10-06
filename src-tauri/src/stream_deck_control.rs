//! Stream Deck control protocol and native transport.
//!
//! The Windows named pipe is bound to the current user and SYSTEM only because
//! trigger requests can type into the foreground app and start video playback.

use std::{
    ffi::c_void,
    fs,
    path::PathBuf,
    process,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

pub const CONTROL_PROTOCOL_VERSION: u32 = 1;
const DESCRIPTOR_FILE: &str = "stream-deck-control.json";
static TRIGGER_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

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
    Listening,
    StartFailed,
}

pub struct StreamDeckControlState {
    endpoint: String,
    stop: Arc<AtomicBool>,
}

impl StreamDeckControlState {
    pub fn stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
        unblock_transport(&self.endpoint);
    }
}

pub fn start_control_server(app: &AppHandle) -> Result<StreamDeckControlState, String> {
    let stop = Arc::new(AtomicBool::new(false));
    let endpoint = start_transport(app.clone(), stop.clone())?;
    if let Err(error) =
        write_discovery_descriptor_with_status(app, true, StreamDeckTransportStatus::Listening)
    {
        stop.store(true, Ordering::SeqCst);
        unblock_transport(&endpoint);
        return Err(error);
    }
    Ok(StreamDeckControlState { endpoint, stop })
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

#[allow(dead_code)]
pub fn write_discovery_descriptor(app: &AppHandle) -> Result<PathBuf, String> {
    write_discovery_descriptor_with_status(app, false, StreamDeckTransportStatus::NotStarted)
}

pub fn write_discovery_descriptor_with_status(
    app: &AppHandle,
    active: bool,
    status: StreamDeckTransportStatus,
) -> Result<PathBuf, String> {
    let path = discovery_descriptor_path(app)?;
    let descriptor = descriptor_for_process_with_transport(
        app.package_info().version.to_string(),
        process::id(),
        active,
        status,
    );
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

#[allow(dead_code)]
pub fn descriptor_for_process(app_version: String, pid: u32) -> StreamDeckControlDescriptor {
    descriptor_for_process_with_transport(
        app_version,
        pid,
        false,
        StreamDeckTransportStatus::NotStarted,
    )
}

pub fn descriptor_for_process_with_transport(
    app_version: String,
    pid: u32,
    active: bool,
    status: StreamDeckTransportStatus,
) -> StreamDeckControlDescriptor {
    StreamDeckControlDescriptor {
        schema_version: 1,
        app: "snipsy".into(),
        app_version,
        protocol_version: CONTROL_PROTOCOL_VERSION,
        pid,
        transport: transport_descriptor(pid, active, status),
    }
}

#[allow(dead_code)]
pub fn parse_request_line(line: &str) -> Result<StreamDeckControlRequest, StreamDeckControlError> {
    let line = line.trim().trim_start_matches('\u{feff}');
    let value: Value = serde_json::from_str(line).map_err(|error| StreamDeckControlError {
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
        StreamDeckControlRequest::Status => {
            serde_json::to_value(descriptor_for_process_with_transport(
                app.package_info().version.to_string(),
                process::id(),
                true,
                StreamDeckTransportStatus::Listening,
            ))
            .map_err(|error| format!("Failed to encode Stream Deck status: {error}"))
        }
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

fn accepted_response(status: impl Into<String>) -> StreamDeckControlResponse {
    success_response(serde_json::json!({ "status": status.into() }))
}

fn try_start_trigger_request(
    app: AppHandle,
    request: StreamDeckControlRequest,
) -> StreamDeckControlResponse {
    if TRIGGER_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return error_response(
            "busy",
            "Another Stream Deck trigger is already running. Try again when it finishes.",
        );
    }

    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_request_inner(app, request).await {
            tracing::warn!(error = %error, "Stream Deck trigger request failed after acceptance");
        }
        TRIGGER_IN_PROGRESS.store(false, Ordering::SeqCst);
    });
    accepted_response("accepted")
}

#[cfg(target_os = "windows")]
fn transport_descriptor(
    pid: u32,
    active: bool,
    status: StreamDeckTransportStatus,
) -> StreamDeckTransportDescriptor {
    StreamDeckTransportDescriptor {
        kind: "windowsNamedPipe".into(),
        endpoint: format!(r"\\.\pipe\snipsy-streamdeck-{pid}"),
        active,
        status,
    }
}

#[cfg(not(target_os = "windows"))]
fn transport_descriptor(
    pid: u32,
    active: bool,
    status: StreamDeckTransportStatus,
) -> StreamDeckTransportDescriptor {
    let endpoint = unix_socket_dir().join(format!("sd-{pid}.sock"));
    StreamDeckTransportDescriptor {
        kind: "unixSocket".into(),
        endpoint: endpoint.to_string_lossy().into_owned(),
        active,
        status,
    }
}

#[cfg(not(target_os = "windows"))]
fn unix_socket_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        return std::env::var_os("TMPDIR")
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir)
            .join("snipsy-sd");
    }

    #[cfg(not(target_os = "macos"))]
    {
        std::env::var_os("XDG_RUNTIME_DIR")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME")
                    .map(PathBuf::from)
                    .map(|home| home.join(".snipsy"))
            })
            .unwrap_or_else(std::env::temp_dir)
            .join("streamdeck")
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

#[cfg(target_os = "windows")]
struct PipeSecurity {
    attributes: windows::Win32::Security::SECURITY_ATTRIBUTES,
    descriptor: windows::Win32::Security::PSECURITY_DESCRIPTOR,
}

#[cfg(target_os = "windows")]
impl PipeSecurity {
    fn owner_only() -> Result<Self, String> {
        use windows::core::{PCWSTR, PWSTR};
        use windows::Win32::Foundation::HLOCAL;
        use windows::Win32::Security::Authorization::{
            ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
            SDDL_REVISION_1,
        };
        use windows::Win32::Security::{
            GetTokenInformation, TokenUser, PSECURITY_DESCRIPTOR, TOKEN_QUERY, TOKEN_USER,
        };
        use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

        let mut token = windows::Win32::Foundation::HANDLE::default();
        unsafe {
            OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token)
                .map_err(|error| format!("Failed to open process token: {error}"))?;
        }
        let token_guard = HandleGuard(token);

        let mut required = 0_u32;
        let _ = unsafe { GetTokenInformation(token, TokenUser, None, 0, &mut required) };
        if required == 0 {
            return Err("Failed to determine process token user size".into());
        }

        let mut token_info = vec![0_u8; required as usize];
        unsafe {
            GetTokenInformation(
                token,
                TokenUser,
                Some(token_info.as_mut_ptr() as *mut c_void),
                required,
                &mut required,
            )
            .map_err(|error| format!("Failed to read process token user: {error}"))?;
        }

        let token_user = unsafe { &*(token_info.as_ptr() as *const TOKEN_USER) };
        let mut sid_string = PWSTR::null();
        unsafe {
            ConvertSidToStringSidW(token_user.User.Sid, &mut sid_string)
                .map_err(|error| format!("Failed to stringify process token SID: {error}"))?;
        }
        let sid_guard = LocalAllocGuard(HLOCAL(sid_string.0 as *mut c_void));
        let sid = unsafe {
            sid_string
                .to_string()
                .map_err(|error| format!("Failed to convert process token SID: {error}"))?
        };

        let sddl = format!("D:P(A;;GA;;;{sid})(A;;GA;;;SY)");
        let sddl = wide_null(&sddl);
        let mut descriptor = PSECURITY_DESCRIPTOR::default();
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                PCWSTR(sddl.as_ptr()),
                SDDL_REVISION_1,
                &mut descriptor,
                None,
            )
            .map_err(|error| {
                format!("Failed to build owner-only pipe security descriptor: {error}")
            })?;
        }
        drop(sid_guard);
        drop(token_guard);

        Ok(Self {
            attributes: windows::Win32::Security::SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<windows::Win32::Security::SECURITY_ATTRIBUTES>()
                    as u32,
                lpSecurityDescriptor: descriptor.0,
                bInheritHandle: false.into(),
            },
            descriptor,
        })
    }
}

#[cfg(target_os = "windows")]
impl Drop for PipeSecurity {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::LocalFree(Some(
                windows::Win32::Foundation::HLOCAL(self.descriptor.0),
            ));
        }
    }
}

#[cfg(target_os = "windows")]
struct HandleGuard(windows::Win32::Foundation::HANDLE);

#[cfg(target_os = "windows")]
impl Drop for HandleGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(target_os = "windows")]
struct LocalAllocGuard(windows::Win32::Foundation::HLOCAL);

#[cfg(target_os = "windows")]
impl Drop for LocalAllocGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::LocalFree(Some(self.0));
        }
    }
}

#[cfg(target_os = "windows")]
fn start_transport(app: AppHandle, stop: Arc<AtomicBool>) -> Result<String, String> {
    let endpoint =
        transport_descriptor(process::id(), true, StreamDeckTransportStatus::Listening).endpoint;
    let first_pipe = create_windows_pipe(&endpoint)?;
    let first_pipe_raw = first_pipe.0 as isize;
    let thread_endpoint = endpoint.clone();
    thread::Builder::new()
        .name("snipsy-streamdeck-pipe".into())
        .spawn(move || {
            let first_pipe = windows::Win32::Foundation::HANDLE(first_pipe_raw as *mut c_void);
            run_windows_pipe_server(app, thread_endpoint, stop, Some(first_pipe));
        })
        .map_err(|error| {
            unsafe {
                let _ = windows::Win32::Foundation::CloseHandle(first_pipe);
            }
            format!("Failed to start Stream Deck named pipe thread: {error}")
        })?;
    Ok(endpoint)
}

#[cfg(unix)]
fn start_transport(app: AppHandle, stop: Arc<AtomicBool>) -> Result<String, String> {
    use std::os::unix::fs::PermissionsExt;
    use std::os::unix::net::UnixListener;

    let endpoint =
        transport_descriptor(process::id(), true, StreamDeckTransportStatus::Listening).endpoint;
    let socket_path = PathBuf::from(&endpoint);
    if let Some(parent) = socket_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("Failed to create Stream Deck socket directory {parent:?}: {error}")
        })?;
        fs::set_permissions(parent, fs::Permissions::from_mode(0o700)).map_err(|error| {
            format!("Failed to secure Stream Deck socket directory {parent:?}: {error}")
        })?;
    }
    validate_unix_socket_path(&socket_path)?;
    if socket_path.exists() {
        let _ = fs::remove_file(&socket_path);
    }
    let listener = UnixListener::bind(&socket_path).map_err(|error| {
        format!("Failed to bind Stream Deck Unix socket {socket_path:?}: {error}")
    })?;
    fs::set_permissions(&socket_path, fs::Permissions::from_mode(0o600)).map_err(|error| {
        format!("Failed to secure Stream Deck Unix socket {socket_path:?}: {error}")
    })?;

    let thread_endpoint = endpoint.clone();
    thread::Builder::new()
        .name("snipsy-streamdeck-socket".into())
        .spawn(move || run_unix_socket_server(app, listener, thread_endpoint, stop))
        .map_err(|error| format!("Failed to start Stream Deck Unix socket thread: {error}"))?;
    Ok(endpoint)
}

#[cfg(unix)]
fn validate_unix_socket_path(socket_path: &std::path::Path) -> Result<(), String> {
    use std::os::unix::ffi::OsStrExt;

    #[cfg(target_os = "macos")]
    const MAX_SUN_PATH_BYTES: usize = 103;
    #[cfg(not(target_os = "macos"))]
    const MAX_SUN_PATH_BYTES: usize = 107;

    let length = socket_path.as_os_str().as_bytes().len();
    if length > MAX_SUN_PATH_BYTES {
        Err(format!(
            "Stream Deck Unix socket path is too long ({length}/{MAX_SUN_PATH_BYTES} bytes): {socket_path:?}"
        ))
    } else {
        Ok(())
    }
}

#[cfg(all(not(target_os = "windows"), not(unix)))]
fn start_transport(_app: AppHandle, _stop: Arc<AtomicBool>) -> Result<String, String> {
    Err("Stream Deck native transport is not supported on this platform".into())
}

#[cfg(target_os = "windows")]
fn run_windows_pipe_server(
    app: AppHandle,
    endpoint: String,
    stop: Arc<AtomicBool>,
    mut pending_pipe: Option<windows::Win32::Foundation::HANDLE>,
) {
    while !stop.load(Ordering::SeqCst) {
        let pipe = match pending_pipe.take() {
            Some(pipe) => Ok(pipe),
            None => create_windows_pipe(&endpoint),
        };
        match pipe {
            Ok(pipe) => unsafe {
                if connect_windows_pipe(pipe) {
                    let app = app.clone();
                    let pipe_raw = pipe.0 as isize;
                    if let Err(error) = thread::Builder::new()
                        .name("snipsy-streamdeck-client".into())
                        .spawn(move || {
                            let pipe = windows::Win32::Foundation::HANDLE(pipe_raw as *mut c_void);
                            handle_windows_pipe_client(app, pipe);
                        })
                    {
                        tracing::warn!(error = %error, "Failed to start Stream Deck pipe client worker");
                        let _ = windows::Win32::System::Pipes::DisconnectNamedPipe(pipe);
                        let _ = windows::Win32::Foundation::CloseHandle(pipe);
                    }
                } else {
                    let _ = windows::Win32::Foundation::CloseHandle(pipe);
                    thread::sleep(std::time::Duration::from_millis(100));
                }
            },
            Err(error) => {
                tracing::error!(error = %error, "Failed to create Stream Deck named pipe");
                if !stop.load(Ordering::SeqCst) {
                    let _ = write_discovery_descriptor_with_status(
                        &app,
                        false,
                        StreamDeckTransportStatus::StartFailed,
                    );
                }
                break;
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn unblock_transport(endpoint: &str) {
    let _ = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(endpoint);
}

#[cfg(not(target_os = "windows"))]
fn unblock_transport(endpoint: &str) {
    #[cfg(unix)]
    {
        let _ = std::os::unix::net::UnixStream::connect(endpoint);
    }
}

fn handle_control_request(
    app: AppHandle,
    request_line: Result<String, String>,
) -> StreamDeckControlResponse {
    match request_line {
        Ok(request_line) => match parse_request_line(&request_line) {
            Ok(request @ StreamDeckControlRequest::TriggerButton { .. }) => {
                try_start_trigger_request(app, request)
            }
            Ok(request) => tauri::async_runtime::block_on(execute_request(app, request)),
            Err(error) => StreamDeckControlResponse {
                protocol_version: CONTROL_PROTOCOL_VERSION,
                ok: false,
                result: None,
                error: Some(error),
            },
        },
        Err(error) => error_response("readFailed", error),
    }
}

fn serialize_response_line(response: &StreamDeckControlResponse) -> Result<String, String> {
    serde_json::to_string(response)
        .map(|line| line + "\n")
        .map_err(|error| format!("Failed to serialize Stream Deck response: {error}"))
}

#[cfg(unix)]
fn run_unix_socket_server(
    app: AppHandle,
    listener: std::os::unix::net::UnixListener,
    endpoint: String,
    stop: Arc<AtomicBool>,
) {
    loop {
        if stop.load(Ordering::SeqCst) {
            break;
        }
        match listener.accept() {
            Ok(stream) => {
                let app = app.clone();
                if let Err(error) = thread::Builder::new()
                    .name("snipsy-streamdeck-client".into())
                    .spawn(move || handle_unix_socket_client(app, stream.0))
                {
                    tracing::warn!(error = %error, "Failed to start Stream Deck socket client worker");
                }
            }
            Err(error) => {
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::Interrupted
                        | std::io::ErrorKind::ConnectionAborted
                        | std::io::ErrorKind::WouldBlock
                ) {
                    thread::sleep(std::time::Duration::from_millis(100));
                    continue;
                }
                tracing::error!(error = %error, "Failed to accept Stream Deck Unix socket client");
                if !stop.load(Ordering::SeqCst) {
                    let _ = write_discovery_descriptor_with_status(
                        &app,
                        false,
                        StreamDeckTransportStatus::StartFailed,
                    );
                }
                break;
            }
        }
    }
    let _ = fs::remove_file(endpoint);
}

#[cfg(unix)]
fn handle_unix_socket_client(app: AppHandle, mut stream: std::os::unix::net::UnixStream) {
    let timeout = Some(std::time::Duration::from_secs(5));
    let _ = stream.set_read_timeout(timeout);
    let _ = stream.set_write_timeout(timeout);
    if let Err(error) = handle_unix_socket_connection(app, &mut stream) {
        tracing::warn!(error = %error, "Stream Deck Unix socket request failed");
    }
}

#[cfg(unix)]
fn handle_unix_socket_connection(
    app: AppHandle,
    stream: &mut std::os::unix::net::UnixStream,
) -> Result<(), String> {
    let response = handle_control_request(app, read_unix_socket_request(stream));
    let response_line = serialize_response_line(&response)?;
    use std::io::Write;
    stream
        .write_all(response_line.as_bytes())
        .map_err(|error| format!("Failed to write Stream Deck socket response: {error}"))?;
    stream
        .flush()
        .map_err(|error| format!("Failed to flush Stream Deck socket response: {error}"))
}

#[cfg(unix)]
fn read_unix_socket_request(stream: &mut std::os::unix::net::UnixStream) -> Result<String, String> {
    use std::io::Read;

    let mut request = Vec::new();
    loop {
        let mut chunk = [0_u8; 4096];
        let bytes_read = stream
            .read(&mut chunk)
            .map_err(|error| format!("Failed to read Stream Deck socket request: {error}"))?;
        if bytes_read == 0 {
            break;
        }
        request.extend_from_slice(&chunk[..bytes_read]);
        if request.contains(&b'\n') {
            break;
        }
        if request.len() > 65536 {
            return Err("Stream Deck socket request exceeded 65536 bytes".into());
        }
    }
    if let Some(index) = request.iter().position(|byte| *byte == b'\n') {
        request.truncate(index);
    }
    String::from_utf8(request)
        .map_err(|error| format!("Stream Deck socket request was not valid UTF-8: {error}"))
}

#[cfg(target_os = "windows")]
fn create_windows_pipe(endpoint: &str) -> Result<windows::Win32::Foundation::HANDLE, String> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::PIPE_ACCESS_DUPLEX;
    use windows::Win32::System::Pipes::{
        CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE,
        PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
    };

    let endpoint = wide_null(endpoint);
    let security = PipeSecurity::owner_only()?;
    let pipe = unsafe {
        CreateNamedPipeW(
            PCWSTR(endpoint.as_ptr()),
            PIPE_ACCESS_DUPLEX,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            PIPE_UNLIMITED_INSTANCES,
            65536,
            65536,
            0,
            Some(&security.attributes as *const _),
        )
    };
    if pipe.is_invalid() {
        Err(format!(
            "CreateNamedPipeW failed: {}",
            windows::core::Error::from_win32()
        ))
    } else {
        Ok(pipe)
    }
}

#[cfg(target_os = "windows")]
unsafe fn connect_windows_pipe(pipe: windows::Win32::Foundation::HANDLE) -> bool {
    use windows::Win32::Foundation::ERROR_PIPE_CONNECTED;
    use windows::Win32::System::Pipes::ConnectNamedPipe;

    match unsafe { ConnectNamedPipe(pipe, None) } {
        Ok(()) => true,
        Err(error) => error.code() == ERROR_PIPE_CONNECTED.to_hresult(),
    }
}

#[cfg(target_os = "windows")]
fn handle_windows_pipe_client(app: AppHandle, pipe: windows::Win32::Foundation::HANDLE) {
    unsafe {
        if let Err(error) = handle_windows_pipe_connection(app, pipe) {
            tracing::warn!(error = %error, "Stream Deck named pipe request failed");
        }
        let _ = windows::Win32::System::Pipes::DisconnectNamedPipe(pipe);
        let _ = windows::Win32::Foundation::CloseHandle(pipe);
    }
}

#[cfg(target_os = "windows")]
fn handle_windows_pipe_connection(
    app: AppHandle,
    pipe: windows::Win32::Foundation::HANDLE,
) -> Result<(), String> {
    let response = handle_control_request(app, read_windows_pipe_request(pipe));
    let response_line = serialize_response_line(&response)?;
    write_windows_pipe_response(pipe, response_line.as_bytes())
}

#[cfg(target_os = "windows")]
fn read_windows_pipe_request(pipe: windows::Win32::Foundation::HANDLE) -> Result<String, String> {
    use windows::Win32::Storage::FileSystem::ReadFile;

    let mut request = Vec::new();
    loop {
        let mut chunk = [0_u8; 4096];
        let mut bytes_read = 0_u32;
        unsafe {
            ReadFile(pipe, Some(&mut chunk), Some(&mut bytes_read), None)
                .map_err(|error| format!("Failed to read Stream Deck pipe request: {error}"))?;
        }
        if bytes_read == 0 {
            break;
        }
        request.extend_from_slice(&chunk[..bytes_read as usize]);
        if request.contains(&b'\n') {
            break;
        }
        if request.len() > 65536 {
            return Err("Stream Deck pipe request exceeded 65536 bytes".into());
        }
    }
    if let Some(index) = request.iter().position(|byte| *byte == b'\n') {
        request.truncate(index);
    }
    String::from_utf8(request)
        .map_err(|error| format!("Stream Deck pipe request was not valid UTF-8: {error}"))
}

#[cfg(target_os = "windows")]
fn write_windows_pipe_response(
    pipe: windows::Win32::Foundation::HANDLE,
    response: &[u8],
) -> Result<(), String> {
    use windows::Win32::Storage::FileSystem::{FlushFileBuffers, WriteFile};

    let mut bytes_written = 0_u32;
    unsafe {
        WriteFile(pipe, Some(response), Some(&mut bytes_written), None)
            .map_err(|error| format!("Failed to write Stream Deck pipe response: {error}"))?;
        FlushFileBuffers(pipe)
            .map_err(|error| format!("Failed to flush Stream Deck pipe response: {error}"))?;
    }
    if bytes_written as usize == response.len() {
        Ok(())
    } else {
        Err(format!(
            "Incomplete Stream Deck pipe response write: {bytes_written}/{} bytes",
            response.len()
        ))
    }
}

#[cfg(target_os = "windows")]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
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
        assert!(descriptor.transport.endpoint.ends_with("sd-42.sock"));
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
    fn parses_request_with_utf8_bom() {
        let request = parse_request_line("\u{feff}{\"command\":\"status\"}").unwrap();

        assert_eq!(request, StreamDeckControlRequest::Status);
    }

    #[test]
    fn descriptor_can_advertise_listening_transport() {
        let descriptor = descriptor_for_process_with_transport(
            "0.17.1-test".into(),
            42,
            true,
            StreamDeckTransportStatus::Listening,
        );

        assert!(descriptor.transport.active);
        assert_eq!(
            descriptor.transport.status,
            StreamDeckTransportStatus::Listening
        );
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

    #[test]
    fn accepted_response_reports_accepted_status() {
        let response = accepted_response("accepted");

        assert_eq!(response.protocol_version, CONTROL_PROTOCOL_VERSION);
        assert!(response.ok);
        assert_eq!(response.result.unwrap()["status"], "accepted");
    }

    #[test]
    fn busy_response_has_stable_error_code() {
        let response = error_response(
            "busy",
            "Another Stream Deck trigger is already running. Try again when it finishes.",
        );

        assert!(!response.ok);
        assert_eq!(response.error.unwrap().code, "busy");
    }
}
