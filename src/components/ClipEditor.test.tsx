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

function renderEditor(pauseStops: PauseStop[]) {
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
});
