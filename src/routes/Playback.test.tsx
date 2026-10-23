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
