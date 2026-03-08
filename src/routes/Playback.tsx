import { useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router";

function Playback() {
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);

  const file = searchParams.get("file") ?? "";
  const start = parseFloat(searchParams.get("start") ?? "0");
  const end = parseFloat(searchParams.get("end") ?? "0");
  const speed = parseFloat(searchParams.get("speed") ?? "1");
  const endBehavior = searchParams.get("endBehavior") ?? "close";
  const hideCursor = searchParams.get("hideCursor") !== "false";
  const backgroundColor = searchParams.get("bg") ?? "#000000";

  const closeWindow = useCallback(async () => {
    if (window.__TAURI_INTERNALS__) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("close_playback_window");
    }
  }, []);

  const showWindow = useCallback(async () => {
    if (window.__TAURI_INTERNALS__) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("show_playback_window");
    }
  }, []);

  // Single effect: resolve src, load, seek, play, show — zero React re-renders
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !file) return;

    let cancelled = false;

    (async () => {
      // 1. Resolve file path to asset URL — set src directly on the DOM element
      let src = file;
      try {
        const mod = await import("@tauri-apps/api/core");
        if (mod?.isTauri?.()) src = mod.convertFileSrc(file);
      } catch { /* use raw path */ }

      if (cancelled) return;
      video.src = src;

      // 2. Wait for enough data to seek
      await new Promise<void>((resolve) => {
        if (video.readyState >= 2) return resolve();
        video.addEventListener("loadeddata", () => resolve(), { once: true });
      });
      if (cancelled) return;

      // 3. Seek to start and wait
      video.playbackRate = speed;
      video.currentTime = start;
      await new Promise<void>((resolve) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
      });
      if (cancelled) return;

      // 4. Start playback and wait for decoder to be actively rendering
      video.play().catch(() => {});
      await new Promise<void>((resolve) => {
        video.addEventListener("playing", () => resolve(), { once: true });
      });
      if (cancelled) return;

      // 5. Reveal video (direct DOM mutation — no React re-render)
      video.style.opacity = "1";
      // Show the window (it was created hidden to avoid any flash)
      await showWindow();
    })();

    // Timeupdate for end-time clipping
    const handleTimeUpdate = () => {
      if (end > 0 && video.currentTime >= end) {
        video.pause();
        video.currentTime = end;
        if (endBehavior !== "freeze") closeWindow();
      }
    };
    const handleEnded = () => {
      if (endBehavior !== "freeze") closeWindow();
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);

    return () => {
      cancelled = true;
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [file, start, end, speed, endBehavior, closeWindow, showWindow]);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWindow();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeWindow]);

  if (!file) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white text-xl" data-testid="playback-error">
          No video file specified
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center"
      style={{
        position: "fixed", inset: 0,
        cursor: hideCursor ? "none" : "auto",
        backgroundColor,
        willChange: "contents",
      }}
      data-testid="playback-container"
    >
      <video
        ref={videoRef}
        preload="auto"
        data-testid="playback-video"
        data-file={file}
        data-start={start}
        data-end={end}
        data-speed={speed}
        data-end-behavior={endBehavior}
        className="object-contain"
        style={{
          width: "100%", height: "100%",
          cursor: "inherit",
          opacity: 0,
          willChange: "opacity",
        }}
      />
    </div>
  );
}

export default Playback;
