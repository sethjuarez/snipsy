export interface Project {
  name: string;
  description: string;
}

export type DeliveryMethod = "fast-type" | "paste";

export type StreamDeckIcon =
  | {
      kind: "preset";
      value: "text" | "code" | "terminal" | "play" | "rocket";
      background?: string;
      foreground?: string;
    }
  | {
      kind: "emoji";
      value: string;
      background?: string;
      foreground?: string;
    }
  | {
      kind: "generated";
      background?: string;
      foreground?: string;
    }
  | {
      kind: "image";
      value: string;
      background?: string;
    };

export interface TextSnippet {
  id: string;
  title: string;
  description: string;
  text: string;
  hotkey: string;
  delivery: DeliveryMethod;
  typeDelay?: number;
  streamDeckIcon?: StreamDeckIcon;
}

export interface TransitionAction {
  triggerAt: string;
  action: string;
  x?: number;
  y?: number;
}

export interface PauseSpotlight {
  regions: PauseSpotlightRegion[];
  showLabel?: boolean;
  style?: PauseSpotlightStyle;
}

export type PauseSpotlightRegion = RectanglePauseSpotlightRegion;

export interface RectanglePauseSpotlightRegion {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PauseSpotlightStyle {
  blur?: number;
  dimOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  glow?: boolean;
}

export interface PauseStop {
  time: number;
  label?: string;
  spotlight?: PauseSpotlight;
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
  hideCursor?: boolean;
  backgroundColor?: string;
  clickToPlay?: boolean;
  muted?: boolean;
  pauseStops?: PauseStop[];
  transitionActions?: TransitionAction[];
  streamDeckIcon?: StreamDeckIcon;
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
      // Window-relative context (present on newly recorded automations)
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
  hotkey?: string;
  steps: ScriptStep[];
  contributionGroups?: AutomationContributionGroup[];
  outputVideo?: string;
  platform?: ScriptPlatform;
  startScreenshot?: string;
  recordedAt?: string;
  streamDeckIcon?: StreamDeckIcon;
}

export interface AutomationContributionGroup {
  id: string;
  title: string;
  contributions: AutomationContribution[];
}

export type AutomationContribution = OpenSiteContribution;

export interface OpenSiteContribution {
  id: string;
  kind: "openSite";
  title?: string;
  url: string;
  idempotencyKey?: string;
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

export interface StreamDeckButton {
  id: string;
  title: string;
  snippetType: "text" | "video" | "automation";
  hotkey: string;
  iconDataUrl: string;
}

export interface StreamDeckTriggerResult {
  id: string;
  title: string;
  snippetType: "text" | "video" | "automation";
}
