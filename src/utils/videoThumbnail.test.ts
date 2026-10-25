import { afterEach, describe, expect, it, vi } from "vitest";
import { captureVideoThumbnail, thumbnailSeekTime } from "./videoThumbnail";

class FakeVideo extends EventTarget {
  crossOrigin = "";
  muted = false;
  preload = "";
  playsInline = false;
  duration = 10;
  videoWidth = 1920;
  videoHeight = 1080;
  seekedTo: number | null = null;
  loaded = 0;
  private _src = "";

  constructor(private behavior: "ok" | "error" | "hang" = "ok") {
    super();
  }
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => {
      if (this.behavior === "error") this.dispatchEvent(new Event("error"));
      else if (this.behavior === "ok") this.dispatchEvent(new Event("loadedmetadata"));
    });
  }
  get src() {
    return this._src;
  }
  set currentTime(value: number) {
    this.seekedTo = value;
    queueMicrotask(() => this.dispatchEvent(new Event("seeked")));
  }
  removeAttribute() {}
  load() {
    this.loaded += 1;
  }
}

function stubDom(video: FakeVideo, dataUrl = "data:image/jpeg;base64,QUJD") {
  const context = { drawImage: vi.fn() };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toDataURL: vi.fn(() => dataUrl) };
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag === "video") return video;
    if (tag === "canvas") return canvas;
    return original(tag);
  }) as typeof document.createElement);
  return { canvas, context };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("thumbnailSeekTime", () => {
  it("uses 1s, the midpoint of short clips, or 0 when unknown", () => {
    expect(thumbnailSeekTime(10)).toBe(1);
    expect(thumbnailSeekTime(1)).toBe(0.5);
    expect(thumbnailSeekTime(Number.NaN)).toBe(0);
    expect(thumbnailSeekTime(Infinity)).toBe(0);
  });
});

describe("captureVideoThumbnail", () => {
  it("seeks, draws a scaled frame, and returns base64 JPEG", async () => {
    const video = new FakeVideo();
    const { canvas, context } = stubDom(video);

    const result = await captureVideoThumbnail("asset://video.mp4");

    expect(result).toBe("QUJD");
    expect(video.crossOrigin).toBe("anonymous");
    expect(video.muted).toBe(true);
    expect(video.src).toBe("asset://video.mp4");
    expect(video.seekedTo).toBe(1);
    expect([canvas.width, canvas.height]).toEqual([320, 180]);
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, 320, 180);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.8);
    expect(video.loaded).toBe(1);
  });

  it("rejects when the video cannot be decoded", async () => {
    stubDom(new FakeVideo("error"));
    await expect(captureVideoThumbnail("bad.mp4")).rejects.toThrow("could not be decoded");
  });

  it("rejects when the browser cannot encode JPEG", async () => {
    stubDom(new FakeVideo(), "data:,");
    await expect(captureVideoThumbnail("v.mp4")).rejects.toThrow("JPEG");
  });

  it("times out when the video never loads", async () => {
    vi.useFakeTimers();
    stubDom(new FakeVideo("hang"));
    const pending = captureVideoThumbnail("slow.mp4", { timeoutMs: 50 });
    const assertion = expect(pending).rejects.toThrow("Timed out");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});
