import { useEffect, useRef, useCallback, useState } from "react";
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

  const [videoSrc, setVideoSrc] = useState<string>("");
  const [videoReady, setVideoReady] = useState(false);

  // Resolve file path to a webview-loadable URL
  useEffect(() => {
    if (!file) return;
    import("@tauri-apps/api/core")
      .then((mod) => {
        if (mod?.isTauri?.()) {
          setVideoSrc(mod.convertFileSrc(file));
        } else {
          setVideoSrc(file);
        }
      })
      .catch(() => setVideoSrc(file));
  }, [file]);

  const closeWindow = useCallback(async () => {
    if (window.__TAURI_INTERNALS__) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("close_playback_window");
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    const startPlayback = () => {
      video.playbackRate = speed;
      video.currentTime = start;
    };

    const handleSeeked = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.play().catch(() => {});
    };

    const handlePlaying = () => {
      // Video is actively rendering frames — reveal it
      video.removeEventListener("playing", handlePlaying);
      setVideoReady(true);
    };

    const handleTimeUpdate = () => {
      if (end > 0 && video.currentTime >= end) {
        video.pause();
        video.currentTime = end;
        if (endBehavior !== "freeze") {
          closeWindow();
        }
      }
    };

    const handleEnded = () => {
      if (endBehavior !== "freeze") {
        closeWindow();
      }
    };

    video.addEventListener("loadeddata", startPlayback);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);

    if (video.readyState >= 2) {
      startPlayback();
    }

    return () => {
      video.removeEventListener("loadeddata", startPlayback);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [videoSrc, start, end, speed, endBehavior, closeWindow]);

  // Handle Escape key to close playback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeWindow();
      }
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
      style={{ position: "fixed", inset: 0, cursor: hideCursor ? "none" : "auto", backgroundColor }}
      data-testid="playback-container"
    >
      <video
        ref={videoRef}
        src={videoSrc || undefined}
        preload="auto"
        data-testid="playback-video"
        data-file={file}
        data-start={start}
        data-end={end}
        data-speed={speed}
        data-end-behavior={endBehavior}
        className="object-contain"
        style={{ width: "100%", height: "100%", cursor: "inherit", opacity: videoReady ? 1 : 0 }}
      />
    </div>
  );
}

export default Playback;
