export interface Project {
  name: string;
  description: string;
  /** Values for `{{var:name}}` tokens. */
  variables?: ProjectVariable[];
  /** Token grammar version the project was written for. */
  tokenGrammar?: number;
  /** Stage settings (Setup → Stage). Unknown blocks such as `macos` are kept on save. */
  stage?: StageConfig;
}

export interface StageConfig {
  shared: { keepAwake: boolean };
  windows: { mouseSonar: boolean };
}

export const DEFAULT_STAGE_CONFIG: StageConfig = {
  shared: { keepAwake: false },
  windows: { mouseSonar: false },
};

export type StageState = "notStaged" | "staging" | "staged" | "degraded" | "unstaging";

export type StageEntryState =
  | { state: "pending" }
  | { state: "applied" }
  | { state: "alreadySet" }
  | { state: "failed"; error: string }
  | { state: "restored" }
  | { state: "conflict"; current: unknown }
  | { state: "restoreFailed"; error: string };

export interface StageSettingStatus {
  id: string;
  label: string;
  status: StageEntryState;
  owned: boolean;
  drifted: boolean;
}

export interface StageStatus {
  supported: boolean;
  backend: "windows" | "fake" | "unsupported";
  state: StageState;
  projectPath: string | null;
  projectName: string | null;
  stagedAt: string | null;
  config: StageConfig | null;
  keepAwake: { requested: boolean; active: boolean };
  settings: StageSettingStatus[];
  recovered: boolean;
  error: string | null;
  /** Increases with every snapshot; older snapshots are ignored. */
  revision: number;
}

export interface StageReport {
  outcome: "staged" | "alreadyStaged" | "degraded" | "unstaged" | "notStaged" | "unstageIncomplete";
  fixed: string[];
  conflicts: string[];
  failures: string[];
  configChanged: boolean;
  status: StageStatus;
}

export interface ProjectVariable {
  name: string;
  value: string;
  description?: string;
}

/** App-wide settings stored by the backend in the app data folder. */
export interface AppSettings {
  /** Put back what was on the clipboard after Snipsy pastes through it. */
  restoreClipboard: boolean;
  /** Wait after the last paste before restoring, for slow targets. */
  clipboardRestoreDelayMs: number;
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
  /** Fast-type only: percent chance each letter (A–Z) or digit is mistyped, then fixed. */
  typoChance?: number;
  /** Fast-type only: percent of random variation in key timing. */
  typeVariation?: number;
  /** Fast-type only: type line breaks as Shift+Enter so chat apps add a line instead of sending. */
  shiftEnter?: boolean;
  /** Type the text exactly as written; `{{...}}` tokens are not resolved. */
  raw?: boolean;
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
  zoom?: PauseZoom;
}

/** ZoomIt-style zoom: anchor point (percent of the video frame, stays fixed on screen) and magnification. */
export interface PauseZoom {
  x: number;
  y: number;
  scale: number;
  durationMs?: number;
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

export interface Script {
  id: string;
  title: string;
  description: string;
  hotkey?: string;
  contributionGroups?: AutomationContributionGroup[];
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
}

export interface ImportedVideo {
  name: string;
  relativePath: string;
  absolutePath: string;
  thumbnailPath: string | null;
}

/** An image in the project's `images/` folder; text snippets embed it as `{{image:<key>}}`. */
export interface ProjectImage {
  /** File name inside `images/`, e.g. `logo.png`. */
  key: string;
  absolutePath: string;
  width: number;
  height: number;
  bytes: number;
}

/** Result of exporting or importing a project archive. */
export interface ArchiveSummary {
  path: string;
  fileCount: number;
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

