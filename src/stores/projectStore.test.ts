import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Script, TextSnippet, VideoSnippet } from "../types";

const backend = vi.hoisted(() => ({
  createProject: vi.fn(),
  openProject: vi.fn(),
  saveTextSnippets: vi.fn(),
  saveVideoSnippets: vi.fn(),
  loadAutomations: vi.fn(),
  saveAutomation: vi.fn(),
  deleteAutomation: vi.fn(),
  checkFfmpeg: vi.fn(),
  enterDemoMode: vi.fn(),
  exitDemoMode: vi.fn(),
  isDemoMode: vi.fn(),
  activateDemoTray: vi.fn(),
  deactivateDemoTray: vi.fn(),
  setStreamDeckActiveProject: vi.fn(),
}));

vi.mock("../services", () => ({ getBackend: () => backend }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ hide: vi.fn(), show: vi.fn(), setFocus: vi.fn() }),
}));

const { buildDemoHotkeys, useProjectStore } = await import("./projectStore");

const text = (id: string, hotkey: string): TextSnippet => ({
  id, title: id, description: "", text: `text ${id}`, hotkey, delivery: "paste",
});
const video = (id: string, hotkey: string): VideoSnippet => ({
  id, title: id, description: "", videoFile: "v.mp4", startTime: 0, endTime: 1, hotkey, speed: 1,
});
const script = (id: string, hotkey?: string): Script => ({ id, title: id, description: "", hotkey });

const registeredIds = () => {
  const calls = backend.enterDemoMode.mock.calls;
  return (calls[calls.length - 1][0] as { id: string; hotkey: string }[]).map((h) => `${h.id}:${h.hotkey}`);
};

beforeEach(async () => {
  for (const fn of Object.values(backend)) fn.mockReset().mockResolvedValue(undefined);
  backend.enterDemoMode.mockResolvedValue([]);
  backend.loadAutomations.mockResolvedValue([]);
  backend.checkFfmpeg.mockResolvedValue({ available: true });
  backend.isDemoMode.mockResolvedValue(false);
  useProjectStore.setState({
    projectPath: "C:/project",
    projectName: "Project",
    textSnippets: [],
    videoSnippets: [],
    automations: [],
    demoMode: false,
    demoHotkeyIssues: [],
  });
  await useProjectStore.getState().syncDemoHotkeys(); // drain the queue between tests
});

describe("buildDemoHotkeys", () => {
  it("lists text, video, then automations with hotkeys, carrying delivery data", () => {
    const hotkeys = buildDemoHotkeys({
      projectPath: "C:/project",
      textSnippets: [text("t", "Ctrl+1")],
      videoSnippets: [video("v", "Ctrl+2")],
      automations: [script("s", "Ctrl+3"), script("none")],
    });
    expect(hotkeys.map((h) => [h.id, h.snippetType])).toEqual([["t", "text"], ["v", "video"], ["s", "automation"]]);
    expect(hotkeys[0]).toMatchObject({ text: "text t", delivery: "paste" });
    expect(hotkeys[1]).toMatchObject({ projectPath: "C:/project", videoFile: "v.mp4" });
    expect(hotkeys[2]).toMatchObject({ projectPath: "C:/project", scriptId: "s" });
  });
});

describe("demo hotkey sync", () => {
  it("does not touch backend hotkeys outside demo mode", async () => {
    await useProjectStore.getState().setTextSnippets([text("t", "Ctrl+1")]);
    expect(backend.saveTextSnippets).toHaveBeenCalled();
    expect(backend.enterDemoMode).not.toHaveBeenCalled();
  });

  it("re-registers hotkeys when a snippet changes during demo mode", async () => {
    const store = useProjectStore.getState();
    await store.setTextSnippets([text("t", "Ctrl+1")]);
    await store.enterDemoMode();
    expect(registeredIds()).toEqual(["t:Ctrl+1"]);

    await useProjectStore.getState().setTextSnippets([text("t", "Ctrl+9")]);
    expect(registeredIds()).toEqual(["t:Ctrl+9"]);

    await useProjectStore.getState().setVideoSnippets([video("v", "Ctrl+2")]);
    expect(registeredIds()).toEqual(["t:Ctrl+9", "v:Ctrl+2"]);

    await useProjectStore.getState().saveAutomation(script("s", "Ctrl+3"));
    expect(registeredIds()).toEqual(["t:Ctrl+9", "v:Ctrl+2", "s:Ctrl+3"]);

    await useProjectStore.getState().deleteAutomation("s");
    expect(registeredIds()).toEqual(["t:Ctrl+9", "v:Ctrl+2"]);
  });

  it("stores issues reported by the backend and clears them on exit", async () => {
    const issue = { snippetId: "b", hotkey: "Ctrl+1", kind: "duplicate" as const, detail: "a" };
    backend.enterDemoMode.mockResolvedValue([issue]);
    await useProjectStore.getState().enterDemoMode();
    expect(useProjectStore.getState().demoHotkeyIssues).toEqual([issue]);

    await useProjectStore.getState().exitDemoMode();
    expect(useProjectStore.getState().demoHotkeyIssues).toEqual([]);
  });

  it("keeps syncing after a failed registration", async () => {
    backend.enterDemoMode.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await useProjectStore.getState().enterDemoMode();
    await useProjectStore.getState().setTextSnippets([text("t", "Ctrl+1")]);
    expect(backend.enterDemoMode).toHaveBeenCalledTimes(2);
    expect(registeredIds()).toEqual(["t:Ctrl+1"]);
  });

  it("runs a quick enter then exit in order, ending with hotkeys cleared", async () => {
    const order: string[] = [];
    backend.enterDemoMode.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("enter");
      return [];
    });
    backend.exitDemoMode.mockImplementation(async () => { order.push("exit"); });
    const store = useProjectStore.getState();
    const entering = store.enterDemoMode();
    const exiting = store.exitDemoMode();
    await Promise.all([entering, exiting]);
    // Enter was cancelled before it started, so only exit runs.
    expect(order).toEqual(["exit"]);
    expect(useProjectStore.getState().demoMode).toBe(false);
  });

  it("exits demo mode when the project closes", async () => {
    await useProjectStore.getState().enterDemoMode();
    useProjectStore.getState().closeProject();
    await useProjectStore.getState().syncDemoHotkeys();
    expect(backend.exitDemoMode).toHaveBeenCalled();
    expect(useProjectStore.getState().demoMode).toBe(false);
  });

  it("re-syncs hotkeys on project open even if FFmpeg checks fail", async () => {
    await useProjectStore.getState().enterDemoMode();
    backend.openProject.mockResolvedValue({
      project: { name: "Other", description: "" },
      textSnippets: [text("o", "Ctrl+5")],
      videoSnippets: [],
    });
    backend.checkFfmpeg.mockRejectedValue(new Error("no ffmpeg"));
    await useProjectStore.getState().openProject("C:/other");
    expect(registeredIds()).toEqual(["o:Ctrl+5"]);
  });

  it("reconcile clears a backend demo session the frontend lost", async () => {
    backend.isDemoMode.mockResolvedValue(true);
    await useProjectStore.getState().reconcileDemoMode();
    expect(backend.exitDemoMode).toHaveBeenCalled();
    expect(backend.deactivateDemoTray).toHaveBeenCalled();
  });

  it("reconcile leaves a live frontend demo session alone", async () => {
    await useProjectStore.getState().enterDemoMode();
    backend.isDemoMode.mockResolvedValue(true);
    await useProjectStore.getState().reconcileDemoMode();
    expect(backend.exitDemoMode).not.toHaveBeenCalled();
  });
});
