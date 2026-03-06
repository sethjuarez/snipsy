import { create } from "zustand";
import type {
  ProjectData,
  Script,
  TextSnippet,
  VideoSnippet,
} from "../types";
import { createBackendService, type BackendService } from "../services";

const backend: BackendService = createBackendService();

const STORAGE_KEY_LAST = "snipsy:lastProject";
const STORAGE_KEY_RECENT = "snipsy:recentProjects";
const MAX_RECENT = 10;

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: string; // ISO 8601
}

function loadRecentProjects(): RecentProject[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_RECENT) || "[]");
  } catch {
    return [];
  }
}

function saveRecentProject(path: string, name: string) {
  const recent = loadRecentProjects().filter((r) => r.path !== path);
  recent.unshift({ path, name, lastOpened: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(recent.slice(0, MAX_RECENT)));
  localStorage.setItem(STORAGE_KEY_LAST, path);
}

function removeRecentProject(path: string) {
  const recent = loadRecentProjects().filter((r) => r.path !== path);
  localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(recent));
  if (localStorage.getItem(STORAGE_KEY_LAST) === path) {
    localStorage.removeItem(STORAGE_KEY_LAST);
  }
}

interface ProjectState {
  projectPath: string | null;
  projectName: string | null;
  projectDescription: string | null;
  textSnippets: TextSnippet[];
  videoSnippets: VideoSnippet[];
  scripts: Script[];
  demoMode: boolean;
  ffmpegAvailable: boolean | null;
  recentProjects: RecentProject[];

  createProject: (
    path: string,
    name: string,
    description: string,
  ) => Promise<void>;
  openProject: (path: string) => Promise<void>;
  closeProject: () => void;
  autoOpenLastProject: () => Promise<boolean>;
  loadRecentProjects: () => void;
  removeRecentProject: (path: string) => void;

  setTextSnippets: (snippets: TextSnippet[]) => Promise<void>;
  setVideoSnippets: (snippets: VideoSnippet[]) => Promise<void>;

  loadScripts: () => Promise<void>;
  saveScript: (script: Script) => Promise<void>;
  deleteScript: (id: string) => Promise<void>;
  checkFfmpeg: () => Promise<void>;

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
  scripts: [],
  demoMode: false,
  ffmpegAvailable: null,
  recentProjects: loadRecentProjects(),

  createProject: async (path, name, description) => {
    const data = await backend.createProject(path, name, description);
    applyProjectData(set, path, data);
    set({ scripts: [] });
    saveRecentProject(path, name);
    set({ recentProjects: loadRecentProjects() });
  },

  openProject: async (path) => {
    const data = await backend.openProject(path);
    applyProjectData(set, path, data);
    const scripts = await backend.loadScripts(path);
    set({ scripts });
    const ffmpegAvailable = await backend.checkFfmpeg();
    set({ ffmpegAvailable });
    saveRecentProject(path, data.project.name);
    set({ recentProjects: loadRecentProjects() });
  },

  closeProject: () => {
    set({
      projectPath: null,
      projectName: null,
      projectDescription: null,
      textSnippets: [],
      videoSnippets: [],
      scripts: [],
      demoMode: false,
    });
  },

  autoOpenLastProject: async () => {
    const lastPath = localStorage.getItem(STORAGE_KEY_LAST);
    if (!lastPath) return false;
    try {
      await get().openProject(lastPath);
      return true;
    } catch {
      // Project no longer exists — clear it
      localStorage.removeItem(STORAGE_KEY_LAST);
      return false;
    }
  },

  loadRecentProjects: () => {
    set({ recentProjects: loadRecentProjects() });
  },

  removeRecentProject: (path: string) => {
    removeRecentProject(path);
    set({ recentProjects: loadRecentProjects() });
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

  loadScripts: async () => {
    const { projectPath } = get();
    if (projectPath) {
      const scripts = await backend.loadScripts(projectPath);
      set({ scripts });
    }
  },

  saveScript: async (script) => {
    const { projectPath, scripts } = get();
    if (projectPath) {
      await backend.saveScript(projectPath, script);
    }
    const existing = scripts.findIndex((s) => s.id === script.id);
    if (existing >= 0) {
      const updated = [...scripts];
      updated[existing] = script;
      set({ scripts: updated });
    } else {
      set({ scripts: [...scripts, script] });
    }
  },

  deleteScript: async (id) => {
    const { projectPath, scripts } = get();
    if (projectPath) {
      await backend.deleteScript(projectPath, id);
    }
    set({ scripts: scripts.filter((s) => s.id !== id) });
  },

  checkFfmpeg: async () => {
    const available = await backend.checkFfmpeg();
    set({ ffmpegAvailable: available });
  },

  enterDemoMode: async () => {
    const { textSnippets, videoSnippets } = get();
    const hotkeys = [
      ...textSnippets.map((s) => ({
        id: s.id,
        hotkey: s.hotkey,
        snippetType: "text",
        text: s.text,
        delivery: s.delivery,
        typeDelay: s.typeDelay,
      })),
      ...videoSnippets.map((s) => ({
        id: s.id,
        hotkey: s.hotkey,
        snippetType: "video",
      })),
    ];
    try {
      await backend.enterDemoMode(hotkeys);
    } catch (e) {
      console.error("enterDemoMode failed:", e);
    }
    try {
      await backend.activateDemoTray();
    } catch (e) {
      console.error("activateDemoTray failed:", e);
    }
    // Hide window to system tray
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().hide();
    } catch {
      // Not in Tauri (browser/test) — no-op
    }
    set({ demoMode: true });
  },

  exitDemoMode: async () => {
    try {
      await backend.exitDemoMode();
    } catch (e) {
      console.error("exitDemoMode failed:", e);
    }
    try {
      await backend.deactivateDemoTray();
    } catch (e) {
      console.error("deactivateDemoTray failed:", e);
    }
    // Show window back from tray
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.show();
      await win.setFocus();
    } catch {
      // Not in Tauri (browser/test) — no-op
    }
    set({ demoMode: false });
  },

  playVideo: async (snippet) => {
    await backend.playVideo(
      snippet.videoFile,
      snippet.startTime,
      snippet.endTime,
      snippet.speed,
      snippet.transitionActions,
    );
  },
}));
