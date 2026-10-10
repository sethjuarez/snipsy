import { create } from "zustand";
import type {
  ProjectData,
  Script,
  TextSnippet,
  VideoSnippet,
} from "../types";
import { getBackend, type BackendService } from "../services";
import type { HotkeyIssue, SnippetHotkey } from "../services/backendService";

const backend: BackendService = getBackend();

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
  automations: Script[];
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

  loadAutomations: () => Promise<void>;
  saveAutomation: (script: Script) => Promise<void>;
  deleteAutomation: (id: string) => Promise<void>;
  checkFfmpeg: () => Promise<void>;

  /** Hotkeys the last demo registration could not arm (duplicates, OS failures). */
  demoHotkeyIssues: HotkeyIssue[];
  enterDemoMode: () => Promise<void>;
  exitDemoMode: () => Promise<void>;
  /** Re-register hotkeys from current state while demo mode is live. */
  syncDemoHotkeys: () => Promise<void>;
  /** Clear a backend demo session the frontend doesn't know about. */
  reconcileDemoMode: () => Promise<void>;
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

async function publishStreamDeckActiveProject(path: string | null) {
  try {
    await backend.setStreamDeckActiveProject(path);
  } catch (error) {
    console.warn("Failed to publish Stream Deck active project:", error);
  }
}

export function buildDemoHotkeys(
  state: Pick<ProjectState, "textSnippets" | "videoSnippets" | "automations" | "projectPath">,
): SnippetHotkey[] {
  const { textSnippets, videoSnippets, automations, projectPath } = state;
  return [
    ...textSnippets.map((s) => ({
      id: s.id,
      hotkey: s.hotkey,
      snippetType: "text" as const,
      text: s.text,
      delivery: s.delivery,
      typeDelay: s.typeDelay,
    })),
    ...videoSnippets.map((s) => ({
      id: s.id,
      hotkey: s.hotkey,
      snippetType: "video" as const,
      projectPath: projectPath ?? undefined,
      videoFile: s.videoFile,
      startTime: s.startTime,
      endTime: s.endTime,
      speed: s.speed,
      transitionActions: s.transitionActions,
      targetMonitor: s.targetMonitor,
      endBehavior: s.endBehavior,
      hideCursor: s.hideCursor,
      backgroundColor: s.backgroundColor,
      clickToPlay: s.clickToPlay,
      muted: s.muted,
      pauseStops: s.pauseStops,
    })),
    ...automations
      .filter((s) => Boolean(s.hotkey))
      .map((s) => ({
        id: s.id,
        hotkey: s.hotkey ?? "",
        snippetType: "automation" as const,
        projectPath: projectPath ?? undefined,
        scriptId: s.id,
      })),
  ];
}

// Serialize hotkey registrations so a slow call can't overwrite a newer one.
let demoHotkeySync: Promise<void> = Promise.resolve();
function queueDemoHotkeySync(task: () => Promise<void>): Promise<void> {
  demoHotkeySync = demoHotkeySync.then(task, task);
  return demoHotkeySync;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectPath: null,
  projectName: null,
  projectDescription: null,
  textSnippets: [],
  videoSnippets: [],
  automations: [],
  demoMode: false,
  demoHotkeyIssues: [],
  ffmpegAvailable: null,
  recentProjects: loadRecentProjects(),

  createProject: async (path, name, description) => {
    const data = await backend.createProject(path, name, description);
    applyProjectData(set, path, data);
    void publishStreamDeckActiveProject(path);
    set({ automations: [] });
    saveRecentProject(path, name);
    set({ recentProjects: loadRecentProjects() });
  },

  openProject: async (path) => {
    const data = await backend.openProject(path);
    applyProjectData(set, path, data);
    void publishStreamDeckActiveProject(path);
    saveRecentProject(path, data.project.name);
    set({ recentProjects: loadRecentProjects() });

    // Load automations and check FFmpeg in parallel (non-blocking)
    const [automations, ffmpegStatus] = await Promise.allSettled([
      backend.loadAutomations(path),
      backend.checkFfmpeg(),
    ]);
    set({ automations: automations.status === "fulfilled" ? automations.value : [] });
    if (ffmpegStatus.status === "fulfilled") {
      set({ ffmpegAvailable: ffmpegStatus.value.available });
    }
    // Swap the live demo hotkeys to this project even if a side load failed.
    await get().syncDemoHotkeys();
    if (automations.status === "rejected") throw automations.reason;
  },

  closeProject: () => {
    void publishStreamDeckActiveProject(null);
    if (get().demoMode) {
      void get().exitDemoMode();
    }
    set({
      projectPath: null,
      projectName: null,
      projectDescription: null,
      textSnippets: [],
      videoSnippets: [],
      automations: [],
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
    await get().syncDemoHotkeys();
  },

  setVideoSnippets: async (snippets) => {
    const { projectPath } = get();
    if (projectPath) {
      await backend.saveVideoSnippets(projectPath, snippets);
    }
    set({ videoSnippets: snippets });
    await get().syncDemoHotkeys();
  },

  loadAutomations: async () => {
    const { projectPath } = get();
    if (projectPath) {
      const automations = await backend.loadAutomations(projectPath);
      set({ automations });
      await get().syncDemoHotkeys();
    }
  },

  saveAutomation: async (script) => {
    const { projectPath, automations } = get();
    if (projectPath) {
      await backend.saveAutomation(projectPath, script);
    }
    const existing = automations.findIndex((s) => s.id === script.id);
    if (existing >= 0) {
      const updated = [...automations];
      updated[existing] = script;
      set({ automations: updated });
    } else {
      set({ automations: [...automations, script] });
    }
    await get().syncDemoHotkeys();
  },

  deleteAutomation: async (id) => {
    const { projectPath, automations } = get();
    if (projectPath) {
      await backend.deleteAutomation(projectPath, id);
    }
    set({ automations: automations.filter((s) => s.id !== id) });
    await get().syncDemoHotkeys();
  },

  checkFfmpeg: async () => {
    const status = await backend.checkFfmpeg();
    set({ ffmpegAvailable: status.available });
  },

  enterDemoMode: async () => {
    // Mark live first so edits made while registering are re-synced afterwards.
    set({ demoMode: true });
    // The whole transition is queued so a quick enter/exit can't interleave.
    await queueDemoHotkeySync(async () => {
      if (!get().demoMode) return;
      try {
        set({ demoHotkeyIssues: (await backend.enterDemoMode(buildDemoHotkeys(get()))) ?? [] });
      } catch (e) {
        console.error("enterDemoMode failed:", e);
      }
      try {
        await backend.activateDemoTray();
      } catch (e) {
        console.error("activateDemoTray failed:", e);
      }
      // Hide window to the platform background surface.
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().hide();
      } catch {
        // Not in Tauri (browser/test) — no-op
      }
    });
  },

  syncDemoHotkeys: () =>
    queueDemoHotkeySync(async () => {
      // Read state inside the queued task so the latest snapshot wins.
      if (!get().demoMode) return;
      try {
        set({ demoHotkeyIssues: (await backend.enterDemoMode(buildDemoHotkeys(get()))) ?? [] });
      } catch (e) {
        console.error("Failed to sync demo hotkeys:", e);
      }
    }),

  reconcileDemoMode: () =>
    queueDemoHotkeySync(async () => {
      if (get().demoMode) return;
      try {
        if (!(await backend.isDemoMode())) return;
        await backend.exitDemoMode();
        await backend.deactivateDemoTray();
      } catch (e) {
        console.warn("Failed to reconcile demo mode:", e);
      }
    }),

  exitDemoMode: async () => {
    set({ demoMode: false, demoHotkeyIssues: [] });
    await queueDemoHotkeySync(async () => {
      if (get().demoMode) return;
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
      // Show window from the platform background surface.
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        await win.show();
        await win.setFocus();
      } catch {
        // Not in Tauri (browser/test) — no-op
      }
    });
  },

  playVideo: async (snippet) => {
    const { projectPath } = get();
    // If the saved monitor doesn't exist on this machine, fall back to the first available
    let monitor = snippet.targetMonitor;
    try {
      const monitors = await backend.listMonitors();
      if (monitor && !monitors.some((m) => m.name === monitor)) {
        monitor = monitors.length > 0 ? monitors[0].name : undefined;
      } else if (!monitor && monitors.length > 0) {
        monitor = monitors[0].name;
      }
    } catch {
      // listMonitors failed — proceed with whatever we have
    }
    await backend.playVideo(
      projectPath,
      snippet.videoFile,
      snippet.startTime,
      snippet.endTime,
      snippet.speed,
      snippet.transitionActions,
      monitor,
      snippet.endBehavior,
      snippet.hideCursor,
      snippet.backgroundColor,
      snippet.clickToPlay,
      snippet.muted,
      snippet.pauseStops,
    );
  },
}));
