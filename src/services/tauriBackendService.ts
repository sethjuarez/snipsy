import { invoke } from "@tauri-apps/api/core";
import type { BackendService } from "./backendService";
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
}
