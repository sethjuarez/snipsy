import type {
  ProjectData,
  ImportedVideo,
  MonitorInfo,
  Script,
  TextSnippet,
  TransitionAction,
  VideoSnippet,
} from "../types";

export interface SnippetHotkey {
  id: string;
  hotkey: string;
  snippetType: string;
  text?: string;
  delivery?: string;
  typeDelay?: number;
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
    videoFile: string,
    startTime: number,
    endTime: number,
    speed: number,
    transitionActions?: TransitionAction[],
  ): Promise<void>;
  closePlaybackWindow(): Promise<void>;
  saveScript(projectPath: string, script: Script): Promise<void>;
  loadScripts(projectPath: string): Promise<Script[]>;
  deleteScript(projectPath: string, id: string): Promise<void>;
  runScript(projectPath: string, scriptId: string): Promise<string>;
  checkFfmpeg(): Promise<boolean>;
  installFfmpeg(): Promise<string>;
  activateDemoTray(): Promise<void>;
  deactivateDemoTray(): Promise<void>;
  isElevated(): Promise<boolean>;
  relaunchAsAdmin(): Promise<void>;
  selectVideoFile(): Promise<string | null>;
  deleteVideo(projectPath: string, relativePath: string): Promise<void>;
  getVideoFps(videoPath: string): Promise<number>;
  listMonitors(): Promise<MonitorInfo[]>;
}
