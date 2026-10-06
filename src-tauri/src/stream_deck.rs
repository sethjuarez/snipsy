use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};

use crate::models::{StreamDeckIcon, TextSnippet, VideoSnippet};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreamDeckButton {
    pub id: String,
    pub title: String,
    pub snippet_type: String,
    pub hotkey: String,
    pub icon_data_url: String,
}

#[tauri::command]
#[tauri_plugin_auditaur::instrument_ipc(err)]
pub fn list_stream_deck_buttons(
    project_path: String,
    auditaur_trace_context: Option<tauri_plugin_auditaur::IpcTraceContext>,
) -> Result<Vec<StreamDeckButton>, String> {
    let data = crate::commands::open_project(project_path, None)?;
    Ok(buttons_for_project(&data.text_snippets, &data.video_snippets))
}

pub fn buttons_for_project(
    text_snippets: &[TextSnippet],
    video_snippets: &[VideoSnippet],
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
        .collect()
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
    let fallback_bg = if snippet_type == "video" { "#1e1b4b" } else { "#111827" };
    let fallback_fg = if snippet_type == "video" { "#a78bfa" } else { "#38bdf8" };
    let (glyph, background, foreground) =
        icon_parts(icon, title, snippet_type, fallback_bg, fallback_fg);
    let dim = if unavailable_reason.is_some() { "0.42" } else { "1" };
    let label = truncate_label(unavailable_reason.unwrap_or(title));
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
    <text x="50" y="84" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#f8fafc">{label}</text>
  </g>
  {badge}
</svg>"##,
        background = background,
        dim = dim,
        font_size = if glyph.chars().count() > 2 { 26 } else { 34 },
        foreground = foreground,
        glyph = escape_xml(&glyph),
        label = escape_xml(&label),
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
        Some(StreamDeckIcon::Preset { value, background, foreground }) => (
            preset_glyph(value, snippet_type).into(),
            sanitize_color(background.as_deref(), fallback_bg),
            sanitize_color(foreground.as_deref(), fallback_fg),
        ),
        Some(StreamDeckIcon::Emoji { value, background, foreground }) => (
            emoji_glyph(value),
            sanitize_color(background.as_deref(), fallback_bg),
            sanitize_color(foreground.as_deref(), fallback_fg),
        ),
        Some(StreamDeckIcon::Generated { background, foreground }) => (
            initials(title),
            sanitize_color(background.as_deref(), fallback_bg),
            sanitize_color(foreground.as_deref(), fallback_fg),
        ),
        None => (
            preset_glyph(if snippet_type == "video" { "play" } else { "text" }, snippet_type).into(),
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
        _ => "T",
    }
}

fn initials(title: &str) -> String {
    let initials = title
        .split_whitespace()
        .filter_map(|part| part.chars().next())
        .take(2)
        .collect::<String>()
        .to_uppercase();
    if initials.is_empty() { "S".into() } else { initials }
}

fn emoji_glyph(value: &str) -> String {
    let glyph = value.trim().chars().take(4).collect::<String>();
    if glyph.is_empty() { "★".into() } else { glyph }
}

fn truncate_label(label: &str) -> String {
    let clean = label.trim();
    if clean.chars().count() > 12 {
        format!("{}…", clean.chars().take(11).collect::<String>())
    } else {
        clean.into()
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

        let buttons = buttons_for_project(&[text], &[video]);
        assert_eq!(buttons.len(), 2);
        assert_eq!(buttons[0].snippet_type, "text");
        assert_eq!(buttons[1].snippet_type, "video");
    }
}
