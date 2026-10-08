use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex, OnceLock,
};
use tauri::Manager;

use crate::models::{
    DeliveryMethod, ProjectData, Script, StreamDeckIcon, TextSnippet, VideoSnippet,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamDeckButton {
    pub id: String,
    pub title: String,
    pub snippet_type: String,
    pub hotkey: String,
    pub icon_data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamDeckTriggerResult {
    pub id: String,
    pub title: String,
    pub snippet_type: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamDeckRunStatus {
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum StreamDeckAction {
    Text(TextSnippet),
    Video(VideoSnippet),
    Automation(Script),
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct StreamDeckRunKey {
    project_path: String,
    snippet_id: String,
    snippet_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ActiveRunKind {
    FastType,
    Video,
    Automation,
}

#[derive(Debug, Clone)]
struct ActiveStreamDeckRun {
    run_id: u64,
    key: StreamDeckRunKey,
    kind: ActiveRunKind,
    cancel_token: Arc<AtomicBool>,
    video_window_ready: Option<Arc<AtomicBool>>,
    video_window_label: Option<String>,
}

#[derive(Debug, Clone)]
enum StreamDeckRunSlot {
    Active(ActiveStreamDeckRun),
    Stopping { run_id: u64, key: StreamDeckRunKey },
}

#[derive(Debug, PartialEq, Eq)]
enum StopRunOutcome {
    NewlyStopping { video_window_label: Option<String> },
    AlreadyStopping,
}

static ACTIVE_RUN: OnceLock<Mutex<Option<StreamDeckRunSlot>>> = OnceLock::new();
static NEXT_RUN_ID: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub fn list_stream_deck_buttons(
    project_path: String,
    auditaur_trace_context: Option<tauri_plugin_auditaur::IpcTraceContext>,
) -> Result<Vec<StreamDeckButton>, String> {
    let data = crate::commands::open_project(project_path.clone(), None)?;
    let automations = crate::commands::load_automations(project_path, None)?;
    Ok(buttons_for_project(
        &data.text_snippets,
        &data.video_snippets,
        &automations,
    ))
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err, skip(app))]
pub async fn trigger_stream_deck_button(
    app: tauri::AppHandle,
    project_path: String,
    snippet_id: String,
    snippet_type: String,
    auditaur_trace_context: Option<tauri_plugin_auditaur::IpcTraceContext>,
) -> Result<StreamDeckTriggerResult, String> {
    let data = crate::commands::open_project(project_path.clone(), None)?;
    let automations = crate::commands::load_automations(project_path.clone(), None)?;
    let action = resolve_action(&data, &automations, &snippet_id, &snippet_type)?;
    let key = StreamDeckRunKey {
        project_path: normalize_project_path_key(&project_path),
        snippet_id: snippet_id.clone(),
        snippet_type: snippet_type.clone(),
    };

    prune_stale_video_run(&app);
    if let Some(result) = stop_matching_run(&app, &key, &action)? {
        return Ok(result);
    }

    match action {
        StreamDeckAction::Text(snippet) => {
            if snippet.delivery == DeliveryMethod::Paste {
                crate::delivery::deliver_text(
                    snippet.text.clone(),
                    delivery_method_name(&snippet.delivery).into(),
                    snippet.type_delay,
                    None,
                )?;
                return Ok(trigger_result(
                    snippet.id,
                    snippet.title,
                    "text",
                    "completed",
                ));
            }

            let cancel_token = Arc::new(AtomicBool::new(false));
            let run_id = begin_run(
                key,
                ActiveRunKind::FastType,
                cancel_token.clone(),
                None,
                None,
            )?;
            let text = snippet.text.clone();
            let title = snippet.title.clone();
            let snippet_id = snippet.id.clone();
            let type_delay = snippet.type_delay;
            tauri::async_runtime::spawn_blocking(move || {
                let _guard = RunClearGuard(run_id);
                if let Err(error) = crate::delivery::deliver_text_with_cancel(
                    text,
                    "fast-type".into(),
                    type_delay,
                    Some(cancel_token),
                    None,
                ) {
                    tracing::error!(error = %error, snippet = %snippet_id, title = %title, "Stream Deck fast-type delivery failed");
                }
            });

            Ok(trigger_result(snippet.id, snippet.title, "text", "started"))
        }
        StreamDeckAction::Video(snippet) => {
            let cancel_token = Arc::new(AtomicBool::new(false));
            let window_ready = Arc::new(AtomicBool::new(false));
            let run_id = begin_run(
                key,
                ActiveRunKind::Video,
                cancel_token.clone(),
                Some(window_ready.clone()),
                None,
            )?;
            let app_handle = app.clone();
            let project_path = project_path.clone();
            let snippet_for_playback = snippet.clone();
            let window_label = format!("streamdeck-playback-{run_id}");
            tauri::async_runtime::spawn(async move {
                let clear_on_destroy = Box::new(move || clear_run(run_id));
                let result = crate::playback::play_video_with_cancel(
                    app_handle,
                    Some(project_path),
                    snippet_for_playback.video_file.clone(),
                    snippet_for_playback.start_time,
                    snippet_for_playback.end_time,
                    snippet_for_playback.speed,
                    snippet_for_playback.transition_actions.clone(),
                    snippet_for_playback.target_monitor.clone(),
                    snippet_for_playback.end_behavior.clone(),
                    snippet_for_playback.hide_cursor,
                    snippet_for_playback.background_color.clone(),
                    snippet_for_playback.click_to_play,
                    snippet_for_playback.muted,
                    snippet_for_playback.pause_stops.clone(),
                    Some(window_label),
                    Some(cancel_token),
                    Some(window_ready.clone()),
                    Some(clear_on_destroy),
                    None,
                )
                .await;
                if let Err(error) = result {
                    tracing::error!(error = %error, snippet = %snippet_for_playback.id, title = %snippet_for_playback.title, "Stream Deck video playback failed");
                    clear_run(run_id);
                } else if !window_ready.load(Ordering::SeqCst) {
                    clear_run(run_id);
                }
            });

            Ok(trigger_result(
                snippet.id,
                snippet.title,
                "video",
                "started",
            ))
        }
        StreamDeckAction::Automation(script) => {
            let cancel_token = Arc::new(AtomicBool::new(false));
            let run_id = begin_run(
                key,
                ActiveRunKind::Automation,
                cancel_token.clone(),
                None,
                None,
            )?;
            let script_id = script.id.clone();
            let title = script.title.clone();
            tauri::async_runtime::spawn(async move {
                let _guard = RunClearGuard(run_id);
                match crate::scripting::run_automation_with_cancel(
                    project_path,
                    script_id.clone(),
                    Some(cancel_token),
                    None,
                )
                .await
                {
                    Ok(summary) => {
                        tracing::info!(snippet = %script_id, title = %title, summary = %summary, "Stream Deck automation finished");
                    }
                    Err(error) => {
                        tracing::error!(error = %error, snippet = %script_id, title = %title, "Stream Deck automation failed");
                    }
                }
            });

            Ok(trigger_result(
                script.id,
                script.title,
                "automation",
                "started",
            ))
        }
    }
}

pub fn stream_deck_button_status(
    project_path: String,
    snippet_id: String,
    snippet_type: String,
) -> Result<StreamDeckRunStatus, String> {
    let key = StreamDeckRunKey {
        project_path: normalize_project_path_key(&project_path),
        snippet_id,
        snippet_type,
    };
    let active = active_run_cell()
        .lock()
        .map_err(|_| "Stream Deck run registry is unavailable".to_string())?
        .as_ref()
        .map(|slot| matches!(slot, StreamDeckRunSlot::Active(run) if run.key == key))
        .unwrap_or(false);
    Ok(StreamDeckRunStatus { active })
}

fn normalize_project_path_key(project_path: &str) -> String {
    let trimmed = project_path.trim();
    let canonical = trim_trailing_project_separators(trimmed).to_string();
    #[cfg(target_os = "windows")]
    {
        canonical.to_lowercase()
    }
    #[cfg(not(target_os = "windows"))]
    {
        canonical
    }
}

fn trim_trailing_project_separators(path: &str) -> &str {
    let mut trimmed = path;
    while trimmed.len() > 1 && (trimmed.ends_with('\\') || trimmed.ends_with('/')) {
        if trimmed.len() == 3 && trimmed.as_bytes()[1] == b':' {
            break;
        }
        trimmed = &trimmed[..trimmed.len() - 1];
    }
    trimmed
}

fn trigger_result(
    id: impl Into<String>,
    title: impl Into<String>,
    snippet_type: impl Into<String>,
    status: impl Into<String>,
) -> StreamDeckTriggerResult {
    StreamDeckTriggerResult {
        id: id.into(),
        title: title.into(),
        snippet_type: snippet_type.into(),
        status: status.into(),
    }
}

struct RunClearGuard(u64);

impl Drop for RunClearGuard {
    fn drop(&mut self) {
        clear_run(self.0);
    }
}

fn active_run_cell() -> &'static Mutex<Option<StreamDeckRunSlot>> {
    ACTIVE_RUN.get_or_init(|| Mutex::new(None))
}

fn begin_run(
    key: StreamDeckRunKey,
    kind: ActiveRunKind,
    cancel_token: Arc<AtomicBool>,
    video_window_ready: Option<Arc<AtomicBool>>,
    video_window_label: Option<String>,
) -> Result<u64, String> {
    let mut active = active_run_cell()
        .lock()
        .map_err(|_| "Stream Deck run registry is unavailable".to_string())?;
    if active.is_some() {
        return Err("Another Stream Deck action is already running. Click the active button again to stop it.".into());
    }
    let run_id = NEXT_RUN_ID.fetch_add(1, Ordering::SeqCst);
    let video_window_label = if kind == ActiveRunKind::Video && video_window_label.is_none() {
        Some(format!("streamdeck-playback-{run_id}"))
    } else {
        video_window_label
    };
    *active = Some(StreamDeckRunSlot::Active(ActiveStreamDeckRun {
        run_id,
        key,
        kind,
        cancel_token,
        video_window_ready,
        video_window_label,
    }));
    Ok(run_id)
}

fn clear_run(run_id: u64) {
    if let Ok(mut active) = active_run_cell().lock() {
        let matches_run = active.as_ref().is_some_and(|slot| match slot {
            StreamDeckRunSlot::Active(run) => run.run_id == run_id,
            StreamDeckRunSlot::Stopping {
                run_id: stopping_run_id,
                ..
            } => *stopping_run_id == run_id,
        });
        if matches_run {
            *active = None;
        }
    }
}

fn stop_matching_run(
    app: &tauri::AppHandle,
    key: &StreamDeckRunKey,
    action: &StreamDeckAction,
) -> Result<Option<StreamDeckTriggerResult>, String> {
    let Some(outcome) = mark_matching_run_stopping(key)? else {
        return Ok(None);
    };

    if let StopRunOutcome::NewlyStopping {
        video_window_label: Some(label),
    } = outcome
    {
        if let Some(window) = app.get_webview_window(&label) {
            if let Err(error) = window.destroy() {
                tracing::warn!(error = %error, window = %label, "Failed to destroy Stream Deck playback window");
            }
        }
    }
    Ok(Some(trigger_result(
        action_id(action),
        action_title(action),
        action_snippet_type(action),
        "stopped",
    )))
}

fn mark_matching_run_stopping(key: &StreamDeckRunKey) -> Result<Option<StopRunOutcome>, String> {
    let mut active = active_run_cell()
        .lock()
        .map_err(|_| "Stream Deck run registry is unavailable".to_string())?;
    let Some(slot) = active.as_ref() else {
        return Ok(None);
    };
    match slot {
        StreamDeckRunSlot::Stopping {
            key: stopping_key, ..
        } if stopping_key == key => Ok(Some(StopRunOutcome::AlreadyStopping)),
        StreamDeckRunSlot::Stopping { .. } => Ok(None),
        StreamDeckRunSlot::Active(run) if &run.key != key => Ok(None),
        StreamDeckRunSlot::Active(run) => {
            run.cancel_token.store(true, Ordering::SeqCst);
            let video_window_label = if run.kind == ActiveRunKind::Video {
                run.video_window_label.clone()
            } else {
                None
            };
            let run_id = run.run_id;
            let key = run.key.clone();
            *active = Some(StreamDeckRunSlot::Stopping { run_id, key });
            Ok(Some(StopRunOutcome::NewlyStopping { video_window_label }))
        }
    }
}

fn prune_stale_video_run(app: &tauri::AppHandle) {
    if let Ok(mut active) = active_run_cell().lock() {
        let is_stale_video = active
            .as_ref()
            .map(|slot| match slot {
                StreamDeckRunSlot::Active(run) => {
                    run.kind == ActiveRunKind::Video
                        && run
                            .video_window_ready
                            .as_ref()
                            .map(|ready| ready.load(Ordering::SeqCst))
                            .unwrap_or(false)
                        && run
                            .video_window_label
                            .as_deref()
                            .and_then(|label| app.get_webview_window(label))
                            .is_none()
                }
                StreamDeckRunSlot::Stopping { .. } => false,
            })
            .unwrap_or(false);
        if is_stale_video {
            *active = None;
        }
    }
}

fn action_id(action: &StreamDeckAction) -> String {
    match action {
        StreamDeckAction::Text(snippet) => snippet.id.clone(),
        StreamDeckAction::Video(snippet) => snippet.id.clone(),
        StreamDeckAction::Automation(script) => script.id.clone(),
    }
}

fn action_title(action: &StreamDeckAction) -> String {
    match action {
        StreamDeckAction::Text(snippet) => snippet.title.clone(),
        StreamDeckAction::Video(snippet) => snippet.title.clone(),
        StreamDeckAction::Automation(script) => script.title.clone(),
    }
}

fn action_snippet_type(action: &StreamDeckAction) -> &'static str {
    match action {
        StreamDeckAction::Text(_) => "text",
        StreamDeckAction::Video(_) => "video",
        StreamDeckAction::Automation(_) => "automation",
    }
}

pub fn buttons_for_project(
    text_snippets: &[TextSnippet],
    video_snippets: &[VideoSnippet],
    automations: &[Script],
) -> Vec<StreamDeckButton> {
    text_snippets
        .iter()
        .map(|snippet| StreamDeckButton {
            id: snippet.id.clone(),
            title: snippet.title.clone(),
            snippet_type: "text".into(),
            hotkey: snippet.hotkey.clone(),
            icon_data_url: render_icon_data_url(
                snippet.stream_deck_icon.as_ref(),
                &snippet.title,
                "text",
                None,
            ),
        })
        .chain(video_snippets.iter().map(|snippet| StreamDeckButton {
            id: snippet.id.clone(),
            title: snippet.title.clone(),
            snippet_type: "video".into(),
            hotkey: snippet.hotkey.clone(),
            icon_data_url: render_icon_data_url(
                snippet.stream_deck_icon.as_ref(),
                &snippet.title,
                "video",
                None,
            ),
        }))
        .chain(automations.iter().map(|script| StreamDeckButton {
            id: script.id.clone(),
            title: script.title.clone(),
            snippet_type: "automation".into(),
            hotkey: script.hotkey.clone().unwrap_or_default(),
            icon_data_url: render_icon_data_url(
                script.stream_deck_icon.as_ref(),
                &script.title,
                "automation",
                None,
            ),
        }))
        .collect()
}

pub fn resolve_action(
    data: &ProjectData,
    automations: &[Script],
    snippet_id: &str,
    snippet_type: &str,
) -> Result<StreamDeckAction, String> {
    match snippet_type {
        "text" => data
            .text_snippets
            .iter()
            .find(|snippet| snippet.id == snippet_id)
            .cloned()
            .map(StreamDeckAction::Text)
            .ok_or_else(|| format!("Text snippet not found for Stream Deck binding: {snippet_id}")),
        "video" => data
            .video_snippets
            .iter()
            .find(|snippet| snippet.id == snippet_id)
            .cloned()
            .map(StreamDeckAction::Video)
            .ok_or_else(|| {
                format!("Video snippet not found for Stream Deck binding: {snippet_id}")
            }),
        "automation" => automations
            .iter()
            .find(|script| script.id == snippet_id)
            .cloned()
            .map(StreamDeckAction::Automation)
            .ok_or_else(|| format!("Automation not found for Stream Deck binding: {snippet_id}")),
        other => Err(format!("Unknown Stream Deck snippet type: {other}")),
    }
}

pub fn render_icon_data_url(
    icon: Option<&StreamDeckIcon>,
    title: &str,
    snippet_type: &str,
    unavailable_reason: Option<&str>,
) -> String {
    let svg = render_icon_svg(icon, title, snippet_type, unavailable_reason);
    format!(
        "data:image/svg+xml;base64,{}",
        general_purpose::STANDARD.encode(svg.as_bytes())
    )
}

fn render_icon_svg(
    icon: Option<&StreamDeckIcon>,
    title: &str,
    snippet_type: &str,
    unavailable_reason: Option<&str>,
) -> String {
    let fallback_bg = if snippet_type == "video" {
        "#1e1b4b"
    } else if snippet_type == "automation" {
        "#052e16"
    } else {
        "#111827"
    };
    if let Some(StreamDeckIcon::Image { value, background }) = icon {
        if is_safe_image_data_url(value) {
            let background = sanitize_color(background.as_deref(), fallback_bg);
            return format!(
                r##"<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs><clipPath id="iconClip"><rect x="10" y="10" width="80" height="80" rx="14"/></clipPath></defs>
  <rect width="100" height="100" rx="18" fill="{background}"/>
  <image href="{href}" x="10" y="10" width="80" height="80" preserveAspectRatio="xMidYMid slice" clip-path="url(#iconClip)"/>
</svg>"##,
                background = background,
                href = escape_xml(value),
            );
        }
    }

    let fallback_fg = if snippet_type == "video" {
        "#a78bfa"
    } else if snippet_type == "automation" {
        "#86efac"
    } else {
        "#38bdf8"
    };
    let (glyph, background, foreground) =
        icon_parts(icon, title, snippet_type, fallback_bg, fallback_fg);
    let dim = if unavailable_reason.is_some() {
        "0.42"
    } else {
        "1"
    };
    let badge = if unavailable_reason.is_some() {
        r##"<circle cx="78" cy="22" r="12" fill="#f59e0b"/><text x="78" y="28" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#111827">!</text>"##
    } else {
        ""
    };

    format!(
        r##"<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="18" fill="{background}"/>
  <g opacity="{dim}">
    <text x="50" y="50" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="{font_size}" font-weight="700" fill="{foreground}">{glyph}</text>
  </g>
  {badge}
</svg>"##,
        background = background,
        dim = dim,
        font_size = if glyph.chars().count() > 2 { 26 } else { 34 },
        foreground = foreground,
        glyph = escape_xml(&glyph),
        badge = badge,
    )
}

fn icon_parts(
    icon: Option<&StreamDeckIcon>,
    title: &str,
    snippet_type: &str,
    fallback_bg: &str,
    fallback_fg: &str,
) -> (String, String, String) {
    match icon {
        Some(StreamDeckIcon::Preset {
            value,
            background,
            foreground,
        }) => (
            preset_glyph(value, snippet_type).into(),
            sanitize_color(background.as_deref(), fallback_bg),
            sanitize_color(foreground.as_deref(), fallback_fg),
        ),
        Some(StreamDeckIcon::Emoji {
            value,
            background,
            foreground,
        }) => (
            emoji_glyph(value),
            sanitize_color(background.as_deref(), fallback_bg),
            sanitize_color(foreground.as_deref(), fallback_fg),
        ),
        Some(StreamDeckIcon::Generated {
            background,
            foreground,
        }) => (
            initials(title),
            sanitize_color(background.as_deref(), fallback_bg),
            sanitize_color(foreground.as_deref(), fallback_fg),
        ),
        Some(StreamDeckIcon::Image { .. }) => {
            (initials(title), fallback_bg.into(), fallback_fg.into())
        }
        None => (
            preset_glyph(
                if snippet_type == "video" {
                    "play"
                } else if snippet_type == "automation" {
                    "rocket"
                } else {
                    "text"
                },
                snippet_type,
            )
            .into(),
            fallback_bg.into(),
            fallback_fg.into(),
        ),
    }
}

fn preset_glyph(value: &str, snippet_type: &str) -> &'static str {
    match value {
        "code" => "</>",
        "terminal" => ">_",
        "play" => "▶",
        "rocket" => "🚀",
        "text" => "T",
        _ if snippet_type == "video" => "▶",
        _ if snippet_type == "automation" => "🚀",
        _ => "T",
    }
}

fn delivery_method_name(method: &DeliveryMethod) -> &'static str {
    match method {
        DeliveryMethod::FastType => "fast-type",
        DeliveryMethod::Paste => "paste",
    }
}

fn initials(title: &str) -> String {
    let initials = title
        .split_whitespace()
        .filter_map(|part| part.chars().next())
        .take(2)
        .collect::<String>()
        .to_uppercase();
    if initials.is_empty() {
        "S".into()
    } else {
        initials
    }
}

fn emoji_glyph(value: &str) -> String {
    let glyph = value.trim().chars().take(4).collect::<String>();
    if glyph.is_empty() {
        "★".into()
    } else {
        glyph
    }
}

fn sanitize_color(value: Option<&str>, fallback: &str) -> String {
    let Some(value) = value else {
        return fallback.into();
    };
    if value.len() == 7
        && value.starts_with('#')
        && value[1..].chars().all(|ch| ch.is_ascii_hexdigit())
    {
        value.into()
    } else {
        fallback.into()
    }
}

fn is_safe_image_data_url(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    let Some(data) = lower
        .strip_prefix("data:image/png;base64,")
        .or_else(|| lower.strip_prefix("data:image/jpeg;base64,"))
        .or_else(|| lower.strip_prefix("data:image/jpg;base64,"))
        .or_else(|| lower.strip_prefix("data:image/webp;base64,"))
        .or_else(|| lower.strip_prefix("data:image/gif;base64,"))
    else {
        return false;
    };
    !data.is_empty()
        && data
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '+' || ch == '/' || ch == '=')
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as TestMutex;

    static RUN_REGISTRY_TEST_LOCK: TestMutex<()> = TestMutex::new(());

    fn decode_icon_data_url(data_url: &str) -> String {
        let encoded = data_url.trim_start_matches("data:image/svg+xml;base64,");
        String::from_utf8(general_purpose::STANDARD.decode(encoded).unwrap()).unwrap()
    }

    #[test]
    fn renders_svg_data_url_for_preset_icon() {
        let icon = StreamDeckIcon::Preset {
            value: "terminal".into(),
            background: Some("#111827".into()),
            foreground: Some("#38bdf8".into()),
        };
        let data_url = render_icon_data_url(Some(&icon), "Build terminal", "text", None);
        assert!(data_url.starts_with("data:image/svg+xml;base64,"));
        let encoded = data_url.trim_start_matches("data:image/svg+xml;base64,");
        let svg = String::from_utf8(general_purpose::STANDARD.decode(encoded).unwrap()).unwrap();
        assert!(svg.contains(r##"fill="#111827""##));
        assert!(svg.contains("&lt;/&gt;") || svg.contains("&gt;_"));
        assert!(!svg.contains("Build terminal"));
    }

    #[test]
    fn rejects_invalid_colors_when_rendering_svg() {
        let icon = StreamDeckIcon::Preset {
            value: "text".into(),
            background: Some(r##"#fff" onload="x"##.into()),
            foreground: Some("not-a-color".into()),
        };
        let data_url = render_icon_data_url(Some(&icon), "Safe", "text", None);
        let encoded = data_url.trim_start_matches("data:image/svg+xml;base64,");
        let svg = String::from_utf8(general_purpose::STANDARD.decode(encoded).unwrap()).unwrap();
        assert!(svg.contains(r##"fill="#111827""##));
        assert!(svg.contains(r##"fill="#38bdf8""##));
        assert!(!svg.contains("onload"));
    }

    #[test]
    fn renders_custom_image_icon_inside_safe_frame() {
        let icon = StreamDeckIcon::Image {
            value: "data:image/png;base64,aGVsbG8=".into(),
            background: Some("#020617".into()),
        };
        let data_url = render_icon_data_url(Some(&icon), "Custom", "video", None);
        let encoded = data_url.trim_start_matches("data:image/svg+xml;base64,");
        let svg = String::from_utf8(general_purpose::STANDARD.decode(encoded).unwrap()).unwrap();

        assert!(svg.contains(r##"fill="#020617""##));
        assert!(svg.contains(r##"<image href="data:image/png;base64,aGVsbG8=""##));
        assert!(svg.contains(r##"preserveAspectRatio="xMidYMid slice""##));
        assert!(!svg.contains("Custom"));
    }

    #[test]
    fn buttons_include_text_and_video_snippets() {
        let text = TextSnippet {
            id: "text-1".into(),
            title: "Paste Code".into(),
            description: "".into(),
            text: "hello".into(),
            hotkey: "Ctrl+Shift+1".into(),
            delivery: crate::models::DeliveryMethod::Paste,
            type_delay: None,
            stream_deck_icon: None,
        };
        let video = VideoSnippet {
            id: "video-1".into(),
            title: "Play Clip".into(),
            description: "".into(),
            video_file: "videos/clip.mp4".into(),
            start_time: 0.0,
            end_time: 3.0,
            hotkey: "Ctrl+Shift+2".into(),
            speed: 1.0,
            target_monitor: None,
            end_behavior: None,
            hide_cursor: None,
            background_color: None,
            click_to_play: None,
            muted: None,
            pause_stops: None,
            transition_actions: None,
            stream_deck_icon: None,
        };

        let buttons = buttons_for_project(&[text], &[video], &[]);
        assert_eq!(buttons.len(), 2);
        assert_eq!(buttons[0].snippet_type, "text");
        assert_eq!(buttons[1].snippet_type, "video");
    }

    #[test]
    fn buttons_include_automations() {
        let script = Script {
            id: "automation-1".into(),
            title: "Open Docs".into(),
            description: "".into(),
            hotkey: Some("Ctrl+Shift+5".into()),
            contribution_groups: vec![],
            stream_deck_icon: None,
        };

        let buttons = buttons_for_project(&[], &[], &[script]);

        assert_eq!(buttons.len(), 1);
        assert_eq!(buttons[0].snippet_type, "automation");
        assert_eq!(buttons[0].hotkey, "Ctrl+Shift+5");

        let icon_svg = decode_icon_data_url(&buttons[0].icon_data_url);
        assert!(icon_svg.contains("🚀"));
    }

    #[test]
    fn resolve_action_finds_text_snippet_by_id_and_type() {
        let text = TextSnippet {
            id: "text-1".into(),
            title: "Paste Code".into(),
            description: "".into(),
            text: "hello".into(),
            hotkey: "Ctrl+Shift+1".into(),
            delivery: crate::models::DeliveryMethod::Paste,
            type_delay: None,
            stream_deck_icon: None,
        };
        let data = ProjectData {
            project: crate::models::Project {
                name: "Demo".into(),
                description: "".into(),
            },
            text_snippets: vec![text],
            video_snippets: vec![],
        };

        let action = resolve_action(&data, &[], "text-1", "text").unwrap();

        assert!(matches!(action, StreamDeckAction::Text(snippet) if snippet.text == "hello"));
    }

    #[test]
    fn resolve_action_reports_stale_binding() {
        let data = ProjectData {
            project: crate::models::Project {
                name: "Demo".into(),
                description: "".into(),
            },
            text_snippets: vec![],
            video_snippets: vec![],
        };

        let error = resolve_action(&data, &[], "missing", "text").unwrap_err();

        assert!(error.contains("Text snippet not found"));
        assert!(error.contains("missing"));
    }

    #[test]
    fn resolve_action_finds_video_snippet_by_id_and_type() {
        let video = VideoSnippet {
            id: "video-1".into(),
            title: "Play Clip".into(),
            description: "".into(),
            video_file: "videos/clip.mp4".into(),
            start_time: 0.0,
            end_time: 3.0,
            hotkey: "Ctrl+Shift+2".into(),
            speed: 1.0,
            target_monitor: None,
            end_behavior: None,
            hide_cursor: None,
            background_color: None,
            click_to_play: None,
            muted: None,
            pause_stops: None,
            transition_actions: None,
            stream_deck_icon: None,
        };
        let data = ProjectData {
            project: crate::models::Project {
                name: "Demo".into(),
                description: "".into(),
            },
            text_snippets: vec![],
            video_snippets: vec![video],
        };

        let action = resolve_action(&data, &[], "video-1", "video").unwrap();

        assert!(
            matches!(action, StreamDeckAction::Video(snippet) if snippet.video_file == "videos/clip.mp4")
        );
    }

    #[test]
    fn resolve_action_rejects_unknown_snippet_type() {
        let data = ProjectData {
            project: crate::models::Project {
                name: "Demo".into(),
                description: "".into(),
            },
            text_snippets: vec![],
            video_snippets: vec![],
        };

        let error = resolve_action(&data, &[], "snippet-1", "script").unwrap_err();

        assert!(error.contains("Unknown Stream Deck snippet type"));
        assert!(error.contains("script"));
    }

    #[test]
    fn resolve_action_finds_automation_by_id_and_type() {
        let script = Script {
            id: "automation-1".into(),
            title: "Open Docs".into(),
            description: "".into(),
            hotkey: None,
            contribution_groups: vec![],
            stream_deck_icon: None,
        };
        let data = ProjectData {
            project: crate::models::Project {
                name: "Demo".into(),
                description: "".into(),
            },
            text_snippets: vec![],
            video_snippets: vec![],
        };

        let action = resolve_action(&data, &[script], "automation-1", "automation").unwrap();

        assert!(
            matches!(action, StreamDeckAction::Automation(script) if script.title == "Open Docs")
        );
    }

    #[test]
    fn delivery_method_names_match_command_values() {
        assert_eq!(delivery_method_name(&DeliveryMethod::FastType), "fast-type");
        assert_eq!(delivery_method_name(&DeliveryMethod::Paste), "paste");
    }

    #[test]
    fn run_registry_rejects_different_active_run() {
        let _guard = RUN_REGISTRY_TEST_LOCK.lock().unwrap();
        *active_run_cell().lock().unwrap() = None;
        let first_key = StreamDeckRunKey {
            project_path: "C:\\demo".into(),
            snippet_id: "text-1".into(),
            snippet_type: "text".into(),
        };
        let second_key = StreamDeckRunKey {
            project_path: "C:\\demo".into(),
            snippet_id: "text-2".into(),
            snippet_type: "text".into(),
        };
        let run_id = begin_run(
            first_key,
            ActiveRunKind::FastType,
            Arc::new(AtomicBool::new(false)),
            None,
            None,
        )
        .unwrap();

        let error = begin_run(
            second_key,
            ActiveRunKind::FastType,
            Arc::new(AtomicBool::new(false)),
            None,
            None,
        )
        .unwrap_err();

        assert!(error.contains("Another Stream Deck action is already running"));
        clear_run(run_id);
    }

    #[test]
    fn clear_run_ignores_stale_run_id() {
        let _guard = RUN_REGISTRY_TEST_LOCK.lock().unwrap();
        *active_run_cell().lock().unwrap() = None;
        let key = StreamDeckRunKey {
            project_path: "C:\\demo".into(),
            snippet_id: "text-1".into(),
            snippet_type: "text".into(),
        };
        let run_id = begin_run(
            key,
            ActiveRunKind::FastType,
            Arc::new(AtomicBool::new(false)),
            None,
            None,
        )
        .unwrap();

        clear_run(run_id + 1);
        assert!(active_run_cell().lock().unwrap().is_some());

        clear_run(run_id);
        assert!(active_run_cell().lock().unwrap().is_none());
    }

    #[test]
    fn stop_transitions_active_run_to_stopping_until_clear() {
        let _guard = RUN_REGISTRY_TEST_LOCK.lock().unwrap();
        *active_run_cell().lock().unwrap() = None;
        let key = StreamDeckRunKey {
            project_path: normalize_project_path_key("C:\\demo"),
            snippet_id: "text-1".into(),
            snippet_type: "text".into(),
        };
        let cancel_token = Arc::new(AtomicBool::new(false));
        let run_id = begin_run(
            key.clone(),
            ActiveRunKind::FastType,
            cancel_token.clone(),
            None,
            None,
        )
        .unwrap();

        let outcome = mark_matching_run_stopping(&key).unwrap();

        assert!(cancel_token.load(Ordering::SeqCst));
        assert!(matches!(
            outcome,
            Some(StopRunOutcome::NewlyStopping {
                video_window_label: None
            })
        ));
        assert!(matches!(
            active_run_cell().lock().unwrap().as_ref(),
            Some(StreamDeckRunSlot::Stopping {
                run_id: stopping_run_id,
                key: stopping_key,
            }) if *stopping_run_id == run_id && stopping_key == &key
        ));
        assert!(
            !stream_deck_button_status("C:\\demo".into(), "text-1".into(), "text".into())
                .unwrap()
                .active
        );

        clear_run(run_id);
        assert!(active_run_cell().lock().unwrap().is_none());
    }

    #[test]
    fn repeated_stop_for_stopping_run_is_idempotent() {
        let _guard = RUN_REGISTRY_TEST_LOCK.lock().unwrap();
        *active_run_cell().lock().unwrap() = None;
        let key = StreamDeckRunKey {
            project_path: normalize_project_path_key("C:\\demo"),
            snippet_id: "text-1".into(),
            snippet_type: "text".into(),
        };
        let run_id = begin_run(
            key.clone(),
            ActiveRunKind::FastType,
            Arc::new(AtomicBool::new(false)),
            None,
            None,
        )
        .unwrap();
        mark_matching_run_stopping(&key).unwrap();

        assert_eq!(
            mark_matching_run_stopping(&key).unwrap(),
            Some(StopRunOutcome::AlreadyStopping)
        );

        clear_run(run_id);
    }

    #[test]
    fn stopping_run_blocks_new_runs_until_clear() {
        let _guard = RUN_REGISTRY_TEST_LOCK.lock().unwrap();
        *active_run_cell().lock().unwrap() = None;
        let first_key = StreamDeckRunKey {
            project_path: normalize_project_path_key("C:\\demo"),
            snippet_id: "text-1".into(),
            snippet_type: "text".into(),
        };
        let second_key = StreamDeckRunKey {
            project_path: normalize_project_path_key("C:\\demo"),
            snippet_id: "text-2".into(),
            snippet_type: "text".into(),
        };
        let run_id = begin_run(
            first_key.clone(),
            ActiveRunKind::FastType,
            Arc::new(AtomicBool::new(false)),
            None,
            None,
        )
        .unwrap();
        mark_matching_run_stopping(&first_key).unwrap();

        let error = begin_run(
            second_key,
            ActiveRunKind::FastType,
            Arc::new(AtomicBool::new(false)),
            None,
            None,
        )
        .unwrap_err();

        assert!(error.contains("Another Stream Deck action is already running"));
        clear_run(run_id + 1);
        assert!(active_run_cell().lock().unwrap().is_some());
        clear_run(run_id);
        assert!(active_run_cell().lock().unwrap().is_none());
    }

    #[test]
    fn project_path_keys_trim_trailing_separators() {
        #[cfg(target_os = "windows")]
        assert_eq!(normalize_project_path_key(" C:\\demo\\ "), "c:\\demo");
        #[cfg(not(target_os = "windows"))]
        assert_eq!(normalize_project_path_key(" /tmp/demo/ "), "/tmp/demo");
        assert_eq!(
            normalize_project_path_key(" C:\\demo\\ "),
            normalize_project_path_key("C:\\demo")
        );
    }

    #[test]
    fn button_status_reports_active_matching_run() {
        let _guard = RUN_REGISTRY_TEST_LOCK.lock().unwrap();
        *active_run_cell().lock().unwrap() = None;
        let key = StreamDeckRunKey {
            project_path: normalize_project_path_key("C:\\demo\\"),
            snippet_id: "text-1".into(),
            snippet_type: "text".into(),
        };
        let run_id = begin_run(
            key,
            ActiveRunKind::FastType,
            Arc::new(AtomicBool::new(false)),
            None,
            None,
        )
        .unwrap();

        assert!(
            stream_deck_button_status(" C:\\demo ".into(), "text-1".into(), "text".into())
                .unwrap()
                .active
        );
        assert!(
            !stream_deck_button_status(" C:\\demo ".into(), "text-2".into(), "text".into())
                .unwrap()
                .active
        );

        clear_run(run_id);
    }
}
