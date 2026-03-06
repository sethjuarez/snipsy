import { invoke } from "@tauri-apps/api/core";
import type { BackendService, SnippetHotkey } from "./backendService";
import type { ProjectData, TextSnippet, VideoSnippet } from "../types";

export class TauriBackendService implements BackendService {
  async createProject(
    path: string,
    name: string,
    description: string,
  ): Promise<ProjectData> {
    return invoke<ProjectData>("create_project", { path, name, description });
  }

  async openProject(path: string): Promise<ProjectData> {
    return invoke<ProjectData>("open_project", { path });
  }

  async saveTextSnippets(
    path: string,
    snippets: TextSnippet[],
  ): Promise<void> {
    return invoke("save_text_snippets", { path, snippets });
  }

  async saveVideoSnippets(
    path: string,
    snippets: VideoSnippet[],
  ): Promise<void> {
    return invoke("save_video_snippets", { path, snippets });
  }

  async enterDemoMode(hotkeys: SnippetHotkey[]): Promise<void> {
    return invoke("enter_demo_mode", { hotkeys });
  }

  async exitDemoMode(): Promise<void> {
    return invoke("exit_demo_mode");
  }

  async isDemoMode(): Promise<boolean> {
    return invoke<boolean>("is_demo_mode");
  }

  async deliverText(
    text: string,
    method: string,
    typeDelay?: number,
  ): Promise<void> {
    return invoke("deliver_text", { text, method, typeDelay });
  }

  async importVideo(
    projectPath: string,
    sourceFilePath: string,
  ): Promise<string> {
    return invoke<string>("import_video", { projectPath, sourceFilePath });
  }

  async getImportedVideos(_projectPath: string): Promise<string[]> {
    // TODO: implement Rust command to list videos in project
    return [];
  }

  async playVideo(
    videoFile: string,
    startTime: number,
    endTime: number,
    speed: number,
    transitionActions?: import("../types").TransitionAction[],
  ): Promise<void> {
    return invoke("play_video", {
      videoFile,
      startTime,
      endTime,
      speed,
      transitionActions: transitionActions ?? null,
    });
  }

  async closePlaybackWindow(): Promise<void> {
    return invoke("close_playback_window");
  }
}
