import { useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router";

function Playback() {
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);

  const file = searchParams.get("file") ?? "";
  const start = parseFloat(searchParams.get("start") ?? "0");
  const end = parseFloat(searchParams.get("end") ?? "0");
  const speed = parseFloat(searchParams.get("speed") ?? "1");

  const closeWindow = useCallback(async () => {
    // In Tauri, invoke close_playback_window command
    if (window.__TAURI_INTERNALS__) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("close_playback_window");
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !file) return;

    video.playbackRate = speed;
    video.currentTime = start;

    const handleTimeUpdate = () => {
      if (end > 0 && video.currentTime >= end) {
        video.pause();
        closeWindow();
      }
    };

    const handleEnded = () => {
      closeWindow();
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);

    video.play().catch(() => {
      // Autoplay may be blocked in some environments
    });

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [file, start, end, speed, closeWindow]);

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
      className="min-h-screen bg-black flex items-center justify-center"
      data-testid="playback-container"
    >
      <video
        ref={videoRef}
        data-testid="playback-video"
        data-file={file}
        data-start={start}
        data-end={end}
        data-speed={speed}
        className="w-full h-full object-contain"
        style={{ maxWidth: "100vw", maxHeight: "100vh" }}
      >
        <source src={file} />
      </video>
    </div>
  );
}

export default Playback;
