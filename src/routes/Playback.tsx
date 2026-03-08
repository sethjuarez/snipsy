import { useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router";

function Playback() {
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const file = searchParams.get("file") ?? "";
  const start = parseFloat(searchParams.get("start") ?? "0");
  const end = parseFloat(searchParams.get("end") ?? "0");
  const speed = parseFloat(searchParams.get("speed") ?? "1");
  const endBehavior = searchParams.get("endBehavior") ?? "close";
  const hideCursor = searchParams.get("hideCursor") !== "false";
  const backgroundColor = searchParams.get("bg") ?? "#000000";
  const clickToPlay = searchParams.get("clickToPlay") === "true";
  const muted = searchParams.get("muted") !== "false";

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

  // Single effect: resolve src, load, seek, (optionally wait for click), play, show
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !file) return;

    let cancelled = false;

    (async () => {
      // 1. Resolve file path to asset URL
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
      video.muted = muted;
      video.currentTime = start;
      await new Promise<void>((resolve) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
      });
      if (cancelled) return;

      if (clickToPlay) {
        // Show the window with the first frame frozen, cursor visible for clicking.
        // Remove the compositor-guard overlay so the user sees the still frame.
        if (overlayRef.current) overlayRef.current.style.display = "none";

        const container = video.parentElement;
        if (container) container.style.cursor = "pointer";
        await showWindow();

        // Wait for a click anywhere on the window to start playback
        await new Promise<void>((resolve) => {
          if (cancelled) return resolve();
          const onClick = () => {
            window.removeEventListener("click", onClick);
            resolve();
          };
          window.addEventListener("click", onClick);
        });
        if (cancelled) return;

        // Restore cursor setting after click
        if (container) container.style.cursor = hideCursor ? "none" : "auto";

        // 4. Start playback — no overlay needed; compositor has settled
        // during the click-wait interval.
        video.play().catch(() => {});
      } else {
        // Auto-play: the compositor-guard overlay is still visible (same
        // color as the letterbox bars) so any brief compositor
        // reconfiguration when play() activates the hardware decoder is
        // hidden behind it.
        await showWindow();
        if (cancelled) return;

        // 4. Start playback behind the overlay
        video.play().catch(() => {});

        // Wait until the decoder has produced and composited at least one
        // frame, then remove the overlay.  requestVideoFrameCallback fires
        // after decode; the extra requestAnimationFrame ensures the
        // compositor has flushed the frame to screen.
        await new Promise<void>((resolve) => {
          if ("requestVideoFrameCallback" in video) {
            (video as unknown as HTMLVideoElement & {
              requestVideoFrameCallback: (cb: () => void) => void;
            }).requestVideoFrameCallback(() => {
              requestAnimationFrame(() => resolve());
            });
          } else {
            // Fallback for engines without requestVideoFrameCallback
            setTimeout(resolve, 100);
          }
        });
        if (cancelled) return;
        if (overlayRef.current) overlayRef.current.style.display = "none";
      }
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
  }, [file, start, end, speed, endBehavior, hideCursor, clickToPlay, muted, closeWindow, showWindow]);

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
        data-click-to-play={clickToPlay}
        data-muted={muted}
        className="object-contain"
        style={{
          width: "100%", height: "100%",
          cursor: "inherit",
          backgroundColor,
          // Force the video into a regular compositing layer instead of a
          // hardware video overlay. Without this, the browser may punch a
          // transparent hole through the letterbox bars when play() activates
          // the hardware decoder.
          transform: "translateZ(0)",
        }}
      />
      {/* Compositor-guard overlay: a solid div the same color as the
          letterbox bars. It sits above the video so any brief compositor
          reconfiguration during play() start is invisible.  Removed via ref
          once the decoder has produced its first frame. */}
      <div
        ref={overlayRef}
        data-testid="playback-overlay"
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor,
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
    </div>
  );
}

export default Playback;
