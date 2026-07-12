import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import SpotlightOverlay from "../components/SpotlightOverlay";
import { auditaurInvoke, isTauriRuntime, tauriFileSrc } from "../services/auditaur";
import type { PauseSpotlight, PauseStop } from "../types";
import { STOP_EPSILON, getVideoContentBox, normalizePauseStops } from "../utils/spotlight";

type PlaybackNavigationStop =
  | { kind: "start"; time: number }
  | { kind: "pause"; time: number; pauseStop: PauseStop }
  | { kind: "end"; time: number };

const SEEK_PRESENTATION_TIMEOUT_MS = 500;

function parsePauseStops(raw: string | null): PauseStop[] {
  if (!raw) return [];

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item): item is PauseStop => (
      typeof item === "object" &&
      item !== null &&
      typeof (item as PauseStop).time === "number" &&
      Number.isFinite((item as PauseStop).time)
    ))
    .map((item) => ({
      time: item.time,
      label: typeof item.label === "string" ? item.label : undefined,
      spotlight: item.spotlight,
    }));
}

function buildPlaybackNavigationStops(
  pauseStops: PauseStop[],
  start: number,
  end: number,
): PlaybackNavigationStop[] {
  const stops: PlaybackNavigationStop[] = [{ kind: "start", time: start }];
  stops.push(...pauseStops.map((pauseStop) => ({
    kind: "pause" as const,
    time: pauseStop.time,
    pauseStop,
  })));
  if (end > start) stops.push({ kind: "end", time: end });
  return stops;
}

function isSamePlaybackStop(a: PlaybackNavigationStop, b: PlaybackNavigationStop) {
  return a.kind === b.kind && Math.abs(a.time - b.time) <= STOP_EPSILON;
}

function getAdjacentPlaybackStop(
  stops: PlaybackNavigationStop[],
  currentTime: number,
  direction: -1 | 1,
  activeStop: PlaybackNavigationStop | null,
) {
  if (stops.length === 0) return null;

  const activeIndex = activeStop
    ? stops.findIndex((stop) => isSamePlaybackStop(stop, activeStop))
    : -1;
  if (activeIndex >= 0) {
    return stops[Math.max(0, Math.min(stops.length - 1, activeIndex + direction))] ?? null;
  }

  if (direction > 0) {
    return stops.find((stop) => stop.time > currentTime + STOP_EPSILON) ?? stops[stops.length - 1];
  }

  for (let index = stops.length - 1; index >= 0; index -= 1) {
    if (stops[index].time < currentTime - STOP_EPSILON) return stops[index];
  }
  return stops[0];
}

function getNextPauseStopIndexAfter(pauseStops: PauseStop[], time: number) {
  const index = pauseStops.findIndex((stop) => stop.time > time + STOP_EPSILON);
  return index === -1 ? pauseStops.length : index;
}

function waitForPresentedSeekFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const resolveAfterPaint = () => {
      requestAnimationFrame(() => {
        if ("requestVideoFrameCallback" in video) {
          const videoWithFrameCallback = video as HTMLVideoElement & {
            requestVideoFrameCallback: (callback: () => void) => number;
          };
          const frameTimeout = setTimeout(resolve, SEEK_PRESENTATION_TIMEOUT_MS);
          videoWithFrameCallback.requestVideoFrameCallback(() => {
            clearTimeout(frameTimeout);
            resolve();
          });
        } else {
          resolve();
        }
      });
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      video.removeEventListener("seeked", finish);
      resolveAfterPaint();
    };

    video.addEventListener("seeked", finish, { once: true });
    timeoutId = setTimeout(finish, SEEK_PRESENTATION_TIMEOUT_MS);
    if (!video.seeking) finish();
  });
}

function Playback() {
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const nextStopIndexRef = useRef(0);
  const resumingRef = useRef(false);
  const waitCleanupRef = useRef<(() => void) | null>(null);
  const resumePromiseRef = useRef<Promise<void> | null>(null);
  const seekVersionRef = useRef(0);
  const [waitingForResume, setWaitingForResume] = useState(false);
  const [activeSpotlight, setActiveSpotlight] = useState<{ spotlight: PauseSpotlight; label?: string } | null>(null);
  const [activePlaybackStop, setActivePlaybackStop] = useState<PlaybackNavigationStop | null>(null);

  const file = searchParams.get("file") ?? "";
  const start = parseFloat(searchParams.get("start") ?? "0");
  const end = parseFloat(searchParams.get("end") ?? "0");
  const speed = parseFloat(searchParams.get("speed") ?? "1");
  const endBehavior = searchParams.get("endBehavior") ?? "close";
  const hideCursor = searchParams.get("hideCursor") !== "false";
  const backgroundColor = searchParams.get("bg") ?? "#000000";
  const clickToPlay = searchParams.get("clickToPlay") === "true";
  const muted = searchParams.get("muted") !== "false";
  const pauseStops = useMemo(() => {
    try {
      return normalizePauseStops(parsePauseStops(searchParams.get("pauseStops")), start, end);
    } catch (error) {
      console.error("Failed to parse pause stops:", error);
      return [];
    }
  }, [searchParams, start, end]);
  const navigationStops = useMemo(
    () => buildPlaybackNavigationStops(pauseStops, start, end),
    [pauseStops, start, end],
  );

  const closeWindow = useCallback(async () => {
    if (isTauriRuntime()) {
      await auditaurInvoke("close_playback_window");
    }
  }, []);

  const showWindow = useCallback(async () => {
    if (isTauriRuntime()) {
      await auditaurInvoke("show_playback_window");
    }
  }, []);

  const waitForResume = useCallback(() => {
    if (resumePromiseRef.current) return resumePromiseRef.current;

    setWaitingForResume(true);
    const promise = new Promise<void>((resolve) => {
      const finish = () => {
        waitCleanupRef.current?.();
        resolve();
      };
      const onClick = () => finish();
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.code === "Space" || event.key === " ") {
          event.preventDefault();
          finish();
        }
      };

      waitCleanupRef.current = () => {
        window.removeEventListener("click", onClick);
        window.removeEventListener("keydown", onKeyDown);
        waitCleanupRef.current = null;
        resumePromiseRef.current = null;
        setWaitingForResume(false);
      };

      window.addEventListener("click", onClick);
      window.addEventListener("keydown", onKeyDown);
    });
    resumePromiseRef.current = promise;
    return promise;
  }, []);

  const activatePlaybackStop = useCallback(async (stop: PlaybackNavigationStop) => {
    const video = videoRef.current;
    if (!video) return;

    const seekVersion = seekVersionRef.current + 1;
    seekVersionRef.current = seekVersion;
    video.pause();
    video.currentTime = stop.time;
    nextStopIndexRef.current = getNextPauseStopIndexAfter(pauseStops, stop.time);
    resumingRef.current = true;
    setActivePlaybackStop(stop);
    setActiveSpotlight(null);

    await waitForPresentedSeekFrame(video);
    if (seekVersionRef.current !== seekVersion) return;

    setActiveSpotlight(
      stop.kind === "pause" && stop.pauseStop.spotlight
        ? { spotlight: stop.pauseStop.spotlight, label: stop.pauseStop.label }
        : null,
    );

    waitForResume().then(() => {
      if (seekVersionRef.current !== seekVersion) return;
      setActivePlaybackStop(null);
      setActiveSpotlight(null);
      resumingRef.current = false;
      video.play().catch(() => {});
    });
  }, [pauseStops, waitForResume]);

  // Single effect: resolve src, load, seek, (optionally wait for click), play, show
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !file) return;

    let cancelled = false;
    nextStopIndexRef.current = 0;
    resumingRef.current = false;
    setActivePlaybackStop(null);
    setActiveSpotlight(null);

    (async () => {
      // 1. Resolve file path to asset URL
      let src = file;
      if (isTauriRuntime()) {
        src = tauriFileSrc(file);
      }

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

        await showWindow();

        // Wait for a click or Space anywhere on the window to start playback.
        await waitForResume();
        if (cancelled) return;

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
      const nextStop = pauseStops[nextStopIndexRef.current];
      if (nextStop && !resumingRef.current && video.currentTime >= nextStop.time - STOP_EPSILON) {
        activatePlaybackStop({ kind: "pause", time: nextStop.time, pauseStop: nextStop });
        return;
      }

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
      waitCleanupRef.current?.();
      setActivePlaybackStop(null);
      setActiveSpotlight(null);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [file, start, end, speed, endBehavior, clickToPlay, muted, pauseStops, activatePlaybackStop, closeWindow, showWindow, waitForResume]);

  // Escape closes playback; arrows jump between clip start, pause stops, and clip end.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeWindow();
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      const video = videoRef.current;
      if (!video || navigationStops.length === 0) return;

      const targetStop = getAdjacentPlaybackStop(
        navigationStops,
        video.currentTime,
        e.key === "ArrowLeft" ? -1 : 1,
        activePlaybackStop,
      );
      if (!targetStop) return;
      if (activePlaybackStop && isSamePlaybackStop(activePlaybackStop, targetStop)) return;

      e.preventDefault();
      activatePlaybackStop(targetStop);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activatePlaybackStop, activePlaybackStop, closeWindow, navigationStops]);

  if (!file) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white text-xl" data-testid="playback-error">
          No video file specified
        </p>
      </div>
    );
  }

  const spotlightContentBox = activeSpotlight && videoRef.current
    ? getVideoContentBox(videoRef.current)
    : null;
  const pauseSpotlightRegionCount = pauseStops.reduce(
    (count, stop) => count + (stop.spotlight?.regions.length ?? 0),
    0,
  );

  return (
    <div
      className="flex items-center justify-center"
      style={{
        position: "fixed", inset: 0,
        cursor: waitingForResume ? "pointer" : hideCursor ? "none" : "auto",
        backgroundColor,
      }}
      data-testid="playback-container"
      data-waiting-for-resume={waitingForResume}
      data-active-stop-kind={activePlaybackStop?.kind ?? "none"}
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
        data-pause-stops={pauseStops.length}
        data-pause-spotlight-regions={pauseSpotlightRegionCount}
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
      {activeSpotlight && spotlightContentBox && (
        <SpotlightOverlay
          spotlight={activeSpotlight.spotlight}
          contentBox={spotlightContentBox}
          label={activeSpotlight.label}
          testIdPrefix="playback-spotlight"
        />
      )}
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
