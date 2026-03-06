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
    pub transition_actions: Option<Vec<TransitionAction>>,
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
    pub steps: Vec<ScriptStep>,
    pub output_video: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum ScriptStep {
    #[serde(rename = "launch")]
    Launch { target: String },
    #[serde(rename = "type")]
    Type {
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        delay: Option<u32>,
    },
    #[serde(rename = "keypress")]
    Keypress { key: String },
    #[serde(rename = "click")]
    Click { x: i32, y: i32 },
    #[serde(rename = "wait")]
    Wait { duration: u64 },
    #[serde(rename = "scroll")]
    Scroll {
        #[serde(skip_serializing_if = "Option::is_none")]
        x: Option<i32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        y: Option<i32>,
        delta: i32,
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
        assert!(snippet.transition_actions.is_some());
        let actions = snippet.transition_actions.as_ref().unwrap();
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action, "click");

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
            "steps": [
                { "action": "launch", "target": "cmd.exe" },
                { "action": "wait", "duration": 1000 },
                { "action": "type", "text": "npm run build", "delay": 50 },
                { "action": "keypress", "key": "Enter" },
                { "action": "click", "x": 350, "y": 40 },
                { "action": "scroll", "delta": -3 }
            ],
            "outputVideo": "videos/build-process.mp4"
        }"#;
        let script: Script = serde_json::from_str(json).unwrap();
        assert_eq!(script.steps.len(), 6);
        assert_eq!(script.output_video, "videos/build-process.mp4");

        let re_json = serde_json::to_string(&script).unwrap();
        let re_script: Script = serde_json::from_str(&re_json).unwrap();
        assert_eq!(script, re_script);
    }
}
