//! Splits snippet text into typed text and `{{image:<key>}}` references.
//! The grammar is strict and mirrored by `src/utils/snippetText.ts`; both are
//! checked against `tests/fixtures/image-tokens.json`.

use serde::{Deserialize, Serialize};

use crate::images::is_image_key;

const OPEN: &str = "{{image:";
const CLOSE: &str = "}}";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum Segment {
    Text(String),
    Image(String),
}

/// Parses snippet text. Anything starting with `{{image:` must be a complete,
/// valid reference; other text, including other `{{...}}`, is typed as-is.
pub fn parse(text: &str) -> Result<Vec<Segment>, String> {
    let mut segments = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find(OPEN) {
        if start > 0 {
            segments.push(Segment::Text(rest[..start].to_string()));
        }
        let after = &rest[start + OPEN.len()..];
        let end = after
            .find(CLOSE)
            .ok_or_else(|| format!("Unclosed image reference: add }}}} after {OPEN}"))?;
        let key = &after[..end];
        if !is_image_key(key) {
            return Err(format!("Invalid image reference: {OPEN}{key}{CLOSE}"));
        }
        segments.push(Segment::Image(key.to_string()));
        rest = &after[end + CLOSE.len()..];
    }
    if !rest.is_empty() {
        segments.push(Segment::Text(rest.to_string()));
    }
    Ok(segments)
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
            serde_json::from_str(include_str!("../../tests/fixtures/image-tokens.json")).unwrap();
        assert!(cases.len() > 10);
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
}
