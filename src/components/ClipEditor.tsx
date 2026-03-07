import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Pause, Save, X, Keyboard, ChevronLeft, ChevronRight, Monitor, RefreshCw } from "lucide-react";
import { createBackendService } from "../services";
import type { EndBehavior, ImportedVideo, MonitorInfo, VideoSnippet } from "../types";

const backend = createBackendService();

// Hold-to-repeat: fires callback on mousedown, then repeats with acceleration.
// Uses a ref so the interval always calls the latest callback (avoids stale closures).
function useHoldRepeat(callback: () => void) {
  const cbRef = useRef(callback);
  cbRef.current = callback;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const start = useCallback(() => {
    stop();
    cbRef.current();
    // After 400ms delay, repeat every 80ms
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => cbRef.current(), 80);
    }, 400);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop };
}

// Convert local file path to a URL the webview can load (only in Tauri context)
let convertFileSrc: ((path: string) => string) | null = null;
import("@tauri-apps/api/core")
  .then((mod) => { if (mod?.isTauri?.()) convertFileSrc = mod.convertFileSrc; })
  .catch(() => {});

interface ClipEditorProps {
  video: ImportedVideo;
  existingClip?: VideoSnippet;
  onSave: (clip: Omit<VideoSnippet, "id">) => void;
  onCancel: () => void;
}

function formatTime(seconds: number, precise = false): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (precise) {
    const ms = Math.floor((seconds % 1) * 100);
    return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  }
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

function formatKeyCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CmdOrControl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  const code = e.code;
  if (!["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(code)) {
    if (code.startsWith("Digit")) {
      parts.push(code.slice(5));
    } else if (code.startsWith("Key")) {
      parts.push(code.slice(3));
    } else if (code.startsWith("Numpad")) {
      parts.push("num" + code.slice(6));
    } else {
      parts.push(code);
    }
  }

  return parts.join("+");
}

function ClipEditor({ video, existingClip, onSave, onCancel }: ClipEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(existingClip?.startTime ?? 0);
  const [endTime, setEndTime] = useState(existingClip?.endTime ?? 0);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const [activeHandle, setActiveHandle] = useState<"start" | "end">("start");
  const [frameDuration, setFrameDuration] = useState(1 / 30);
  const [targetDuration, setTargetDuration] = useState<string>("");

  // Derived: clip duration and computed speed
  const clipDuration = endTime - startTime;
  const targetSec = parseFloat(targetDuration);
  const computedSpeed = targetSec > 0 ? clipDuration / targetSec : 1;
  // Effective playback speed (target duration overrides 1× default)
  const effectiveSpeed = targetSec > 0 ? computedSpeed : 1;

  // Metadata fields
  const [title, setTitle] = useState(existingClip?.title ?? "");
  const [description, setDescription] = useState(existingClip?.description ?? "");
  const [hotkey, setHotkey] = useState(existingClip?.hotkey ?? "");
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [targetMonitor, setTargetMonitor] = useState(existingClip?.targetMonitor ?? "");
  const [endBehavior, setEndBehavior] = useState<EndBehavior>(existingClip?.endBehavior ?? "close");
  const [hideCursor, setHideCursor] = useState(existingClip?.hideCursor ?? true);
  const [monitorPreview, setMonitorPreview] = useState<string | null>(null);
  const [capturingPreview, setCapturingPreview] = useState(false);

  const videoSrc = video.absolutePath && convertFileSrc
    ? convertFileSrc(video.absolutePath)
    : video.absolutePath;

  // Load available monitors
  useEffect(() => {
    backend.listMonitors()
      .then((mons) => {
        setMonitors(mons);
        if (!targetMonitor && mons.length > 0) setTargetMonitor(mons[0].name);
      })
      .catch(() => {});
  }, []);

  const capturePreview = useCallback((name: string) => {
    setCapturingPreview(true);
    backend.captureMonitorPreview(name)
      .then((b64) => setMonitorPreview(`data:image/jpeg;base64,${b64}`))
      .catch(() => setMonitorPreview(null))
      .finally(() => setCapturingPreview(false));
  }, []);

  // Detect FPS for frame-stepping
  useEffect(() => {
    if (video.absolutePath) {
      backend.getVideoFps(video.absolutePath)
        .then((fps) => { if (fps > 0) setFrameDuration(1 / fps); })
        .catch(() => {});
    }
  }, [video.absolutePath]);

  // Pre-compute target duration from existing clip speed
  useEffect(() => {
    if (existingClip && existingClip.speed !== 1) {
      const dur = existingClip.endTime - existingClip.startTime;
      setTargetDuration(Math.round(dur / existingClip.speed).toString());
    }
  }, [existingClip]);

  // Video event handlers
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onMeta = () => {
      setDuration(vid.duration);
      // Only default endTime to full duration for new clips
      if (!existingClip) setEndTime(vid.duration);
      // Seek to start of existing clip so it's visible
      if (existingClip) vid.currentTime = existingClip.startTime;
    };
    const onTime = () => {
      setCurrentTime(vid.currentTime);
      if (vid.currentTime >= endTime) {
        vid.pause();
        setPlaying(false);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    vid.addEventListener("loadedmetadata", onMeta);
    vid.addEventListener("timeupdate", onTime);
    vid.addEventListener("play", onPlay);
    vid.addEventListener("pause", onPause);
    return () => {
      vid.removeEventListener("loadedmetadata", onMeta);
      vid.removeEventListener("timeupdate", onTime);
      vid.removeEventListener("play", onPlay);
      vid.removeEventListener("pause", onPause);
    };
  }, [endTime]);

  // Timeline drag handlers
  const getTimeFromMouseEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const bar = timelineRef.current;
    if (!bar || duration <= 0) return null;
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return (x / rect.width) * duration;
  }, [duration]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const t = getTimeFromMouseEvent(e);
      if (t === null) return;
      if (dragging === "start") {
        const clamped = Math.min(t, endTime - 0.1);
        setStartTime(Math.max(0, clamped));
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, clamped);
      } else {
        const clamped = Math.max(t, startTime + 0.1);
        const val = Math.min(duration, clamped);
        setEndTime(val);
        if (videoRef.current) videoRef.current.currentTime = val;
      }
    };
    const onUp = () => setDragging(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, startTime, endTime, duration, getTimeFromMouseEvent]);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    const t = getTimeFromMouseEvent(e);
    if (t === null) return;
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  }, [getTimeFromMouseEvent]);

  const nudgeHandle = (handle: "start" | "end", direction: 1 | -1) => {
    const vid = videoRef.current;
    if (!vid || duration <= 0) return;
    // Pause so the seeked frame is visible
    if (!vid.paused) {
      vid.pause();
      setPlaying(false);
    }
    const step = frameDuration * direction;
    if (handle === "start") {
      const val = Math.max(0, Math.min(startTime + step, endTime - frameDuration));
      setStartTime(val);
      vid.currentTime = val;
      setCurrentTime(val);
    } else {
      const val = Math.min(duration, Math.max(endTime + step, startTime + frameDuration));
      setEndTime(val);
      vid.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handleTimelineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      nudgeHandle(activeHandle, -1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nudgeHandle(activeHandle, 1);
    }
  };

  // Hold-to-repeat bindings for each frame-step button
  const holdStartBack = useHoldRepeat(() => { setActiveHandle("start"); nudgeHandle("start", -1); });
  const holdStartFwd  = useHoldRepeat(() => { setActiveHandle("start"); nudgeHandle("start", 1); });
  const holdEndBack   = useHoldRepeat(() => { setActiveHandle("end"); nudgeHandle("end", -1); });
  const holdEndFwd    = useHoldRepeat(() => { setActiveHandle("end"); nudgeHandle("end", 1); });

  const handlePreview = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (playing) {
      vid.pause();
    } else {
      vid.currentTime = startTime;
      vid.playbackRate = effectiveSpeed;
      vid.play();
    }
  }, [playing, startTime, effectiveSpeed]);

  const handleHotkeyCapture = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const combo = formatKeyCombo(e.nativeEvent as KeyboardEvent);
    if (combo.includes("+") && !combo.endsWith("+")) {
      setHotkey(combo);
      setCapturingHotkey(false);
    }
  };

  const handleSave = () => {
    if (!title.trim() || !hotkey) return;
    onSave({
      title: title.trim(),
      description: description.trim(),
      videoFile: video.relativePath,
      startTime,
      endTime,
      speed: effectiveSpeed,
      hotkey,
      targetMonitor: targetMonitor || undefined,
      endBehavior,
      hideCursor,
    });
  };

  const canSave = title.trim() && hotkey && endTime > startTime;

  const selectionLeft = duration > 0 ? (startTime / duration) * 100 : 0;
  const selectionWidth = duration > 0 ? ((endTime - startTime) / duration) * 100 : 100;
  const playheadPos = duration > 0 ? (currentTime / duration) * 100 : 0;
  const handleW = 8;

  return (
    <div className="flex flex-col h-full" data-testid="clip-editor">
      {/* Video — fills all available space */}
      <div className="flex-1 min-h-0 rounded-lg overflow-hidden" style={{ backgroundColor: "transparent" }}>
        <video
          ref={videoRef}
          src={videoSrc}
          preload="auto"
          className="w-full h-full object-contain"
          data-testid="clip-editor-video"
        />
      </div>

      {/* Controls below video */}
      <div className="shrink-0 mt-3 space-y-2.5">
        {/* Timeline with frame-step buttons */}
        <div className="flex items-center gap-1.5">
          {/* Start frame-step buttons */}
          <button
            {...holdStartBack}
            className="shrink-0 w-6 h-7 flex items-center justify-center rounded"
            style={{ color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
            title="Start − 1 frame"
            data-testid="frame-back-start"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            {...holdStartFwd}
            className="shrink-0 w-6 h-7 flex items-center justify-center rounded"
            style={{ color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
            title="Start + 1 frame"
            data-testid="frame-fwd-start"
          >
            <ChevronRight size={12} />
          </button>

          {/* Timeline bar */}
          <div
            ref={timelineRef}
            tabIndex={0}
            className="relative flex-1 h-7 rounded cursor-pointer select-none outline-none"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
            onClick={handleTimelineClick}
            onKeyDown={handleTimelineKeyDown}
          >
          {/* Selection region */}
          <div
            className="absolute top-0 bottom-0 rounded"
            style={{
              left: `${selectionLeft}%`,
              width: `${selectionWidth}%`,
              backgroundColor: "var(--color-accent)",
              opacity: 0.25,
            }}
          />
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5"
            style={{ left: `${playheadPos}%`, backgroundColor: "var(--color-danger, #ef4444)" }}
          />
          {/* Start handle */}
          <div
            className="absolute top-0 bottom-0 rounded-l cursor-col-resize z-10"
            style={{
              left: `calc(${selectionLeft}% - ${handleW / 2}px)`,
              width: handleW,
              backgroundColor: "var(--color-accent)",
              opacity: dragging === "start" ? 1 : 0.7,
            }}
            onMouseDown={(e) => { e.stopPropagation(); setActiveHandle("start"); setDragging("start"); }}
            data-testid="clip-start"
          />
          {/* End handle */}
          <div
            className="absolute top-0 bottom-0 rounded-r cursor-col-resize z-10"
            style={{
              left: `calc(${selectionLeft + selectionWidth}% - ${handleW / 2}px)`,
              width: handleW,
              backgroundColor: "var(--color-accent)",
              opacity: dragging === "end" ? 1 : 0.7,
            }}
            onMouseDown={(e) => { e.stopPropagation(); setActiveHandle("end"); setDragging("end"); }}
            data-testid="clip-end"
          />
          {/* Time labels on the bar */}
          <span
            className="absolute text-[9px] font-mono pointer-events-none"
            style={{ left: 4, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }}
          >
            {formatTime(startTime, true)}
          </span>
          <span
            className="absolute text-[9px] font-mono pointer-events-none"
            style={{ right: 4, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }}
          >
            {formatTime(endTime, true)}
          </span>
          </div>

          {/* End frame-step buttons */}
          <button
            {...holdEndBack}
            className="shrink-0 w-6 h-7 flex items-center justify-center rounded"
            style={{ color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
            title="End − 1 frame"
            data-testid="frame-back-end"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            {...holdEndFwd}
            className="shrink-0 w-6 h-7 flex items-center justify-center rounded"
            style={{ color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
            title="End + 1 frame"
            data-testid="frame-fwd-end"
          >
            <ChevronRight size={12} />
          </button>
        </div>

        {/* Row 1: Clip duration + target playback time + Preview */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] shrink-0" style={{ color: "var(--color-text-secondary)" }}>
            Clip: {formatTime(clipDuration)}
          </span>
          <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>→</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>Play in</span>
            <input
              type="text"
              value={targetDuration}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, "");
                setTargetDuration(val);
              }}
              placeholder={`${Math.round(clipDuration)}s`}
              className="w-14 px-1.5 py-0.5 rounded text-[11px] text-center font-mono"
              style={{
                backgroundColor: "var(--color-surface-inset)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              data-testid="target-duration"
            />
            <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>s</span>
            {targetSec > 0 && (
              <span className="text-[10px] font-mono" style={{ color: "var(--color-text-secondary)" }}>
                ({computedSpeed.toFixed(1)}×)
              </span>
            )}
          </div>
          <div className="flex-1" />
          <button
            onClick={handlePreview}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-medium"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            data-testid="clip-preview"
          >
            {playing ? <Pause size={11} /> : <Play size={11} />}
            {playing ? "Pause" : "Preview"}
          </button>
        </div>

        {/* Row 2: Title + Description + Hotkey inline */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title *"
            className="min-w-0 px-2.5 py-1.5 rounded text-[12px]"
            style={{
              width: "25%",
              backgroundColor: "var(--color-surface-inset)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
            data-testid="clip-title"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded text-[12px]"
            style={{
              backgroundColor: "var(--color-surface-inset)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
            data-testid="clip-description"
          />
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <Keyboard size={12} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
            <input
              type="text"
              value={capturingHotkey ? "Press a key combo..." : hotkey}
              readOnly
              onFocus={() => setCapturingHotkey(true)}
              onBlur={() => setCapturingHotkey(false)}
              onKeyDown={handleHotkeyCapture}
              placeholder="Click to capture hotkey"
              className="w-full px-2 py-1.5 rounded font-mono text-[12px]"
              style={capturingHotkey
                ? { backgroundColor: "var(--color-surface-inset)", border: "2px solid var(--color-accent)", color: "var(--color-text)" }
                : { backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: hotkey ? "var(--color-text)" : "var(--color-text-secondary)" }}
              data-testid="clip-hotkey"
            />
          </div>
        </div>

        {/* Row 3: Monitor selector + Save / Cancel */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onCancel}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-medium"
            style={{ color: "var(--color-text-secondary)" }}
            data-testid="clip-cancel"
          >
            <X size={12} /> Cancel
          </button>
          {monitors.length > 0 && (
            <div className="flex items-center gap-1.5">
              {monitorPreview && (
                <img
                  src={monitorPreview}
                  alt="Monitor preview"
                  className="h-7 rounded border"
                  style={{ borderColor: "var(--color-border)" }}
                  data-testid="monitor-preview"
                />
              )}
              <Monitor size={12} style={{ color: "var(--color-text-secondary)" }} />
              <select
                value={targetMonitor}
                onChange={(e) => {
                  setTargetMonitor(e.target.value);
                  setMonitorPreview(null);
                }}
                className="px-2 py-1 rounded text-[11px]"
                style={{
                  backgroundColor: "var(--color-surface-inset)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
                data-testid="clip-monitor"
              >
                {monitors.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.width}×{m.height})
                  </option>
                ))}
              </select>
              <button
                onClick={() => capturePreview(targetMonitor)}
                disabled={capturingPreview}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded"
                style={{
                  color: "var(--color-text-secondary)",
                  backgroundColor: "var(--color-surface-inset)",
                  border: "1px solid var(--color-border)",
                }}
                title="Capture monitor preview"
                data-testid="monitor-refresh"
              >
                <RefreshCw size={11} className={capturingPreview ? "animate-spin" : ""} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>When done:</span>
            <select
              value={endBehavior}
              onChange={(e) => setEndBehavior(e.target.value as EndBehavior)}
              className="px-2 py-1 rounded text-[11px]"
              style={{
                backgroundColor: "var(--color-surface-inset)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              data-testid="clip-end-behavior"
            >
              <option value="close">Close window</option>
              <option value="freeze">Freeze last frame</option>
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: "var(--color-text-secondary)" }}>
            <input
              type="checkbox"
              checked={hideCursor}
              onChange={(e) => setHideCursor(e.target.checked)}
              className="accent-[var(--color-accent)]"
              data-testid="clip-hide-cursor"
            />
            Hide cursor
          </label>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-[11px] font-medium disabled:opacity-50"
            style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
            data-testid="clip-save"
          >
            <Save size={12} /> Save Clip
          </button>
        </div>
      </div>
    </div>
  );
}

export default ClipEditor;
