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

  async getImportedVideos(projectPath: string): Promise<import("../types").ImportedVideo[]> {
    return invoke<import("../types").ImportedVideo[]>("list_imported_videos", { projectPath });
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

  async saveScript(
    projectPath: string,
    script: import("../types").Script,
  ): Promise<void> {
    return invoke("save_script", { projectPath, script });
  }

  async loadScripts(
    projectPath: string,
  ): Promise<import("../types").Script[]> {
    return invoke("load_scripts", { projectPath });
  }

  async deleteScript(projectPath: string, id: string): Promise<void> {
    return invoke("delete_script", { projectPath, id });
  }

  async runScript(projectPath: string, scriptId: string): Promise<string> {
    return invoke("run_script", { projectPath, scriptId });
  }

  async checkFfmpeg(): Promise<boolean> {
    return invoke("check_ffmpeg");
  }

  async installFfmpeg(): Promise<string> {
    return invoke("install_ffmpeg");
  }

  async activateDemoTray(): Promise<void> {
    return invoke("activate_demo_tray");
  }

  async deactivateDemoTray(): Promise<void> {
    return invoke("deactivate_demo_tray");
  }

  async isElevated(): Promise<boolean> {
    return invoke<boolean>("is_elevated");
  }

  async relaunchAsAdmin(): Promise<void> {
    return invoke("relaunch_as_admin");
  }

  async selectVideoFile(): Promise<string | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({
      multiple: false,
      filters: [
        { name: "Video Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "wmv"] },
      ],
    });
    if (Array.isArray(result)) return result[0] ?? null;
    return result;
  }

  async deleteVideo(projectPath: string, relativePath: string): Promise<void> {
    return invoke("delete_video", { projectPath, relativePath });
  }

  async getVideoFps(videoPath: string): Promise<number> {
    return invoke<number>("get_video_fps", { videoPath });
  }
}
