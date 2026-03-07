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

export interface VideoSnippet {
  id: string;
  title: string;
  description: string;
  videoFile: string;
  startTime: number;
  endTime: number;
  hotkey: string;
  speed: number;
  transitionActions?: TransitionAction[];
}

export type ScriptStep =
  | { action: "launch"; target: string }
  | { action: "type"; text: string; delay?: number }
  | { action: "keypress"; key: string }
  | { action: "click"; x: number; y: number }
  | { action: "wait"; duration: number }
  | { action: "scroll"; x?: number; y?: number; delta: number };

export interface Script {
  id: string;
  title: string;
  description: string;
  steps: ScriptStep[];
  outputVideo: string;
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
