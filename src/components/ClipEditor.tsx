import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Pause, Save, X, Keyboard } from "lucide-react";
import type { ImportedVideo, VideoSnippet } from "../types";

// Convert local file path to a URL the webview can load (only in Tauri context)
let convertFileSrc: ((path: string) => string) | null = null;
import("@tauri-apps/api/core")
  .then((mod) => { if (mod?.isTauri?.()) convertFileSrc = mod.convertFileSrc; })
  .catch(() => {});

interface ClipEditorProps {
  video: ImportedVideo;
  onSave: (clip: Omit<VideoSnippet, "id">) => void;
  onCancel: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

function formatKeyCombo(e: React.KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CmdOrControl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  const code = e.code;
  if (["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(code)) {
    return parts.join("+");
  }

  let key = code;
  if (code.startsWith("Digit")) key = code.slice(5);
  else if (code.startsWith("Key")) key = code.slice(3);
  else if (code.startsWith("Numpad")) key = "num" + code.slice(6);
  parts.push(key);
  return parts.join("+");
}

function ClipEditor({ video, onSave, onCancel }: ClipEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  // Metadata fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hotkey, setHotkey] = useState("");
  const [capturingHotkey, setCapturingHotkey] = useState(false);

  const videoSrc = video.absolutePath && convertFileSrc
    ? convertFileSrc(video.absolutePath)
    : video.absolutePath;

  // Video event handlers
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onMeta = () => {
      setDuration(vid.duration);
      setEndTime(vid.duration);
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
        setEndTime(Math.min(duration, clamped));
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
    // Click on the timeline scrubs the playhead
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  }, [getTimeFromMouseEvent]);

  const handlePreview = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (playing) {
      vid.pause();
    } else {
      vid.currentTime = startTime;
      vid.playbackRate = speed;
      vid.play();
    }
  }, [playing, startTime, speed]);

  const handleHotkeyCapture = (e: React.KeyboardEvent) => {
    e.preventDefault();
    const combo = formatKeyCombo(e);
    if (combo) {
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
      speed,
      hotkey,
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
      <div className="flex-1 min-h-0 rounded-lg overflow-hidden" style={{ backgroundColor: "#000" }}>
        <video
          ref={videoRef}
          src={videoSrc}
          className="w-full h-full object-contain"
          data-testid="clip-editor-video"
        />
      </div>

      {/* Controls below video */}
      <div className="shrink-0 mt-3 space-y-2.5">
        {/* Timeline bar with inline start/end handles */}
        <div
          ref={timelineRef}
          className="relative h-7 rounded cursor-pointer select-none"
          style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
          onClick={handleTimelineClick}
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
            onMouseDown={(e) => { e.stopPropagation(); setDragging("start"); }}
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
            onMouseDown={(e) => { e.stopPropagation(); setDragging("end"); }}
            data-testid="clip-end"
          />
          {/* Time labels on the bar */}
          <span
            className="absolute text-[9px] font-mono pointer-events-none"
            style={{ left: 4, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }}
          >
            {formatTime(startTime)}
          </span>
          <span
            className="absolute text-[9px] font-mono pointer-events-none"
            style={{ right: 4, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }}
          >
            {formatTime(endTime)}
          </span>
        </div>

        {/* Row 1: Duration + Speed buttons + Preview */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] shrink-0" style={{ color: "var(--color-text-secondary)" }}>
            {formatTime(endTime - startTime)}
          </span>
          <div className="flex items-center gap-1">
            {[0.5, 1, 1.5, 2, 3].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className="px-2 py-0.5 rounded text-[10px] font-medium"
                style={{
                  backgroundColor: speed === s ? "var(--color-accent)" : "var(--color-surface-inset)",
                  color: speed === s ? "#fff" : "var(--color-text)",
                  border: `1px solid ${speed === s ? "var(--color-accent)" : "var(--color-border)"}`,
                }}
                data-testid={`speed-${s}`}
              >
                {s}×
              </button>
            ))}
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
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded text-[12px]"
            style={{
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
          <div
            tabIndex={0}
            onClick={() => setCapturingHotkey(true)}
            onKeyDown={capturingHotkey ? handleHotkeyCapture : undefined}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] w-48"
            style={{
              backgroundColor: "var(--color-surface-inset)",
              color: hotkey ? "var(--color-text)" : "var(--color-text-secondary)",
              border: `1px solid ${capturingHotkey ? "var(--color-accent)" : "var(--color-border)"}`,
            }}
            data-testid="clip-hotkey"
          >
            <Keyboard size={12} />
            <span className="truncate">
              {capturingHotkey ? "Press keys..." : hotkey || "Hotkey *"}
            </span>
          </div>
        </div>

        {/* Row 3: Save / Cancel */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onCancel}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-medium"
            style={{ color: "var(--color-text-secondary)" }}
            data-testid="clip-cancel"
          >
            <X size={12} /> Cancel
          </button>
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
