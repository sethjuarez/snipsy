use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};

use crate::models::{DeliveryMethod, ProjectData, Script, StreamDeckIcon, TextSnippet, VideoSnippet};

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
}

#[derive(Debug, Clone, PartialEq)]
pub enum StreamDeckAction {
    Text(TextSnippet),
    Video(VideoSnippet),
    Automation(Script),
}

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

    match action {
        StreamDeckAction::Text(snippet) => {
            crate::delivery::deliver_text(
                snippet.text.clone(),
                delivery_method_name(&snippet.delivery).into(),
                snippet.type_delay,
                None,
            )?;
            Ok(StreamDeckTriggerResult {
                id: snippet.id,
                title: snippet.title,
                snippet_type: "text".into(),
            })
        }
        StreamDeckAction::Video(snippet) => {
            crate::playback::play_video(
                app,
                Some(project_path),
                snippet.video_file.clone(),
                snippet.start_time,
                snippet.end_time,
                snippet.speed,
                snippet.transition_actions.clone(),
                snippet.target_monitor.clone(),
                snippet.end_behavior.clone(),
                snippet.hide_cursor,
                snippet.background_color.clone(),
                snippet.click_to_play,
                snippet.muted,
                snippet.pause_stops.clone(),
                None,
            )
            .await?;
            Ok(StreamDeckTriggerResult {
                id: snippet.id,
                title: snippet.title,
                snippet_type: "video".into(),
            })
        }
        StreamDeckAction::Automation(script) => {
            crate::scripting::run_automation(project_path, script.id.clone(), None).await?;
            Ok(StreamDeckTriggerResult {
                id: script.id,
                title: script.title,
                snippet_type: "automation".into(),
            })
        }
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
            .ok_or_else(|| {
                format!("Automation not found for Stream Deck binding: {snippet_id}")
            }),
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
        Some(StreamDeckIcon::Image { .. }) => (
            initials(title),
            fallback_bg.into(),
            fallback_fg.into(),
        ),
        None => (
            preset_glyph(
                if snippet_type == "video" {
                    "play"
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
            steps: vec![],
            contribution_groups: vec![],
            output_video: None,
            platform: None,
            start_screenshot: None,
            recorded_at: None,
            stream_deck_icon: None,
        };

        let buttons = buttons_for_project(&[], &[], &[script]);

        assert_eq!(buttons.len(), 1);
        assert_eq!(buttons[0].snippet_type, "automation");
        assert_eq!(buttons[0].hotkey, "Ctrl+Shift+5");
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
            steps: vec![],
            contribution_groups: vec![],
            output_video: None,
            platform: None,
            start_screenshot: None,
            recorded_at: None,
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

        assert!(matches!(action, StreamDeckAction::Automation(script) if script.title == "Open Docs"));
    }

    #[test]
    fn delivery_method_names_match_command_values() {
        assert_eq!(delivery_method_name(&DeliveryMethod::FastType), "fast-type");
        assert_eq!(delivery_method_name(&DeliveryMethod::Paste), "paste");
    }
}
