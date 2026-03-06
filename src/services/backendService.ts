import type { ProjectData, TextSnippet, VideoSnippet } from "../types";

export interface SnippetHotkey {
  id: string;
  hotkey: string;
  snippetType: string;
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
  getImportedVideos(projectPath: string): Promise<string[]>;
}
