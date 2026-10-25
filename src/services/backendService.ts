import type {
  ProjectData,
  ImportedVideo,
  MonitorInfo,
  PauseStop,
  Script,
  StreamDeckButton,
  TextSnippet,
  TransitionAction,
  VideoSnippet,
} from "../types";

export interface SnippetHotkey {
  id: string;
  hotkey: string;
  snippetType: string;
  // Text snippet fields
  text?: string;
  delivery?: string;
  typeDelay?: number;
  // Video snippet fields
  projectPath?: string;
  videoFile?: string;
  startTime?: number;
  endTime?: number;
  speed?: number;
  transitionActions?: TransitionAction[];
  targetMonitor?: string;
  endBehavior?: string;
  hideCursor?: boolean;
  backgroundColor?: string;
  clickToPlay?: boolean;
  muted?: boolean;
  pauseStops?: PauseStop[];
  scriptId?: string;
}

/** A hotkey demo mode could not arm. For duplicates, `detail` is the snippet id that kept the combo. */
export interface HotkeyIssue {
  snippetId: string;
  hotkey: string;
  kind: "duplicate" | "failed";
  detail: string;
}

export interface BackendService {
  createProject(
    path: string,
    name: string,
    description: string,
  ): Promise<ProjectData>;
  openProject(path: string): Promise<ProjectData>;
  saveTextSnippets(path: string, snippets: TextSnippet[]): Promise<void>;
  saveVideoSnippets(path: string, snippets: VideoSnippet[]): Promise<void>;
  enterDemoMode(hotkeys: SnippetHotkey[]): Promise<HotkeyIssue[]>;
  exitDemoMode(): Promise<void>;
  isDemoMode(): Promise<boolean>;
  deliverText(
    text: string,
    method: string,
    typeDelay?: number,
  ): Promise<void>;
  importVideo(projectPath: string, sourceFilePath: string): Promise<string>;
  getImportedVideos(projectPath: string): Promise<ImportedVideo[]>;
  /** Persist a JPEG thumbnail for an imported video; returns its absolute path. */
  saveVideoThumbnail(
    projectPath: string,
    relativePath: string,
    jpegBase64: string,
  ): Promise<string>;
  playVideo(
    projectPath: string | null,
    videoFile: string,
    startTime: number,
    endTime: number,
    speed: number,
    transitionActions?: TransitionAction[],
    targetMonitor?: string,
    endBehavior?: string,
    hideCursor?: boolean,
    backgroundColor?: string,
    clickToPlay?: boolean,
    muted?: boolean,
    pauseStops?: PauseStop[],
  ): Promise<void>;
  showPlaybackWindow(): Promise<void>;
  closePlaybackWindow(): Promise<void>;
  saveAutomation(projectPath: string, script: Script): Promise<void>;
  loadAutomations(projectPath: string): Promise<Script[]>;
  deleteAutomation(projectPath: string, id: string): Promise<void>;
  runAutomation(projectPath: string, scriptId: string): Promise<string>;
  activateDemoTray(): Promise<void>;
  deactivateDemoTray(): Promise<void>;
  isElevated(): Promise<boolean>;
  relaunchAsAdmin(): Promise<void>;
  selectVideoFile(): Promise<string | null>;
  deleteVideo(projectPath: string, relativePath: string): Promise<void>;
  getVideoFps(videoPath: string): Promise<number>;
  listMonitors(): Promise<MonitorInfo[]>;
  captureMonitorPreview(monitorName: string): Promise<string>;
  setStreamDeckActiveProject(projectPath: string | null): Promise<void>;
  listStreamDeckButtons(projectPath: string): Promise<StreamDeckButton[]>;

}
