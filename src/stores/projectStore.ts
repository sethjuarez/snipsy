import { create } from "zustand";
import type {
  ProjectData,
  TextSnippet,
  VideoSnippet,
} from "../types";
import { createBackendService, type BackendService } from "../services";

const backend: BackendService = createBackendService();

interface ProjectState {
  projectPath: string | null;
  projectName: string | null;
  projectDescription: string | null;
  textSnippets: TextSnippet[];
  videoSnippets: VideoSnippet[];
  demoMode: boolean;

  createProject: (
    path: string,
    name: string,
    description: string,
  ) => Promise<void>;
  openProject: (path: string) => Promise<void>;
  closeProject: () => void;

  setTextSnippets: (snippets: TextSnippet[]) => Promise<void>;
  setVideoSnippets: (snippets: VideoSnippet[]) => Promise<void>;

  enterDemoMode: () => Promise<void>;
  exitDemoMode: () => Promise<void>;
  playVideo: (snippet: VideoSnippet) => Promise<void>;
}

function applyProjectData(
  set: (partial: Partial<ProjectState>) => void,
  path: string,
  data: ProjectData,
) {
  set({
    projectPath: path,
    projectName: data.project.name,
    projectDescription: data.project.description,
    textSnippets: data.textSnippets,
    videoSnippets: data.videoSnippets,
  });
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectPath: null,
  projectName: null,
  projectDescription: null,
  textSnippets: [],
  videoSnippets: [],
  demoMode: false,

  createProject: async (path, name, description) => {
    const data = await backend.createProject(path, name, description);
    applyProjectData(set, path, data);
  },

  openProject: async (path) => {
    const data = await backend.openProject(path);
    applyProjectData(set, path, data);
  },

  closeProject: () => {
    set({
      projectPath: null,
      projectName: null,
      projectDescription: null,
      textSnippets: [],
      videoSnippets: [],
      demoMode: false,
    });
  },

  setTextSnippets: async (snippets) => {
    const { projectPath } = get();
    if (projectPath) {
      await backend.saveTextSnippets(projectPath, snippets);
    }
    set({ textSnippets: snippets });
  },

  setVideoSnippets: async (snippets) => {
    const { projectPath } = get();
    if (projectPath) {
      await backend.saveVideoSnippets(projectPath, snippets);
    }
    set({ videoSnippets: snippets });
  },

  enterDemoMode: async () => {
    const { textSnippets, videoSnippets } = get();
    const hotkeys = [
      ...textSnippets.map((s) => ({
        id: s.id,
        hotkey: s.hotkey,
        snippetType: "text",
      })),
      ...videoSnippets.map((s) => ({
        id: s.id,
        hotkey: s.hotkey,
        snippetType: "video",
      })),
    ];
    await backend.enterDemoMode(hotkeys);
    set({ demoMode: true });
  },

  exitDemoMode: async () => {
    await backend.exitDemoMode();
    set({ demoMode: false });
  },

  playVideo: async (snippet) => {
    await backend.playVideo(
      snippet.videoFile,
      snippet.startTime,
      snippet.endTime,
      snippet.speed,
    );
  },
}));
