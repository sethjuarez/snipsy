import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportedVideo } from "../types";

const backend = vi.hoisted(() => ({
  getImportedVideos: vi.fn(),
  saveVideoThumbnail: vi.fn(),
  selectVideoFile: vi.fn(),
  importVideo: vi.fn(),
  deleteVideo: vi.fn(),
}));
const capture = vi.hoisted(() => vi.fn());

vi.mock("../services", () => ({ getBackend: () => backend }));
vi.mock("../services/auditaur", () => ({
  isTauriRuntime: () => true,
  tauriFileSrc: (file: string) => `asset://${file}`,
}));
vi.mock("../utils/videoThumbnail", () => ({ captureVideoThumbnail: capture }));

const { default: VideoList } = await import("./VideoList");

const video = (name: string, thumbnailPath: string | null = null): ImportedVideo => ({
  name,
  relativePath: `videos/${name}`,
  absolutePath: `C:/p/videos/${name}`,
  thumbnailPath,
});

const renderList = () =>
  render(
    <VideoList projectPath="C:/p" videoSnippets={[]} onCreateClip={vi.fn()} onDeleteVideo={vi.fn()} />,
  );

beforeEach(() => {
  for (const fn of Object.values(backend)) fn.mockReset();
  capture.mockReset().mockResolvedValue("QUJD");
  backend.saveVideoThumbnail.mockImplementation(async (_p: string, rel: string) =>
    `C:/p/videos/thumbnails/${rel.slice(7, -4)}.jpg`);
});

afterEach(cleanup);

describe("VideoList thumbnails", () => {
  it("captures and saves thumbnails only for videos missing one", async () => {
    backend.getImportedVideos.mockResolvedValue([video("a.mp4"), video("b.mp4", "C:/p/videos/thumbnails/b.jpg")]);
    renderList();

    await waitFor(() => expect(screen.getByAltText("a.mp4").getAttribute("src")).toBe("asset://C:/p/videos/thumbnails/a.jpg"));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith("asset://C:/p/videos/a.mp4");
    expect(backend.saveVideoThumbnail).toHaveBeenCalledWith("C:/p", "videos/a.mp4", "QUJD");
  });

  it("processes videos one at a time and keeps going after a failure", async () => {
    backend.getImportedVideos.mockResolvedValue([video("a.mp4"), video("b.mp4")]);
    let active = 0;
    let maxActive = 0;
    capture.mockImplementation(async (src: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (src.includes("a.mp4")) throw new Error("decode failed");
      return "QUJD";
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderList();

    await waitFor(() => expect(screen.getByAltText("b.mp4")).toBeTruthy());
    expect(maxActive).toBe(1);
    expect(backend.saveVideoThumbnail).toHaveBeenCalledTimes(1);
    expect(screen.queryByAltText("a.mp4")).toBeNull();
  });

  it("does not save a capture after switching projects", async () => {
    backend.getImportedVideos.mockImplementation(async (project: string) =>
      project === "C:/p" ? [video("a.mp4")] : []);
    let finishCapture: (value: string) => void = () => {};
    capture.mockImplementation(() => new Promise<string>((resolve) => { finishCapture = resolve; }));
    const view = renderList();
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(1));

    view.rerender(
      <VideoList projectPath="C:/other" videoSnippets={[]} onCreateClip={vi.fn()} onDeleteVideo={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByTestId("no-videos")).toBeTruthy());
    finishCapture("QUJD");
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(backend.saveVideoThumbnail).not.toHaveBeenCalled();
  });

  it("ignores a slow video list from the previous project", async () => {
    let resolveFirst: (list: ImportedVideo[]) => void = () => {};
    backend.getImportedVideos
      .mockImplementationOnce(() => new Promise<ImportedVideo[]>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue([]);
    const view = renderList();
    view.rerender(
      <VideoList projectPath="C:/other" videoSnippets={[]} onCreateClip={vi.fn()} onDeleteVideo={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByTestId("no-videos")).toBeTruthy());

    resolveFirst([video("a.mp4")]);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.queryByText("a.mp4")).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });
});
