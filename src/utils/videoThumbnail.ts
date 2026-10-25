export interface CaptureThumbnailOptions {
  /** Output width in pixels; height keeps the video's aspect ratio. */
  width?: number;
  timeoutMs?: number;
}

/** Seek point for the thumbnail frame: 1s in, or the midpoint of shorter clips. */
export function thumbnailSeekTime(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? Math.min(1, duration / 2) : 0;
}

function waitFor(video: HTMLVideoElement, event: "loadedmetadata" | "loadeddata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(event, onEvent);
      video.removeEventListener("error", onError);
    };
    const onEvent = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("Video could not be decoded")); };
    video.addEventListener(event, onEvent);
    video.addEventListener("error", onError);
  });
}

/**
 * Decode one frame of a video in the webview and return it as base64 JPEG
 * (no `data:` prefix). Replaces the FFmpeg thumbnail step.
 */
export async function captureVideoThumbnail(
  src: string,
  { width = 320, timeoutMs = 15000 }: CaptureThumbnailOptions = {},
): Promise<string> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out capturing video thumbnail")), timeoutMs);
  });

  const capture = async () => {
    const metadata = waitFor(video, "loadedmetadata");
    video.src = src;
    await metadata;

    const target = thumbnailSeekTime(video.duration);
    const frameReady = waitFor(video, target > 0 ? "seeked" : "loadeddata");
    if (target > 0) video.currentTime = target;
    await frameReady;

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Video has no visible frames");
    }
    const outWidth = Math.min(width, video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * outWidth));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context unavailable");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const prefix = "data:image/jpeg;base64,";
    if (!dataUrl.startsWith(prefix)) throw new Error("JPEG encoding unavailable");
    return dataUrl.slice(prefix.length);
  };

  try {
    const work = capture();
    work.catch(() => {}); // a late failure after timeout is irrelevant
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    video.removeAttribute("src");
    video.load();
  }
}
