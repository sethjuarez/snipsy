use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Project {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextSnippet {
    pub id: String,
    pub title: String,
    pub description: String,
    pub text: String,
    pub hotkey: String,
    pub delivery: DeliveryMethod,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub type_delay: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_deck_icon: Option<StreamDeckIcon>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StreamDeckIcon {
    Preset {
        value: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        background: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        foreground: Option<String>,
    },
    Emoji {
        value: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        background: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        foreground: Option<String>,
    },
    Generated {
        #[serde(skip_serializing_if = "Option::is_none")]
        background: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        foreground: Option<String>,
    },
    Image {
        value: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        background: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum DeliveryMethod {
    FastType,
    Paste,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VideoSnippet {
    pub id: String,
    pub title: String,
    pub description: String,
    pub video_file: String,
    pub start_time: f64,
    pub end_time: f64,
    pub hotkey: String,
    pub speed: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_monitor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_behavior: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hide_cursor: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub click_to_play: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub muted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pause_stops: Option<Vec<PauseStop>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition_actions: Option<Vec<TransitionAction>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_deck_icon: Option<StreamDeckIcon>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PauseStop {
    pub time: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spotlight: Option<PauseSpotlight>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PauseSpotlight {
    pub regions: Vec<PauseSpotlightRegion>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_label: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<PauseSpotlightStyle>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PauseSpotlightRegion {
    Rectangle {
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PauseSpotlightStyle {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blur: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dim_opacity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border_width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub glow: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TransitionAction {
    pub trigger_at: String,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Script {
    pub id: String,
    pub title: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hotkey: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub contribution_groups: Vec<AutomationContributionGroup>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_deck_icon: Option<StreamDeckIcon>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AutomationContributionGroup {
    pub id: String,
    pub title: String,
    pub contributions: Vec<AutomationContribution>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AutomationContribution {
    OpenSite {
        id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        title: Option<String>,
        url: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        idempotency_key: Option<String>,
    },
}

/// Complete project data returned when opening a project
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectData {
    pub project: Project,
    pub text_snippets: Vec<TextSnippet>,
    pub video_snippets: Vec<VideoSnippet>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_round_trip() {
        let project = Project {
            name: "My Demo".into(),
            description: "A test project".into(),
        };
        let json = serde_json::to_string(&project).unwrap();
        let deserialized: Project = serde_json::from_str(&json).unwrap();
        assert_eq!(project, deserialized);
    }

    #[test]
    fn text_snippet_round_trip() {
        let json = r#"{
            "id": "unique-id",
            "title": "Import Statement",
            "description": "Adds the React import to the top of the file",
            "text": "import React from 'react';",
            "hotkey": "Ctrl+Shift+1",
            "delivery": "fast-type",
            "typeDelay": 30
        }"#;
        let snippet: TextSnippet = serde_json::from_str(json).unwrap();
        assert_eq!(snippet.id, "unique-id");
        assert_eq!(snippet.delivery, DeliveryMethod::FastType);
        assert_eq!(snippet.type_delay, Some(30));

        let re_json = serde_json::to_string(&snippet).unwrap();
        let re_snippet: TextSnippet = serde_json::from_str(&re_json).unwrap();
        assert_eq!(snippet, re_snippet);
    }

    #[test]
    fn text_snippet_paste_no_delay() {
        let json = r#"{
            "id": "paste-id",
            "title": "Paste Snippet",
            "description": "A paste snippet",
            "text": "hello world",
            "hotkey": "Ctrl+Shift+2",
            "delivery": "paste"
        }"#;
        let snippet: TextSnippet = serde_json::from_str(json).unwrap();
        assert_eq!(snippet.delivery, DeliveryMethod::Paste);
        assert_eq!(snippet.type_delay, None);
    }

    #[test]
    fn video_snippet_round_trip() {
        let json = r#"{
            "id": "unique-id",
            "title": "Build Process",
            "description": "Shows the build completing in 3x speed",
            "videoFile": "videos/build-process.mp4",
            "startTime": 12.5,
            "endTime": 45.0,
            "hotkey": "Ctrl+Shift+2",
            "speed": 3.0,
            "pauseStops": [
                { "time": 18.5, "label": "Wait for presenter" }
            ],
            "transitionActions": [
                {
                    "triggerAt": "end",
                    "action": "click",
                    "x": 350,
                    "y": 40
                }
            ]
        }"#;
        let snippet: VideoSnippet = serde_json::from_str(json).unwrap();
        assert_eq!(snippet.id, "unique-id");
        assert_eq!(snippet.start_time, 12.5);
        assert_eq!(snippet.speed, 3.0);
        assert!(snippet.pause_stops.is_some());
        let stops = snippet.pause_stops.as_ref().unwrap();
        assert_eq!(stops.len(), 1);
        assert_eq!(stops[0].time, 18.5);
        assert_eq!(stops[0].label.as_deref(), Some("Wait for presenter"));
        assert!(stops[0].spotlight.is_none());
        assert!(snippet.transition_actions.is_some());
        let actions = snippet.transition_actions.as_ref().unwrap();
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action, "click");

        let re_json = serde_json::to_string(&snippet).unwrap();
        let re_snippet: VideoSnippet = serde_json::from_str(&re_json).unwrap();
        assert_eq!(snippet, re_snippet);
    }

    #[test]
    fn video_snippet_spotlight_round_trip() {
        let json = r##"{
            "id": "spotlight-id",
            "title": "Focused Output",
            "description": "Highlights a section at a pause point",
            "videoFile": "videos/focused-output.mp4",
            "startTime": 5.0,
            "endTime": 30.0,
            "hotkey": "Ctrl+Shift+3",
            "speed": 1.0,
            "pauseStops": [
                {
                    "time": 12.5,
                    "label": "Explain output",
                    "spotlight": {
                        "showLabel": false,
                        "regions": [
                            {
                                "type": "rectangle",
                                "x": 12.5,
                                "y": 18.0,
                                "width": 35.0,
                                "height": 22.0
                            }
                        ],
                        "style": {
                            "borderColor": "#facc15",
                            "glow": true
                        }
                    }
                }
            ]
        }"##;
        let snippet: VideoSnippet = serde_json::from_str(json).unwrap();
        let spotlight = snippet
            .pause_stops
            .as_ref()
            .unwrap()
            .first()
            .unwrap()
            .spotlight
            .as_ref()
            .unwrap();
        assert_eq!(spotlight.regions.len(), 1);
        assert_eq!(
            spotlight.style.as_ref().unwrap().border_color.as_deref(),
            Some("#facc15")
        );
        assert_eq!(spotlight.show_label, Some(false));

        let re_json = serde_json::to_string(&snippet).unwrap();
        let re_snippet: VideoSnippet = serde_json::from_str(&re_json).unwrap();
        assert_eq!(snippet, re_snippet);
    }

    #[test]
    fn video_snippet_no_transitions() {
        let json = r#"{
            "id": "simple-id",
            "title": "Simple Video",
            "description": "No transitions",
            "videoFile": "videos/simple.mp4",
            "startTime": 0.0,
            "endTime": 10.0,
            "hotkey": "Ctrl+Shift+3",
            "speed": 1.0
        }"#;
        let snippet: VideoSnippet = serde_json::from_str(json).unwrap();
        assert_eq!(snippet.transition_actions, None);
    }

    #[test]
    fn script_round_trip() {
        let json = r#"{
            "id": "unique-id",
            "title": "Setup Build Demo",
            "description": "Opens terminal and runs build command",
            "hotkey": "CmdOrControl+Shift+5"
        }"#;
        let script: Script = serde_json::from_str(json).unwrap();
        assert_eq!(script.hotkey.as_deref(), Some("CmdOrControl+Shift+5"));
        assert!(script.contribution_groups.is_empty());

        let re_json = serde_json::to_string(&script).unwrap();
        let re_script: Script = serde_json::from_str(&re_json).unwrap();
        assert_eq!(script, re_script);
    }

    #[test]
    fn automation_without_optional_fields_deserializes() {
        let json = r#"{
            "id": "automation-1",
            "title": "Automation",
            "description": "Only required fields"
        }"#;
        let script: Script = serde_json::from_str(json).unwrap();
        assert!(script.hotkey.is_none());
        assert!(script.contribution_groups.is_empty());
    }

    #[test]
    fn automation_contributions_round_trip() {
        let json = r#"{
            "id": "automation-1",
            "title": "Prep Demo",
            "description": "Opens required sites",
            "hotkey": "CmdOrControl+Shift+5",
            "contributionGroups": [
                {
                    "id": "group-1",
                    "title": "Setup",
                    "contributions": [
                        {
                            "id": "docs",
                            "kind": "openSite",
                            "title": "Docs",
                            "url": "https://snipsy.dev",
                            "idempotencyKey": "openSite:https://snipsy.dev"
                        }
                    ]
                }
            ]
        }"#;
        let script: Script = serde_json::from_str(json).unwrap();
        assert_eq!(script.hotkey.as_deref(), Some("CmdOrControl+Shift+5"));
        assert_eq!(script.contribution_groups.len(), 1);
        assert_eq!(script.contribution_groups[0].contributions.len(), 1);

        let re_json = serde_json::to_string(&script).unwrap();
        let re_script: Script = serde_json::from_str(&re_json).unwrap();
        assert_eq!(script, re_script);
    }
}
