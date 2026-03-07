export interface Project {
  name: string;
  description: string;
}

export type DeliveryMethod = "fast-type" | "paste";

export interface TextSnippet {
  id: string;
  title: string;
  description: string;
  text: string;
  hotkey: string;
  delivery: DeliveryMethod;
  typeDelay?: number;
}

export interface TransitionAction {
  triggerAt: string;
  action: string;
  x?: number;
  y?: number;
}

export interface MonitorInfo {
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scaleFactor: number;
}

export type EndBehavior = "close" | "freeze";

export interface VideoSnippet {
  id: string;
  title: string;
  description: string;
  videoFile: string;
  startTime: number;
  endTime: number;
  hotkey: string;
  speed: number;
  targetMonitor?: string;
  endBehavior?: EndBehavior;
  transitionActions?: TransitionAction[];
}

export type ScriptPlatform = "windows" | "macos" | "linux";

export type MouseButton = "left" | "right" | "middle";

export type ScriptStep =
  | { action: "launch"; target: string }
  | { action: "type"; text: string; delay?: number }
  | { action: "keypress"; key: string }
  | {
      action: "click";
      // Legacy absolute coords (always present for backward compat)
      x: number;
      y: number;
      // Window-relative context (present on newly recorded scripts)
      windowTitle?: string;
      windowClass?: string;
      xPercent?: number;
      yPercent?: number;
      button?: MouseButton;
      // L3-forward fields (reserved for future UI Automation)
      automationId?: string;
      controlName?: string;
      controlType?: string;
    }
  | { action: "wait"; duration: number }
  | {
      action: "scroll";
      delta: number;
      // Legacy absolute coords
      x?: number;
      y?: number;
      // Window-relative context
      windowTitle?: string;
      windowClass?: string;
      xPercent?: number;
      yPercent?: number;
      // L3-forward fields
      automationId?: string;
      controlName?: string;
      controlType?: string;
    }
  | {
      action: "move";
      windowTitle?: string;
      xPercent?: number;
      yPercent?: number;
      x: number;
      y: number;
    };

export interface Script {
  id: string;
  title: string;
  description: string;
  steps: ScriptStep[];
  outputVideo: string;
  platform?: ScriptPlatform;
  startScreenshot?: string;
  recordedAt?: string;
}

export interface ImportedVideo {
  name: string;
  relativePath: string;
  absolutePath: string;
  thumbnailPath: string | null;
}

export interface ProjectData {
  project: Project;
  textSnippets: TextSnippet[];
  videoSnippets: VideoSnippet[];
}
