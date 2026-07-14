import type {
  ProjectData,
  ImportedVideo,
  MonitorInfo,
  PauseStop,
  Script,
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
}

export interface FfmpegToolStatus {
  available: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
}

export interface FfmpegStatus {
  available: boolean;
  ffmpeg: FfmpegToolStatus;
  ffprobe: FfmpegToolStatus;
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
  enterDemoMode(hotkeys: SnippetHotkey[]): Promise<void>;
  exitDemoMode(): Promise<void>;
  isDemoMode(): Promise<boolean>;
  deliverText(
    text: string,
    method: string,
    typeDelay?: number,
  ): Promise<void>;
  importVideo(projectPath: string, sourceFilePath: string): Promise<string>;
  getImportedVideos(projectPath: string): Promise<ImportedVideo[]>;
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
  saveScript(projectPath: string, script: Script): Promise<void>;
  loadScripts(projectPath: string): Promise<Script[]>;
  deleteScript(projectPath: string, id: string): Promise<void>;
  runScript(projectPath: string, scriptId: string): Promise<string>;
  checkFfmpeg(): Promise<FfmpegStatus>;
  setFfmpegPaths(
    ffmpegExecutablePath: string | null,
    ffprobeExecutablePath: string | null,
  ): Promise<FfmpegStatus>;
  activateDemoTray(): Promise<void>;
  deactivateDemoTray(): Promise<void>;
  isElevated(): Promise<boolean>;
  relaunchAsAdmin(): Promise<void>;
  selectVideoFile(): Promise<string | null>;
  deleteVideo(projectPath: string, relativePath: string): Promise<void>;
  getVideoFps(videoPath: string): Promise<number>;
  listMonitors(): Promise<MonitorInfo[]>;
  captureMonitorPreview(monitorName: string): Promise<string>;
  startRecordingScript(projectPath: string): Promise<string>;
  stopRecordingScript(projectPath: string, title: string, description: string): Promise<Script>;
  isRecording(): Promise<boolean>;
}
