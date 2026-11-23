//! Splits snippet text into typed text and `{{kind}}` / `{{kind:arg}}` tokens.
//! The grammar is a closed, exact-match set mirrored by
//! `src/utils/snippetText.ts`; both are checked against
//! `tests/fixtures/snippet-tokens.json`. Anything that isn't exactly a known
//! token (other kinds, whitespace, capitals, `{{cursor:...}}`) is typed as-is.

use serde::{Deserialize, Serialize};

use crate::images::is_image_key;

const CLOSE: &str = "}}";

/// Date formats accepted by `{{date:<preset>}}`. Bare `{{date}}` is `short`.
pub const DATE_PRESETS: [&str; 8] = [
    "iso", "short", "long", "us", "eu", "year", "month", "weekday",
];
pub const MAX_RANDOM_LENGTH: u32 = 64;
const MAX_VARIABLE_NAME: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum Segment {
    Text(String),
    Image(String),
    Cursor,
    Var(String),
    Date(String),
    Time,
    Clipboard,
    Random(u32),
}

/// Tokens recognized only in their exact bare form.
type BareToken = (&'static str, fn() -> Segment);

const BARE: [BareToken; 4] = [
    ("{{cursor}}", || Segment::Cursor),
    ("{{clipboard}}", || Segment::Clipboard),
    ("{{time}}", || Segment::Time),
    ("{{date}}", || Segment::Date("short".into())),
];

/// Kinds that take an argument. Once the prefix matches, the argument must be
/// valid and closed, or the snippet fails before anything is typed.
const WITH_ARG: [&str; 4] = ["image", "var", "date", "random"];

pub fn is_variable_name(name: &str) -> bool {
    let mut chars = name.chars();
    name.len() <= MAX_VARIABLE_NAME
        && chars
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

fn random_length(arg: &str) -> Option<u32> {
    if arg.is_empty()
        || arg.len() > 2
        || arg.starts_with('0')
        || !arg.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    arg.parse()
        .ok()
        .filter(|n| (1..=MAX_RANDOM_LENGTH).contains(n))
}

fn argument_segment(kind: &str, arg: &str) -> Result<Segment, String> {
    let token = format!("{{{{{kind}:{arg}}}}}");
    match kind {
        "image" if is_image_key(arg) => Ok(Segment::Image(arg.into())),
        "image" => Err(format!("Invalid image reference: {token}")),
        "var" if is_variable_name(arg) => Ok(Segment::Var(arg.into())),
        "var" => Err(format!(
            "Invalid variable reference: {token} (names use a-z, 0-9, - and _)"
        )),
        "date" if DATE_PRESETS.contains(&arg) => Ok(Segment::Date(arg.into())),
        "date" => Err(format!(
            "Unknown date format: {token} (use {})",
            DATE_PRESETS.join(", ")
        )),
        "random" => random_length(arg)
            .map(Segment::Random)
            .ok_or_else(|| format!("Invalid random length: {token} (use 1-{MAX_RANDOM_LENGTH})")),
        _ => unreachable!("unknown token kind {kind}"),
    }
}

/// Parses snippet text into segments. Adjacent literal text is merged.
pub fn parse(text: &str) -> Result<Vec<Segment>, String> {
    let mut segments = Vec::new();
    let mut literal = String::new();
    let mut cursors = 0;
    let mut rest = text;
    'scan: while !rest.is_empty() {
        if rest.starts_with("{{") {
            for (bare, make) in BARE {
                if rest.starts_with(bare) {
                    push_token(&mut segments, &mut literal, make(), &mut cursors)?;
                    rest = &rest[bare.len()..];
                    continue 'scan;
                }
            }
            for kind in WITH_ARG {
                let Some(after) = rest[2..]
                    .strip_prefix(kind)
                    .and_then(|r| r.strip_prefix(':'))
                else {
                    continue;
                };
                let end = after.find(CLOSE).ok_or_else(|| {
                    format!("Unclosed {kind} reference: add }}}} after {{{{{kind}:")
                })?;
                let segment = argument_segment(kind, &after[..end])?;
                push_token(&mut segments, &mut literal, segment, &mut cursors)?;
                rest = &after[end + CLOSE.len()..];
                continue 'scan;
            }
        }
        let ch = rest.chars().next().expect("rest is not empty");
        literal.push(ch);
        rest = &rest[ch.len_utf8()..];
    }
    if !literal.is_empty() {
        segments.push(Segment::Text(literal));
    }
    Ok(segments)
}

fn push_token(
    segments: &mut Vec<Segment>,
    literal: &mut String,
    segment: Segment,
    cursors: &mut usize,
) -> Result<(), String> {
    if segment == Segment::Cursor {
        *cursors += 1;
        if *cursors > 1 {
            return Err("Only one {{cursor}} is allowed per snippet.".into());
        }
    }
    if !literal.is_empty() {
        segments.push(Segment::Text(std::mem::take(literal)));
    }
    segments.push(segment);
    Ok(())
}

/// Parses unless the snippet is marked "Type literally".
pub fn parse_snippet(text: &str, raw: bool) -> Result<Vec<Segment>, String> {
    if raw {
        Ok(if text.is_empty() {
            Vec::new()
        } else {
            vec![Segment::Text(text.into())]
        })
    } else {
        parse(text)
    }
}

/// Image keys referenced by `segments`, in first-use order without repeats.
pub fn image_keys(segments: &[Segment]) -> Vec<&str> {
    let mut keys: Vec<&str> = Vec::new();
    for segment in segments {
        if let Segment::Image(key) = segment {
            if !keys.contains(&key.as_str()) {
                keys.push(key);
            }
        }
    }
    keys
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct Case {
        text: String,
        segments: Option<Vec<Segment>>,
        error: Option<String>,
    }

    #[test]
    fn parses_the_shared_fixture() {
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../../tests/fixtures/snippet-tokens.json")).unwrap();
        assert!(cases.len() > 40);
        for case in cases {
            match (parse(&case.text), case.segments, case.error) {
                (Ok(actual), Some(expected), None) => {
                    assert_eq!(actual, expected, "text: {:?}", case.text)
                }
                (Err(actual), None, Some(expected)) => {
                    assert_eq!(actual, expected, "text: {:?}", case.text)
                }
                (actual, ..) => panic!("unexpected result {actual:?} for {:?}", case.text),
            }
        }
    }

    #[test]
    fn lists_each_key_once_in_order() {
        let segments = parse("{{image:b.png}} x {{image:a.png}} {{image:b.png}}").unwrap();
        assert_eq!(image_keys(&segments), ["b.png", "a.png"]);
    }

    #[test]
    fn raw_snippets_are_never_parsed() {
        assert_eq!(
            parse_snippet("{{cursor}}{{image:", true).unwrap(),
            [Segment::Text("{{cursor}}{{image:".into())]
        );
        assert!(parse_snippet("", true).unwrap().is_empty());
        assert!(parse_snippet("{{image:", false).is_err());
    }
}
