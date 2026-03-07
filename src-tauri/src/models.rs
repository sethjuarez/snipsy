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
    pub target_monitor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_behavior: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_screenshot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recorded_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "action")]
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
    #[serde(rename = "click", rename_all = "camelCase")]
    Click {
        x: i32,
        y: i32,
        #[serde(skip_serializing_if = "Option::is_none")]
        window_title: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        window_class: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        x_percent: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        y_percent: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        button: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        automation_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        control_name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        control_type: Option<String>,
    },
    #[serde(rename = "wait")]
    Wait { duration: u64 },
    #[serde(rename = "scroll", rename_all = "camelCase")]
    Scroll {
        delta: i32,
        #[serde(skip_serializing_if = "Option::is_none")]
        x: Option<i32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        y: Option<i32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        window_title: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        window_class: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        x_percent: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        y_percent: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        automation_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        control_name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        control_type: Option<String>,
    },
    #[serde(rename = "move", rename_all = "camelCase")]
    Move {
        x: i32,
        y: i32,
        #[serde(skip_serializing_if = "Option::is_none")]
        window_title: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        x_percent: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        y_percent: Option<f64>,
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

    #[test]
    fn script_with_platform_and_window_context() {
        let json = r#"{
            "id": "recorded-1",
            "title": "Recorded Demo",
            "description": "A recorded script",
            "platform": "windows",
            "startScreenshot": "screenshots/start.png",
            "recordedAt": "2026-03-07T02:00:00Z",
            "steps": [
                { "action": "click", "x": 500, "y": 300, "windowTitle": "VS Code", "windowClass": "Chrome_WidgetWin_1", "xPercent": 0.35, "yPercent": 0.42, "button": "left" },
                { "action": "type", "text": "hello", "delay": 30 },
                { "action": "scroll", "delta": -3, "x": 400, "y": 200, "windowTitle": "VS Code", "xPercent": 0.28, "yPercent": 0.28 },
                { "action": "move", "x": 600, "y": 400, "windowTitle": "Terminal", "xPercent": 0.5, "yPercent": 0.6 }
            ],
            "outputVideo": "videos/recorded.mp4"
        }"#;
        let script: Script = serde_json::from_str(json).unwrap();
        assert_eq!(script.platform.as_deref(), Some("windows"));
        assert_eq!(script.start_screenshot.as_deref(), Some("screenshots/start.png"));
        assert_eq!(script.recorded_at.as_deref(), Some("2026-03-07T02:00:00Z"));
        assert_eq!(script.steps.len(), 4);

        // Verify click has window context
        if let ScriptStep::Click { x, y, window_title, x_percent, button, .. } = &script.steps[0] {
            assert_eq!(*x, 500);
            assert_eq!(*y, 300);
            assert_eq!(window_title.as_deref(), Some("VS Code"));
            assert!((x_percent.unwrap() - 0.35).abs() < 0.001);
            assert_eq!(button.as_deref(), Some("left"));
        } else {
            panic!("Expected Click step");
        }

        // Verify move step
        if let ScriptStep::Move { x, y, window_title, x_percent, .. } = &script.steps[3] {
            assert_eq!(*x, 600);
            assert_eq!(*y, 400);
            assert_eq!(window_title.as_deref(), Some("Terminal"));
            assert!((x_percent.unwrap() - 0.5).abs() < 0.001);
        } else {
            panic!("Expected Move step");
        }

        // Round trip
        let re_json = serde_json::to_string(&script).unwrap();
        let re_script: Script = serde_json::from_str(&re_json).unwrap();
        assert_eq!(script, re_script);
    }

    #[test]
    fn legacy_script_without_platform_deserializes() {
        let json = r#"{
            "id": "old-1",
            "title": "Old Script",
            "description": "No platform field",
            "steps": [
                { "action": "click", "x": 100, "y": 200 },
                { "action": "scroll", "delta": 5 }
            ],
            "outputVideo": "videos/old.mp4"
        }"#;
        let script: Script = serde_json::from_str(json).unwrap();
        assert!(script.platform.is_none());
        assert!(script.start_screenshot.is_none());
        assert_eq!(script.steps.len(), 2);
    }
}
