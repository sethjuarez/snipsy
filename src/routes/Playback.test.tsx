import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PauseStop } from "../types";
import Playback from "./Playback";

vi.mock("../services/auditaur", () => ({
  auditaurInvoke: vi.fn(),
  isTauriRuntime: () => false,
  tauriFileSrc: (file: string) => file,
}));

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

let playSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  stubProperty(HTMLElement.prototype, "clientWidth", { get: () => VIEW_WIDTH });
  stubProperty(HTMLElement.prototype, "clientHeight", { get: () => VIEW_HEIGHT });
  stubProperty(HTMLMediaElement.prototype, "seeking", { get: () => false });
  stubProperty(HTMLMediaElement.prototype, "currentTime", { get: () => 0, set: () => {} });
  stubProperty(HTMLMediaElement.prototype, "pause", { value: vi.fn() });
  playSpy = vi.fn(() => Promise.resolve());
  stubProperty(HTMLMediaElement.prototype, "play", { value: playSpy });
});

afterEach(() => {
  cleanup();
  while (restorers.length) restorers.pop()!();
  vi.unstubAllGlobals();
});

function renderPlayback(pauseStops: PauseStop[]) {
  const params = new URLSearchParams({
    file: "clip.mp4",
    start: "0",
    end: "10",
    pauseStops: JSON.stringify(pauseStops),
  });
  return render(
    <MemoryRouter initialEntries={[`/playback?${params.toString()}`]}>
      <Routes>
        <Route path="/playback" element={<Playback />} />
      </Routes>
    </MemoryRouter>,
  );
}

const zoomStop: PauseStop = {
  time: 2,
  label: "Look here",
  zoom: { x: 50, y: 50, scale: 2, durationMs: 60 },
  spotlight: { regions: [{ type: "rectangle", x: 40, y: 40, width: 20, height: 20 }] },
};

const stage = () => screen.getByTestId("playback-zoom-stage");

describe("Playback freeze frame", () => {
  let drawImage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stubProperty(HTMLVideoElement.prototype, "videoWidth", { get: () => 1920 });
    stubProperty(HTMLVideoElement.prototype, "videoHeight", { get: () => 1080 });
    drawImage = vi.fn();
    stubProperty(HTMLCanvasElement.prototype, "getContext", { value: vi.fn(() => ({ drawImage })) });
  });

  const video = () => screen.getByTestId("playback-video");
  const canvas = () => screen.getByTestId("playback-freeze-frame") as HTMLCanvasElement;

  it("zooms a canvas copy of the paused frame, then restores the live video before playing", async () => {
    renderPlayback([zoomStop]);
    expect(stage().dataset.frozenFrame).toBe("false");
    expect(canvas().style.visibility).toBe("hidden");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    // The still frame shows first and holds briefly before the zoom starts.
    await waitFor(() => expect(stage().dataset.frozenFrame).toBe("true"));
    expect(stage().dataset.zoomActive).toBe("false");
    expect(stage().style.transform).toBe("matrix(1, 0, 0, 1, 0, 0)");
    await act(() => new Promise((resolve) => setTimeout(resolve, 75)));
    expect(stage().dataset.zoomActive).toBe("false");
    await waitFor(() => expect(stage().dataset.zoomActive).toBe("true"));
    expect(stage().dataset.frozenFrame).toBe("true");
    expect(drawImage).toHaveBeenCalledWith(video(), 0, 0, 1920, 1080);
    expect(canvas().width).toBe(1920);
    expect(canvas().height).toBe(1080);
    expect(canvas().style.visibility).toBe("visible");
    expect(video().style.visibility).toBe("hidden");

    await screen.findByTestId("playback-spotlight-region-0");
    playSpy.mockClear();
    const visibilityAtPlay: string[] = [];
    playSpy.mockImplementation(() => {
      visibilityAtPlay.push(`${video().style.visibility}/${canvas().style.visibility}`);
      return Promise.resolve();
    });
    fireEvent.click(window);
    await waitFor(() => expect(stage().dataset.zoomActive).toBe("false"));
    // Still frozen while zooming out.
    expect(stage().dataset.frozenFrame).toBe("true");
    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(1));
    expect(visibilityAtPlay).toEqual(["visible/hidden"]);
    expect(stage().dataset.frozenFrame).toBe("false");
    expect(video().style.visibility).toBe("visible");
    expect(canvas().style.visibility).toBe("hidden");
  });

  it("resuming during the freeze hold skips the zoom and plays", async () => {
    renderPlayback([zoomStop]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(stage().dataset.frozenFrame).toBe("true"));
    await waitFor(() => expect(screen.getByTestId("playback-container").dataset.waitingForResume).toBe("true"));
    fireEvent.click(window);
    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(1));
    expect(stage().dataset.zoomActive).toBe("false");
    expect(stage().dataset.frozenFrame).toBe("false");
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(stage().dataset.zoomActive).toBe("false");
  });

  it("unfreezes immediately when navigating away from a zoomed stop", async () => {
    renderPlayback([zoomStop, { time: 5 }]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await screen.findByTestId("playback-spotlight-region-0");
    expect(stage().dataset.frozenFrame).toBe("true");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(stage().dataset.frozenFrame).toBe("false");
    expect(video().style.visibility).toBe("visible");
  });

  it("does not freeze stops without a zoom", async () => {
    renderPlayback([{ ...zoomStop, zoom: undefined }]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await screen.findByTestId("playback-spotlight-region-0");
    expect(stage().dataset.frozenFrame).toBe("false");
    expect(drawImage).not.toHaveBeenCalled();
  });

  it("falls back to zooming the live video when no frame is available", async () => {
    stubProperty(HTMLVideoElement.prototype, "videoWidth", { get: () => 0 });
    renderPlayback([zoomStop]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(stage().dataset.zoomActive).toBe("true"));
    expect(stage().dataset.frozenFrame).toBe("false");
    expect(video().style.visibility).toBe("visible");
  });
});

describe("Playback stop timing", () => {
  const video = () => screen.getByTestId("playback-video") as HTMLVideoElement;
  let seeks: number[];
  let pausedAt: number | null;
  let clock: () => number;

  beforeEach(() => {
    seeks = [];
    pausedAt = null;
    clock = () => 0;
    stubProperty(HTMLMediaElement.prototype, "paused", { get: () => pausedAt !== null });
    stubProperty(HTMLMediaElement.prototype, "playbackRate", { get: () => 1, set: () => {} });
    stubProperty(HTMLMediaElement.prototype, "currentTime", {
      get: () => pausedAt ?? clock(),
      set: (value: number) => seeks.push(value),
    });
    stubProperty(HTMLMediaElement.prototype, "pause", {
      value: vi.fn(() => {
        pausedAt ??= clock();
      }),
    });
  });

  // Media time follows the fake clock while playing; play() resumes from the paused time.
  function startFakeMediaClock() {
    vi.useFakeTimers();
    let base = 0;
    let startedAt = Date.now();
    clock = () => base + (Date.now() - startedAt) / 1000;
    playSpy.mockImplementation(() => {
      base = pausedAt ?? base;
      startedAt = Date.now();
      pausedAt = null;
      return Promise.resolve();
    });
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pauses on the stop between timeupdates without seeking back", async () => {
    renderPlayback([{ time: 0.3, zoom: { x: 50, y: 50, scale: 2, durationMs: 0 } }]);
    startFakeMediaClock();
    fireEvent(video(), new Event("playing"));

    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(pausedAt).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(pausedAt).toBeCloseTo(0.3, 5);
    expect(seeks).not.toContain(0.3);
    // The freeze holds before the zoom starts.
    expect(stage().dataset.zoomActive).toBe("false");
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(stage().dataset.zoomActive).toBe("true");
  });

  it("re-arms the stop timer after resuming so the next stop is also exact", async () => {
    renderPlayback([{ time: 0.3 }, { time: 0.6 }]);
    startFakeMediaClock();
    fireEvent(video(), new Event("playing"));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(pausedAt).toBeCloseTo(0.3, 5);

    fireEvent.click(window);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pausedAt).toBeNull();
    fireEvent(video(), new Event("playing"));

    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(pausedAt).toBeCloseTo(0.6, 5);
    expect(seeks).not.toContain(0.3);
    expect(seeks).not.toContain(0.6);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(2);
  });

  it("seeks back to the stop when a late timeupdate overshoots it", async () => {
    renderPlayback([{ time: 0.3 }]);
    clock = () => 0.5;
    fireEvent(video(), new Event("timeupdate"));
    await waitFor(() => expect(seeks).toContain(0.3));
  });
});

describe("Playback zoom", () => {
  it("parses zoom from the playback URL", () => {
    renderPlayback([zoomStop]);
    expect(screen.getByTestId("playback-video").dataset.pauseZooms).toBe("1");
    expect(stage().dataset.zoomActive).toBe("false");
    expect(stage().style.transform).toBe("matrix(1, 0, 0, 1, 0, 0)");
  });

  it("zooms in, then shows the spotlight on the zoomed frame, then zooms out and plays on resume", async () => {
    renderPlayback([zoomStop]);
    fireEvent.keyDown(window, { key: "ArrowRight" });

    await waitFor(() => expect(stage().dataset.zoomActive).toBe("true"));
    expect(stage().style.transform).toBe("matrix(2, 0, 0, 2, -800, -450)");
    expect(stage().style.transition).toContain("60ms");
    // Spotlight waits for the zoom-in to finish.
    expect(screen.queryByTestId("playback-spotlight-overlay")).toBeNull();

    const region = await screen.findByTestId("playback-spotlight-region-0");
    expect(region.style.left).toBe("480px");
    expect(region.style.width).toBe("640px");
    expect(screen.getByTestId("playback-spotlight-outside-blur").style.width).toBe(`${VIEW_WIDTH}px`);

    playSpy.mockClear();
    fireEvent.click(window);
    await waitFor(() => expect(stage().dataset.zoomActive).toBe("false"));
    expect(screen.queryByTestId("playback-spotlight-overlay")).toBeNull();
    // Play only after the zoom-out completes.
    expect(playSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(1));
    expect(stage().style.transform).toBe("matrix(1, 0, 0, 1, 0, 0)");
  });

  it("resuming during the zoom-in skips the spotlight and zooms back out", async () => {
    renderPlayback([{ ...zoomStop, zoom: { ...zoomStop.zoom!, durationMs: 300 } }]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(stage().dataset.zoomActive).toBe("true"));
    await waitFor(() => expect(screen.getByTestId("playback-container").dataset.waitingForResume).toBe("true"));

    fireEvent.click(window);
    await waitFor(() => expect(stage().dataset.zoomActive).toBe("false"));
    await waitFor(() => expect(playSpy).toHaveBeenCalled());
    expect(screen.queryByTestId("playback-spotlight-overlay")).toBeNull();
  });

  it("navigating to another stop aborts the pending sequence and zooms out", async () => {
    renderPlayback([zoomStop]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await screen.findByTestId("playback-spotlight-region-0");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByTestId("playback-container").dataset.activeStopKind).toBe("end"));
    await waitFor(() => expect(stage().dataset.zoomActive).toBe("false"));
    expect(screen.queryByTestId("playback-spotlight-overlay")).toBeNull();
    // Still paused at the end stop; the aborted sequence must not resume playback.
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("navigating during a zoom-out snaps to identity instead of finishing the animation", async () => {
    const slow: PauseStop = { ...zoomStop, zoom: { ...zoomStop.zoom!, durationMs: 2000 } };
    renderPlayback([slow, { time: 5 }]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(stage().dataset.zoomActive).toBe("true"));
    fireEvent.click(window);
    await waitFor(() => expect(stage().dataset.zoomActive).toBe("false"));
    expect(stage().style.transition).toContain("2000ms");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(stage().style.transition).toBe("none");
    expect(stage().style.transform).toBe("matrix(1, 0, 0, 1, 0, 0)");
  });

  it("snaps to identity before seeking to the next zoomed stop, then zooms in fresh", async () => {
    const second: PauseStop = { time: 5, zoom: { x: 100, y: 100, scale: 4, durationMs: 60 } };
    renderPlayback([zoomStop, second]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await screen.findByTestId("playback-spotlight-region-0");
    expect(stage().dataset.zoomScale).toBe("2");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    // Synchronously after navigation: back at identity with no animation.
    expect(stage().dataset.zoomActive).toBe("false");
    expect(stage().style.transition).toBe("none");
    expect(stage().style.transform).toBe("matrix(1, 0, 0, 1, 0, 0)");
    expect(screen.queryByTestId("playback-spotlight-overlay")).toBeNull();

    await waitFor(() => expect(stage().dataset.zoomScale).toBe("4"));
    expect(stage().style.transform).toBe(`matrix(4, 0, 0, 4, ${VIEW_WIDTH - 4 * VIEW_WIDTH}, ${VIEW_HEIGHT - 4 * VIEW_HEIGHT})`);
    expect(stage().style.transition).toContain("60ms");
  });

  it("waits for the stage transitionend rather than only a timer", async () => {
    renderPlayback([{ ...zoomStop, zoom: { ...zoomStop.zoom!, durationMs: 2000 } }]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(stage().dataset.zoomActive).toBe("true"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByTestId("playback-spotlight-overlay")).toBeNull();

    // Child transitions (bubbling) and other properties are ignored.
    const childEvent = new Event("transitionend", { bubbles: true });
    Object.defineProperty(childEvent, "propertyName", { value: "transform" });
    screen.getByTestId("playback-video").dispatchEvent(childEvent);
    const opacityEvent = new Event("transitionend");
    Object.defineProperty(opacityEvent, "propertyName", { value: "opacity" });
    stage().dispatchEvent(opacityEvent);
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByTestId("playback-spotlight-overlay")).toBeNull();

    const event = new Event("transitionend");
    Object.defineProperty(event, "propertyName", { value: "transform" });
    stage().dispatchEvent(event);
    await screen.findByTestId("playback-spotlight-region-0");
  });

  it("supports zoom-only moments without a spotlight", async () => {
    renderPlayback([{ time: 2, zoom: { x: 0, y: 0, scale: 3, durationMs: 0 } }]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(stage().dataset.zoomActive).toBe("true"));
    expect(stage().style.transform).toBe("matrix(3, 0, 0, 3, 0, 0)");
    expect(stage().style.transition).toBe("none");
    expect(screen.queryByTestId("playback-spotlight-overlay")).toBeNull();
  });

  it("skips the animation when reduced motion is preferred", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
    renderPlayback([zoomStop]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(stage().dataset.zoomActive).toBe("true"));
    expect(stage().dataset.zoomDurationMs).toBe("0");
    expect(stage().style.transition).toBe("none");
    await screen.findByTestId("playback-spotlight-region-0");
  });
});
