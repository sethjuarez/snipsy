//! Turns parsed snippet tokens into the text Snipsy delivers.

use std::collections::HashMap;
use std::sync::Mutex;

use chrono::{DateTime, Datelike, Local, Timelike};
use unicode_segmentation::UnicodeSegmentation;

use crate::clipboard_guard::NO_CLIPBOARD_TEXT;
use crate::models::ProjectVariable;
use crate::snippet_text::Segment;

/// What delivery sends: text to type or paste, and images to paste.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Piece {
    Text(String),
    Image(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolved {
    pub pieces: Vec<Piece>,
    /// Left-arrow presses that move the caret back to `{{cursor}}`.
    pub cursor_back: usize,
}

impl Resolved {
    pub fn text(&self) -> String {
        self.pieces
            .iter()
            .filter_map(|piece| match piece {
                Piece::Text(text) => Some(text.as_str()),
                Piece::Image(_) => None,
            })
            .collect()
    }
}

/// Values available to one delivery. Every date and time token shares `now`.
pub struct Values<'a> {
    pub variables: &'a [ProjectVariable],
    pub now: DateTime<Local>,
    pub clipboard: Option<&'a str>,
}

pub const IMAGE_AFTER_CURSOR: &str = "{{cursor}} must come after every image.";

pub fn resolve(
    segments: &[Segment],
    values: &Values,
    random: &mut impl FnMut(u32) -> String,
) -> Result<Resolved, String> {
    let missing: Vec<&str> = segments
        .iter()
        .filter_map(|segment| match segment {
            Segment::Var(name) if !values.variables.iter().any(|v| &v.name == name) => {
                Some(name.as_str())
            }
            _ => None,
        })
        .fold(Vec::new(), |mut names, name| {
            if !names.contains(&name) {
                names.push(name);
            }
            names
        });
    if !missing.is_empty() {
        return Err(undefined_variables(&missing));
    }

    let mut pieces: Vec<Piece> = Vec::new();
    let mut after_cursor: Option<String> = None;
    for segment in segments {
        let text = match segment {
            Segment::Image(key) => {
                if after_cursor.is_some() {
                    return Err(IMAGE_AFTER_CURSOR.into());
                }
                pieces.push(Piece::Image(key.clone()));
                continue;
            }
            Segment::Cursor => {
                after_cursor = Some(String::new());
                continue;
            }
            Segment::Text(text) => text.clone(),
            Segment::Var(name) => values
                .variables
                .iter()
                .find(|variable| &variable.name == name)
                .map(|variable| variable.value.clone())
                .unwrap_or_default(),
            Segment::Date(preset) => format_date(preset, &values.now),
            Segment::Time => format_time(&values.now),
            Segment::Clipboard => values.clipboard.ok_or(NO_CLIPBOARD_TEXT)?.to_string(),
            Segment::Random(length) => random(*length),
        };
        if let Some(tail) = after_cursor.as_mut() {
            tail.push_str(&text);
        }
        match pieces.last_mut() {
            Some(Piece::Text(last)) => last.push_str(&text),
            _ => pieces.push(Piece::Text(text)),
        }
    }
    pieces.retain(|piece| !matches!(piece, Piece::Text(text) if text.is_empty()));
    Ok(Resolved {
        pieces,
        // CRLF is one grapheme, matching one caret step in editors.
        cursor_back: after_cursor
            .map(|tail| tail.graphemes(true).count())
            .unwrap_or(0),
    })
}

fn undefined_variables(names: &[&str]) -> String {
    let (noun, pronoun) = if names.len() == 1 {
        ("variable", "it")
    } else {
        ("variables", "them")
    };
    format!(
        "Undefined {noun}: {}. Add {pronoun} in Settings → Project.",
        names.join(", ")
    )
}

// ─── Random values, frozen per demo session ────────────────────────────────

static DEMO_RANDOM: Mutex<Option<HashMap<u32, String>>> = Mutex::new(None);

/// Starts a demo session: `{{random:N}}` keeps one value per length until
/// the session ends, so the same name repeats across snippets.
pub fn start_demo_session() {
    if let Ok(mut session) = DEMO_RANDOM.lock() {
        *session = Some(HashMap::new());
    }
}

pub fn end_demo_session() {
    if let Ok(mut session) = DEMO_RANDOM.lock() {
        *session = None;
    }
}

pub fn random_value(length: u32) -> String {
    match DEMO_RANDOM.lock() {
        Ok(mut session) => random_in(&mut session, length, &mut fastrand::Rng::new()),
        Err(_) => random_string(length, &mut fastrand::Rng::new()),
    }
}

fn random_in(
    session: &mut Option<HashMap<u32, String>>,
    length: u32,
    rng: &mut fastrand::Rng,
) -> String {
    match session {
        Some(values) => values
            .entry(length)
            .or_insert_with(|| random_string(length, rng))
            .clone(),
        None => random_string(length, rng),
    }
}

/// Lowercase letters and digits, so values work in resource names.
fn random_string(length: u32, rng: &mut fastrand::Rng) -> String {
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    (0..length)
        .map(|_| CHARS[rng.usize(..CHARS.len())] as char)
        .collect()
}

// ─── Dates and times ───────────────────────────────────────────────────────

pub fn format_date(preset: &str, now: &DateTime<Local>) -> String {
    match preset {
        "iso" => now.format("%Y-%m-%d").to_string(),
        "us" => now.format("%m/%d/%Y").to_string(),
        "eu" => now.format("%d/%m/%Y").to_string(),
        "year" => now.format("%Y").to_string(),
        "long" => locale::date(now, locale::DateStyle::Long)
            .unwrap_or_else(|| now.format("%A, %B %-d, %Y").to_string()),
        "month" => locale::date(now, locale::DateStyle::Pattern("MMMM"))
            .unwrap_or_else(|| now.format("%B").to_string()),
        "weekday" => locale::date(now, locale::DateStyle::Pattern("dddd"))
            .unwrap_or_else(|| now.format("%A").to_string()),
        _ => locale::date(now, locale::DateStyle::Short)
            .unwrap_or_else(|| now.format("%-m/%-d/%Y").to_string()),
    }
}

pub fn format_time(now: &DateTime<Local>) -> String {
    locale::time(now).unwrap_or_else(|| now.format("%-I:%M %p").to_string())
}

#[allow(dead_code)]
fn system_time(now: &DateTime<Local>) -> [u16; 8] {
    [
        now.year() as u16,
        now.month() as u16,
        now.weekday().num_days_from_sunday() as u16,
        now.day() as u16,
        now.hour() as u16,
        now.minute() as u16,
        now.second() as u16,
        0,
    ]
}

#[cfg(target_os = "windows")]
mod locale {
    //! The user's own Windows date and time formats.
    use super::*;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::SYSTEMTIME;
    use windows::Win32::Globalization::{
        GetDateFormatEx, GetTimeFormatEx, DATE_LONGDATE, DATE_SHORTDATE, ENUM_DATE_FORMATS_FLAGS,
        TIME_FORMAT_FLAGS, TIME_NOSECONDS,
    };

    pub enum DateStyle {
        Short,
        Long,
        Pattern(&'static str),
    }

    fn systemtime(now: &DateTime<Local>) -> SYSTEMTIME {
        let [year, month, weekday, day, hour, minute, second, ms] = system_time(now);
        SYSTEMTIME {
            wYear: year,
            wMonth: month,
            wDayOfWeek: weekday,
            wDay: day,
            wHour: hour,
            wMinute: minute,
            wSecond: second,
            wMilliseconds: ms,
        }
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn finish(buffer: &[u16], written: i32) -> Option<String> {
        (written > 1).then(|| String::from_utf16_lossy(&buffer[..written as usize - 1]))
    }

    pub fn date(now: &DateTime<Local>, style: DateStyle) -> Option<String> {
        let time = systemtime(now);
        let (flags, pattern) = match style {
            DateStyle::Short => (DATE_SHORTDATE, None),
            DateStyle::Long => (DATE_LONGDATE, None),
            DateStyle::Pattern(pattern) => (ENUM_DATE_FORMATS_FLAGS(0), Some(wide(pattern))),
        };
        let format = pattern
            .as_ref()
            .map(|pattern| PCWSTR(pattern.as_ptr()))
            .unwrap_or(PCWSTR::null());
        let mut buffer = [0u16; 128];
        let written = unsafe {
            GetDateFormatEx(
                PCWSTR::null(),
                flags,
                Some(&time),
                format,
                Some(&mut buffer),
                PCWSTR::null(),
            )
        };
        finish(&buffer, written)
    }

    pub fn time(now: &DateTime<Local>) -> Option<String> {
        let time = systemtime(now);
        let mut buffer = [0u16; 128];
        let written = unsafe {
            GetTimeFormatEx(
                PCWSTR::null(),
                TIME_FORMAT_FLAGS(TIME_NOSECONDS.0),
                Some(&time),
                PCWSTR::null(),
                Some(&mut buffer),
            )
        };
        finish(&buffer, written)
    }
}

#[cfg(not(target_os = "windows"))]
mod locale {
    use super::*;

    pub enum DateStyle {
        Short,
        Long,
        Pattern(&'static str),
    }

    pub fn date(_now: &DateTime<Local>, _style: DateStyle) -> Option<String> {
        None
    }

    pub fn time(_now: &DateTime<Local>) -> Option<String> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snippet_text::parse;
    use chrono::TimeZone;

    fn now() -> DateTime<Local> {
        Local.with_ymd_and_hms(2025, 3, 7, 14, 5, 9).unwrap()
    }

    fn variable(name: &str, value: &str) -> ProjectVariable {
        ProjectVariable {
            name: name.into(),
            value: value.into(),
            description: None,
        }
    }

    fn resolve_text(text: &str, variables: &[ProjectVariable]) -> Result<Resolved, String> {
        let values = Values {
            variables,
            now: now(),
            clipboard: Some("from clipboard"),
        };
        resolve(&parse(text).unwrap(), &values, &mut |n| {
            "r".repeat(n as usize)
        })
    }

    #[test]
    fn substitutes_every_token() {
        let variables = [variable("host", "contoso.com"), variable("raw", "{{time}}")];
        let resolved = resolve_text(
            "https://{{var:host}}/{{random:3}} {{date:iso}} {{date:us}} {{date:eu}} {{date:year}} {{clipboard}} {{var:raw}}",
            &variables,
        )
        .unwrap();
        assert_eq!(
            resolved.pieces,
            [Piece::Text(
                "https://contoso.com/rrr 2025-03-07 03/07/2025 07/03/2025 2025 from clipboard {{time}}"
                    .into()
            )]
        );
        assert_eq!(resolved.cursor_back, 0);
    }

    #[test]
    fn locale_formats_produce_readable_values() {
        for preset in ["short", "long"] {
            assert!(format_date(preset, &now()).contains("2025"), "{preset}");
        }
        assert!(format_date("long", &now()).len() > format_date("short", &now()).len());
        for preset in ["month", "weekday"] {
            let value = format_date(preset, &now());
            assert!(
                !value.is_empty() && !value.chars().any(|c| c.is_ascii_digit()),
                "{value}"
            );
        }
        assert!(
            format_time(&now()).contains("05"),
            "{}",
            format_time(&now())
        );
        assert_eq!(
            format_date("short", &now()),
            resolve_text("{{date}}", &[]).unwrap().text()
        );
    }

    #[test]
    fn undefined_variables_are_listed_once() {
        assert_eq!(
            resolve_text("{{var:a}}{{var:b}}{{var:a}}", &[]).unwrap_err(),
            "Undefined variables: a, b. Add them in Settings → Project."
        );
        assert_eq!(
            resolve_text("{{var:a}}", &[variable("b", "")]).unwrap_err(),
            "Undefined variable: a. Add it in Settings → Project."
        );
    }

    #[test]
    fn cursor_counts_what_is_typed_after_it() {
        let variables = [variable("name", "José 👩‍💻")];
        let back = |text: &str| resolve_text(text, &variables).unwrap().cursor_back;
        assert_eq!(back("abc{{cursor}}"), 0);
        assert_eq!(back("f({{cursor}})"), 1);
        assert_eq!(back("{{cursor}}\r\nend"), 4);
        assert_eq!(back("{{cursor}} {{var:name}}"), 7);
        assert_eq!(back("{{cursor}}{{date:iso}}"), 10);
        let resolved = resolve_text("a{{cursor}}b", &[]).unwrap();
        assert_eq!(resolved.pieces, [Piece::Text("ab".into())]);
    }

    #[test]
    fn images_must_come_before_the_cursor() {
        assert_eq!(
            resolve_text("{{cursor}}{{image:a.png}}", &[]).unwrap_err(),
            IMAGE_AFTER_CURSOR
        );
        let resolved = resolve_text("{{image:a.png}}x{{cursor}}y", &[]).unwrap();
        assert_eq!(
            resolved.pieces,
            [Piece::Image("a.png".into()), Piece::Text("xy".into())]
        );
        assert_eq!(resolved.cursor_back, 1);
    }

    #[test]
    fn clipboard_without_text_fails() {
        let values = Values {
            variables: &[],
            now: now(),
            clipboard: None,
        };
        let err = resolve(&parse("{{clipboard}}").unwrap(), &values, &mut |_| {
            String::new()
        });
        assert_eq!(err.unwrap_err(), NO_CLIPBOARD_TEXT);
    }

    #[test]
    fn random_values_repeat_within_a_demo_session_only() {
        let mut rng = fastrand::Rng::with_seed(1);
        let mut none = None;
        let first = random_in(&mut none, 8, &mut rng);
        assert_eq!(first.len(), 8);
        assert!(first
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
        assert_ne!(first, random_in(&mut none, 8, &mut rng));

        let mut session = Some(HashMap::new());
        let frozen = random_in(&mut session, 8, &mut rng);
        assert_eq!(frozen, random_in(&mut session, 8, &mut rng));
        assert_ne!(frozen, random_in(&mut session, 6, &mut rng)[..]);
    }
}
