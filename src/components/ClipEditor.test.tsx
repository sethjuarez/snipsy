import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportedVideo, PauseStop, VideoSnippet } from "../types";
import ClipEditor, { type ClipEditorHandle, type ClipEditorSaveState } from "./ClipEditor";

vi.mock("../services/auditaur", () => ({
  auditaurInvoke: vi.fn(),
  isTauriRuntime: () => false,
  tauriFileSrc: (file: string) => file,
}));

vi.mock("../services", () => {
  const backend = new Proxy(
    {
      listMonitors: () => Promise.resolve([]),
      captureMonitorPreview: () => Promise.resolve(null),
      getVideoFps: () => Promise.resolve(30),
    } as Record<string, unknown>,
    { get: (target, key: string) => target[key] ?? (() => Promise.resolve(null)) },
  );
  return { getBackend: () => backend };
});

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 900;

const restorers: Array<() => void> = [];

function stubProperty(target: object, key: string, descriptor: PropertyDescriptor) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
  restorers.push(() => {
    if (original) Object.defineProperty(target, key, original);
    else delete (target as Record<string, unknown>)[key];
  });
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  stubProperty(HTMLElement.prototype, "clientWidth", { get: () => VIEW_WIDTH });
  stubProperty(HTMLElement.prototype, "clientHeight", { get: () => VIEW_HEIGHT });
  stubProperty(HTMLElement.prototype, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, right: VIEW_WIDTH, bottom: VIEW_HEIGHT, width: VIEW_WIDTH, height: VIEW_HEIGHT, x: 0, y: 0, toJSON() {} }),
  });
  stubProperty(HTMLVideoElement.prototype, "videoWidth", { get: () => VIEW_WIDTH });
  stubProperty(HTMLVideoElement.prototype, "videoHeight", { get: () => VIEW_HEIGHT });
  stubProperty(HTMLMediaElement.prototype, "duration", { get: () => 10 });
  stubProperty(HTMLMediaElement.prototype, "currentTime", { get: () => 2, set: () => {} });
  stubProperty(HTMLMediaElement.prototype, "pause", { value: vi.fn() });
  stubProperty(HTMLMediaElement.prototype, "play", { value: vi.fn(() => Promise.resolve()) });
});

afterEach(() => {
  cleanup();
  while (restorers.length) restorers.pop()!();
  vi.unstubAllGlobals();
});

const video: ImportedVideo = {
  name: "clip.mp4",
  relativePath: "videos/clip.mp4",
  absolutePath: "C:/videos/clip.mp4",
  thumbnailPath: null,
};

function renderEditor(pauseStops: PauseStop[], extra: Partial<VideoSnippet> = {}) {
  const clip: VideoSnippet = {
    id: "clip-1",
    title: "Zoom clip",
    description: "",
    videoFile: video.relativePath,
    startTime: 0,
    endTime: 8,
    hotkey: "CmdOrControl+Shift+9",
    speed: 1,
    pauseStops,
    ...extra,
  };
  const onSave = vi.fn();
  const saveStates: ClipEditorSaveState[] = [];
  const ref = createRef<ClipEditorHandle>();
  render(
    <ClipEditor
      ref={ref}
      video={video}
      existingClip={clip}
      onSave={onSave}
      onSaveStateChange={(state) => saveStates.push(state)}
    />,
  );
  fireEvent(screen.getByTestId("clip-editor-video"), new Event("loadedmetadata"));
  fireEvent.click(screen.getByTestId("clip-inspector-tab-moments"));
  const save = () => act(() => ref.current!.save());
  const savedStops = () => (onSave.mock.calls[onSave.mock.calls.length - 1]?.[0] as VideoSnippet).pauseStops ?? [];
  return { onSave, save, savedStops, saveStates };
}

const spotlightStop: PauseStop = {
  time: 2,
  label: "Login",
  spotlight: { regions: [{ type: "rectangle", x: 60, y: 20, width: 20, height: 10 }] },
};

describe("ClipEditor saving", () => {
  it("keeps transition actions it does not edit", () => {
    const transitionActions = [{ trigger: "end", action: "nextSnippet" }] as unknown as VideoSnippet["transitionActions"];
    const { onSave, save } = renderEditor([], { transitionActions });
    save();
    expect((onSave.mock.lastCall?.[0] as VideoSnippet).transitionActions).toEqual(transitionActions);
  });

  it("saves every field it was given unchanged", () => {
    const extra: Partial<VideoSnippet> = {
      description: "Walkthrough",
      targetMonitor: "\\\\.\\DISPLAY2",
      endBehavior: "freeze",
      hideCursor: true,
      backgroundColor: "#112233",
      clickToPlay: true,
      muted: true,
      transitionActions: [{ trigger: "end", action: "nextSnippet" }] as unknown as VideoSnippet["transitionActions"],
      streamDeckIcon: { kind: "emoji", value: "🎬", background: "#000000", foreground: "#ffffff" },
    };
    const { onSave, save } = renderEditor([spotlightStop], extra);
    save();
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.lastCall?.[0] as VideoSnippet;
    // The editor saves everything but the id; App supplies the existing id.
    expect(saved).toEqual({
      title: "Zoom clip",
      videoFile: video.relativePath,
      startTime: 0,
      endTime: 8,
      hotkey: "CmdOrControl+Shift+9",
      speed: 1,
      ...extra,
      pauseStops: [spotlightStop],
    });
  });
});

describe("ClipEditor zoom editing", () => {
  it("adds a ZoomIt-style zoom centered on the spotlight and saves it", async () => {
    const { save, savedStops } = renderEditor([spotlightStop]);

    fireEvent.click(screen.getByTestId("pause-stop-zoom-0"));

    const toolbar = await screen.findByTestId("spotlight-editor-toolbar");
    expect(toolbar.getAttribute("data-editor-mode")).toBe("zoom");
    expect(screen.getByTestId("moment-editor-mode-zoom").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("zoom-scale-label").textContent).toContain("2×");
    const point = await screen.findByTestId("editor-zoom-point");
    expect(point.getAttribute("data-zoom-x")).toBe("70");
    expect(point.getAttribute("data-zoom-y")).toBe("25");
    // Spotlight-only controls are hidden in zoom mode.
    expect(screen.queryByTestId("spotlight-add-region")).toBeNull();
    expect(screen.queryByTestId("spotlight-color")).toBeNull();

    fireEvent.click(screen.getByTestId("spotlight-done"));
    save();

    expect(savedStops()[0].zoom).toEqual({ x: 70, y: 25, scale: 2 });
    expect(savedStops()[0].spotlight?.regions).toHaveLength(1);
  });

  it("picks the zoom point by clicking/dragging and adjusts scale with slider and wheel", async () => {
    const { save, savedStops } = renderEditor([{ time: 2 }]);

    fireEvent.click(screen.getByTestId("pause-stop-zoom-0"));
    const surface = await screen.findByTestId("spotlight-editor-surface");
    expect(screen.getByTestId("editor-zoom-point").getAttribute("data-zoom-x")).toBe("50");

    fireEvent.mouseDown(surface, { clientX: 400, clientY: 225 });
    expect(screen.getByTestId("editor-zoom-point").getAttribute("data-zoom-x")).toBe("25");
    expect(screen.getByTestId("editor-zoom-point").getAttribute("data-zoom-y")).toBe("25");

    fireEvent.mouseMove(window, { clientX: 1200, clientY: 675 });
    expect(screen.getByTestId("editor-zoom-point").getAttribute("data-zoom-x")).toBe("75");
    fireEvent.mouseUp(window);
    fireEvent.mouseMove(window, { clientX: 0, clientY: 0 });
    expect(screen.getByTestId("editor-zoom-point").getAttribute("data-zoom-x")).toBe("75");

    fireEvent.change(screen.getByTestId("zoom-scale"), { target: { value: "3.5" } });
    expect(screen.getByTestId("zoom-scale-label").textContent).toContain("3.5×");

    fireEvent.wheel(surface, { deltaY: -100 });
    expect(screen.getByTestId("zoom-scale-label").textContent).toContain("3.75×");
    fireEvent.wheel(surface, { deltaY: 100 });
    fireEvent.wheel(surface, { deltaY: 100 });
    expect(screen.getByTestId("zoom-scale-label").textContent).toContain("3.25×");

    fireEvent.change(screen.getByTestId("zoom-duration"), { target: { value: "800" } });
    expect((screen.getByTestId("zoom-duration") as HTMLInputElement).value).toBe("800");

    fireEvent.click(screen.getByTestId("spotlight-done"));
    save();
    expect(savedStops()[0].zoom).toEqual({ x: 75, y: 75, scale: 3.25, durationMs: 800 });
  });

  it("clamps the wheel to the max scale and shows the visible frame", async () => {
    renderEditor([{ time: 2, zoom: { x: 50, y: 50, scale: 5.75 } }]);

    fireEvent.click(screen.getByTestId("pause-stop-zoom-0"));
    const surface = await screen.findByTestId("spotlight-editor-surface");
    fireEvent.wheel(surface, { deltaY: -100 });
    fireEvent.wheel(surface, { deltaY: -100 });
    expect(screen.getByTestId("zoom-scale-label").textContent).toContain("6×");

    const frame = screen.getByTestId("editor-zoom-frame");
    // 6× of a 1600×900 frame centered at 50/50 shows the middle 1/6 of the video.
    expect(parseFloat(frame.style.width)).toBeCloseTo(VIEW_WIDTH / 6, 1);
    expect(parseFloat(frame.style.left)).toBeCloseTo(VIEW_WIDTH * (0.5 - 1 / 12), 1);
  });

  it("marks the editor unsaved when only the zoom changes", async () => {
    const { saveStates } = renderEditor([{ time: 2, zoom: { x: 50, y: 50, scale: 2 } }]);
    await waitFor(() => expect(saveStates[saveStates.length - 1]?.hasUnsavedChanges).toBe(false));

    fireEvent.click(screen.getByTestId("pause-stop-zoom-0"));
    fireEvent.change(await screen.findByTestId("zoom-scale"), { target: { value: "4" } });

    await waitFor(() => expect(saveStates[saveStates.length - 1]?.hasUnsavedChanges).toBe(true));
  });

  it("opens zoom-only timeline markers in zoom mode", async () => {
    renderEditor([{ time: 2, zoom: { x: 30, y: 40, scale: 3 } }]);

    const marker = screen.getByTestId("pause-stop-marker-0");
    expect(marker.getAttribute("data-zoom")).toBe("true");
    expect(screen.getByTestId("pause-stop-marker-zoom-0")).not.toBeNull();
    expect(screen.getByTestId("pause-stop-zoom-0").textContent).toContain("Edit zoom (3×)");

    fireEvent.click(marker);
    const toolbar = await screen.findByTestId("spotlight-editor-toolbar");
    expect(toolbar.getAttribute("data-editor-mode")).toBe("zoom");
    expect(screen.getByTestId("editor-zoom-point").getAttribute("data-zoom-x")).toBe("30");
  });

  it("switches between highlight and zoom modes without losing either", async () => {
    const { save, savedStops } = renderEditor([{ ...spotlightStop, zoom: { x: 10, y: 10, scale: 2 } }]);

    fireEvent.click(screen.getByTestId("pause-stop-spotlight-0"));
    expect((await screen.findByTestId("spotlight-editor-toolbar")).getAttribute("data-editor-mode")).toBe("spotlight");
    expect(screen.getByTestId("spotlight-add-region")).not.toBeNull();

    fireEvent.click(screen.getByTestId("moment-editor-mode-zoom"));
    expect(screen.getByTestId("spotlight-editor-toolbar").getAttribute("data-editor-mode")).toBe("zoom");
    expect(screen.getByTestId("editor-zoom-point").getAttribute("data-zoom-x")).toBe("10");

    fireEvent.click(screen.getByTestId("moment-editor-mode-spotlight"));
    expect(screen.queryByTestId("editor-zoom-point")).toBeNull();

    fireEvent.click(screen.getByTestId("spotlight-done"));
    save();
    expect(savedStops()[0].zoom).toEqual({ x: 10, y: 10, scale: 2 });
    expect(savedStops()[0].spotlight?.regions).toHaveLength(1);
  });

  it("discards unsaved zoom edits and restores the original zoom", async () => {
    const { save, savedStops } = renderEditor([
      { time: 2, zoom: { x: 50, y: 50, scale: 2 } },
      { time: 4 },
    ]);

    fireEvent.click(screen.getByTestId("pause-stop-marker-0"));
    fireEvent.change(await screen.findByTestId("zoom-scale"), { target: { value: "5" } });
    fireEvent.mouseDown(screen.getByTestId("spotlight-editor-surface"), { clientX: 160, clientY: 90 });
    fireEvent.mouseUp(window);

    fireEvent.click(screen.getByTestId("pause-stop-marker-1"));
    await screen.findByTestId("spotlight-exit-dialog");
    fireEvent.click(screen.getByTestId("confirm-dialog-secondary"));

    expect(screen.queryByTestId("spotlight-editor-toolbar")).toBeNull();
    save();
    expect(savedStops()[0].zoom).toEqual({ x: 50, y: 50, scale: 2 });
  });

  it("discards a newly added zoom entirely", async () => {
    const { save, savedStops } = renderEditor([{ time: 2 }, { time: 4 }]);

    fireEvent.click(screen.getByTestId("pause-stop-zoom-0"));
    await screen.findByTestId("editor-zoom-point");
    fireEvent.click(screen.getByTestId("pause-stop-marker-1"));
    await screen.findByTestId("spotlight-exit-dialog");
    fireEvent.click(screen.getByTestId("confirm-dialog-secondary"));

    save();
    expect(savedStops()[0].zoom).toBeUndefined();
  });

  it("removes a zoom from the toolbar and from the moment list", async () => {
    const { save, savedStops } = renderEditor([
      { time: 2, zoom: { x: 50, y: 50, scale: 2 } },
      { time: 4, zoom: { x: 20, y: 20, scale: 2 } },
    ]);

    fireEvent.click(screen.getByTestId("pause-stop-zoom-0"));
    fireEvent.click(await screen.findByTestId("zoom-remove"));
    expect(screen.queryByTestId("spotlight-editor-toolbar")).toBeNull();

    fireEvent.click(screen.getByTestId("clip-inspector-tab-moments"));
    const showAll = screen.queryByTestId("moments-show-all-toggle");
    if (showAll) fireEvent.click(showAll);
    fireEvent.click(await screen.findByTestId("remove-zoom-1"));

    save();
    expect(savedStops().map((stop) => stop.zoom)).toEqual([undefined, undefined]);
  });

  it("removing a different moment's zoom keeps the current edit open and dirty", async () => {
    renderEditor([
      { time: 2, zoom: { x: 50, y: 50, scale: 2 } },
      { time: 4, zoom: { x: 20, y: 20, scale: 2 } },
    ]);

    fireEvent.click(screen.getByTestId("pause-stop-marker-0"));
    fireEvent.change(await screen.findByTestId("zoom-scale"), { target: { value: "4" } });
    const showAll = screen.queryByTestId("moments-show-all-toggle");
    if (showAll) fireEvent.click(showAll);
    fireEvent.click(await screen.findByTestId("remove-zoom-1"));

    const toolbar = screen.getByTestId("spotlight-editor-toolbar");
    expect(toolbar.getAttribute("data-editing-index")).toBe("0");
    expect(screen.getByTestId("zoom-scale-label").textContent).toContain("4×");
    expect(screen.queryByTestId("pause-stop-marker-zoom-1")).toBeNull();
  });

  it("removing the edited zoom on a highlighted moment returns to highlight mode", async () => {
    const { save, savedStops } = renderEditor([{ ...spotlightStop, zoom: { x: 10, y: 10, scale: 2 } }]);

    fireEvent.click(screen.getByTestId("pause-stop-zoom-0"));
    fireEvent.click(await screen.findByTestId("zoom-remove"));

    expect(screen.getByTestId("spotlight-editor-toolbar").getAttribute("data-editor-mode")).toBe("spotlight");
    fireEvent.click(screen.getByTestId("spotlight-done"));
    save();
    expect(savedStops()[0].zoom).toBeUndefined();
    expect(savedStops()[0].spotlight?.regions).toHaveLength(1);
  });

  it("rejects moving a moment onto another moment's time so effects never merge", async () => {
    const { save, savedStops } = renderEditor([
      { ...spotlightStop, time: 2 },
      { time: 4, zoom: { x: 20, y: 20, scale: 3 } },
    ]);

    fireEvent.click(screen.getByTestId("pause-stop-marker-1"));
    await screen.findByTestId("editor-zoom-point");
    fireEvent.change(screen.getByTestId("selected-moment-time"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("spotlight-done"));

    save();
    expect(savedStops()).toHaveLength(2);
    expect(savedStops()[0].spotlight?.regions).toHaveLength(1);
    expect(savedStops()[0].zoom).toBeUndefined();
    expect(savedStops()[1]).toMatchObject({ time: 4, zoom: { x: 20, y: 20, scale: 3 } });
  });

  it("accumulates small trackpad wheel deltas and prevents page scrolling", async () => {
    renderEditor([{ time: 2, zoom: { x: 50, y: 50, scale: 2 } }]);

    fireEvent.click(screen.getByTestId("pause-stop-zoom-0"));
    const surface = await screen.findByTestId("spotlight-editor-surface");
    const wheel = (deltaY: number) => {
      const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
      act(() => { surface.dispatchEvent(event); });
      return event;
    };

    for (let i = 0; i < 4; i += 1) {
      expect(wheel(-20).defaultPrevented).toBe(true);
    }
    expect(screen.getByTestId("zoom-scale-label").textContent).toContain("2×");
    wheel(-20);
    expect(screen.getByTestId("zoom-scale-label").textContent).toContain("2.25×");
    wheel(30);
    expect(screen.getByTestId("zoom-scale-label").textContent).toContain("2.25×");
  });
});

describe("ClipEditor moment import", () => {
  const paste = (target: Element, text: string) =>
    fireEvent.paste(target, { clipboardData: { getData: (type: string) => (type === "text/plain" ? text : "") } });

  it("replaces all moments with a pasted list of section lengths", () => {
    const { save, savedStops } = renderEditor([spotlightStop, { time: 6 }]);

    fireEvent.click(screen.getByTestId("moments-import-open"));
    fireEvent.change(screen.getByTestId("moment-import-text"), {
      target: { value: "- Intro 2 seconds\n- Setup 1.5 sec\n- Demo 3s\n- Outro 1.5s" },
    });

    expect(screen.getByTestId("moment-import-mode-durations").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("moment-import-loss-warning").textContent).toContain("1 spotlight/zoom moment");
    expect(screen.getByTestId("moment-import-summary").textContent).toContain("3 moments replace the current 2");

    fireEvent.click(screen.getByTestId("moment-import-apply"));
    expect(screen.queryByTestId("moment-import-dialog")).toBeNull();
    save();

    expect(savedStops()).toEqual([
      { time: 2, label: "Setup" },
      { time: 3.5, label: "Demo" },
      { time: 6.5, label: "Outro" },
    ]);
  });

  it("lets the user override the detected mode and flags problem lines", () => {
    renderEditor([]);

    fireEvent.click(screen.getByTestId("moments-import-open"));
    fireEvent.change(screen.getByTestId("moment-import-text"), { target: { value: "0:02\n0:03\n0:99\n0:20" } });
    expect(screen.getByTestId("moment-import-mode-timecodes").getAttribute("aria-pressed")).toBe("true");
    const statuses = () => screen.getAllByTestId("moment-import-row").map((row) => row.getAttribute("data-status"));
    expect(statuses()).toEqual(["moment", "moment", "error", "skipped"]);

    fireEvent.click(screen.getByTestId("moment-import-mode-durations"));
    expect(screen.getByTestId("moment-import-mode-durations").getAttribute("aria-pressed")).toBe("true");
    expect(statuses()).toEqual(["moment", "moment", "error", "info"]);
    expect(screen.getByTestId("moment-import-note").textContent).toMatch(/longer than the clip/);
  });

  it("disables apply when nothing usable was pasted and cancels without changes", () => {
    const { save, savedStops } = renderEditor([{ time: 4 }]);

    fireEvent.click(screen.getByTestId("moments-import-open"));
    fireEvent.change(screen.getByTestId("moment-import-text"), { target: { value: "hello" } });
    expect((screen.getByTestId("moment-import-apply") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("moment-import-cancel"));
    expect(screen.queryByTestId("moment-import-dialog")).toBeNull();
    save();
    expect(savedStops()).toEqual([{ time: 4 }]);
  });

  it("clears existing moments when the list holds a single section", () => {
    const { save, savedStops } = renderEditor([{ time: 4 }]);

    fireEvent.click(screen.getByTestId("moments-import-open"));
    fireEvent.change(screen.getByTestId("moment-import-text"), { target: { value: "8 seconds" } });
    const apply = screen.getByTestId("moment-import-apply") as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    expect(apply.textContent).toBe("Clear moments");

    fireEvent.click(apply);
    save();
    expect(savedStops()).toEqual([]);
  });

  it("opens the import from Ctrl+V on the editor but not inside text fields", () => {
    renderEditor([]);

    fireEvent.click(screen.getByTestId("clip-inspector-tab-clip"));
    paste(screen.getByTestId("clip-title"), "0:02\n0:04");
    expect(screen.queryByTestId("moment-import-dialog")).toBeNull();

    paste(document.body, "just some words");
    expect(screen.queryByTestId("moment-import-dialog")).toBeNull();

    paste(document.body, "Version 2");
    expect(screen.queryByTestId("moment-import-dialog")).toBeNull();

    paste(document.body, "0:02\n0:04");
    expect(screen.getByTestId("moment-import-dialog")).toBeTruthy();
    expect((screen.getByTestId("moment-import-text") as HTMLTextAreaElement).value).toBe("0:02\n0:04");

    fireEvent.keyDown(screen.getByTestId("moment-import-text"), { key: "Enter", ctrlKey: true });
    expect(screen.queryByTestId("moment-import-dialog")).toBeNull();
    expect(screen.getByTestId("pause-stops-panel").textContent).toContain("2 moments");
  });
});

describe("ClipEditor inspector tabs", () => {
  it("moves between tabs with arrow, Home, and End keys", () => {
    renderEditor([]);
    const moments = screen.getByTestId("clip-inspector-tab-moments");
    expect(moments.getAttribute("aria-selected")).toBe("true");
    expect(moments.tabIndex).toBe(0);

    fireEvent.keyDown(moments, { key: "ArrowRight" });
    const streamDeck = screen.getByTestId("clip-inspector-tab-stream-deck");
    expect(streamDeck.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(streamDeck);
    expect(moments.tabIndex).toBe(-1);

    fireEvent.keyDown(streamDeck, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByTestId("clip-inspector-tab-clip"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(streamDeck);
    fireEvent.keyDown(streamDeck, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByTestId("clip-inspector-tab-clip"));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(streamDeck);
  });

  it("links each tab to its panel", () => {
    renderEditor([]);
    fireEvent.click(screen.getByTestId("clip-inspector-tab-clip"));
    const panel = screen.getByRole("tabpanel");
    expect(panel.id).toBe("clip-inspector-panel-clip");
    expect(panel.getAttribute("aria-labelledby")).toBe("clip-inspector-tab-clip");
    expect(screen.getByTestId("clip-inspector-tab-clip").getAttribute("aria-controls")).toBe(panel.id);
    expect(screen.getByTestId("clip-inspector-tab-moments").getAttribute("aria-controls")).toBeNull();
  });

  it("uses a short Deck label with the full Stream Deck name for assistive tech", () => {
    renderEditor([]);
    expect(screen.getByRole("tab", { name: "Stream Deck" }).textContent).toBe("Deck");
  });

  it("keeps the Stream Deck icon on its own tab", () => {
    renderEditor([]);
    fireEvent.click(screen.getByTestId("clip-inspector-tab-clip"));
    expect(screen.getByTestId("clip-details-section").textContent).toContain("Basics");
    expect(screen.queryByTestId("clip-icon-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("clip-inspector-tab-stream-deck"));
    expect(screen.getByTestId("clip-stream-deck-section")).toBeTruthy();
    expect(screen.getByTestId("clip-icon-preview")).toBeTruthy();
  });

  it("flags Basics when the clip has no name", () => {
    renderEditor([]);
    const basics = screen.getByTestId("clip-inspector-tab-clip");
    fireEvent.click(basics);
    expect(basics.textContent).not.toContain("needs attention");
    fireEvent.change(screen.getByTestId("clip-title"), { target: { value: "" } });
    expect(basics.textContent).toContain("needs attention");
  });
});