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
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);

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
      // Stop at end marker during preview
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

  const handleStartChange = (value: number) => {
    const clamped = Math.min(value, endTime - 0.1);
    setStartTime(clamped);
    if (videoRef.current) videoRef.current.currentTime = clamped;
  };

  const handleEndChange = (value: number) => {
    const clamped = Math.max(value, startTime + 0.1);
    setEndTime(clamped);
  };

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

  // Progress percentage for the timeline
  const selectionLeft = duration > 0 ? (startTime / duration) * 100 : 0;
  const selectionWidth = duration > 0 ? ((endTime - startTime) / duration) * 100 : 100;
  const playheadPos = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col h-full" data-testid="clip-editor">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-4">
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text)" }}>
          Create Clip from {video.name}
        </h3>
        <button
          onClick={onCancel}
          className="w-7 h-7 flex items-center justify-center rounded hover:opacity-70"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Video Preview */}
        <div
          className="relative rounded-lg overflow-hidden"
          style={{ backgroundColor: "#000" }}
        >
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full"
            style={{ maxHeight: "300px", objectFit: "contain" }}
            data-testid="clip-editor-video"
          />
        </div>

        {/* Timeline */}
        <div className="space-y-2">
          <div className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Timeline
          </div>

          {/* Visual timeline bar */}
          <div
            className="relative h-8 rounded"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
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
              style={{
                left: `${playheadPos}%`,
                backgroundColor: "var(--color-danger, #ef4444)",
              }}
            />
          </div>

          {/* Start/End sliders */}
          <div className="flex items-center gap-3">
            <label className="text-[11px] font-medium w-10" style={{ color: "var(--color-text-secondary)" }}>Start</label>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={startTime}
              onChange={(e) => handleStartChange(Number(e.target.value))}
              className="flex-1"
              data-testid="clip-start"
            />
            <span className="text-[11px] w-14 text-right font-mono" style={{ color: "var(--color-text-secondary)" }}>
              {formatTime(startTime)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[11px] font-medium w-10" style={{ color: "var(--color-text-secondary)" }}>End</label>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={endTime}
              onChange={(e) => handleEndChange(Number(e.target.value))}
              className="flex-1"
              data-testid="clip-end"
            />
            <span className="text-[11px] w-14 text-right font-mono" style={{ color: "var(--color-text-secondary)" }}>
              {formatTime(endTime)}
            </span>
          </div>

          {/* Duration + Preview */}
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
              Duration: {formatTime(endTime - startTime)}
            </span>
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
        </div>

        {/* Speed */}
        <div>
          <label className="text-[11px] font-medium block mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
            Playback Speed
          </label>
          <div className="flex items-center gap-2">
            {[0.5, 1, 1.5, 2, 3].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className="px-2.5 py-1 rounded text-[11px] font-medium"
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
        </div>

        {/* Metadata */}
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>
              Title <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Build output animation"
              className="w-full px-3 py-1.5 rounded text-[12px]"
              style={{
                backgroundColor: "var(--color-surface-inset)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              data-testid="clip-title"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-1.5 rounded text-[12px]"
              style={{
                backgroundColor: "var(--color-surface-inset)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              data-testid="clip-description"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>
              Hotkey <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <div
              tabIndex={0}
              onClick={() => setCapturingHotkey(true)}
              onKeyDown={capturingHotkey ? handleHotkeyCapture : undefined}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-[12px]"
              style={{
                backgroundColor: "var(--color-surface-inset)",
                color: hotkey ? "var(--color-text)" : "var(--color-text-secondary)",
                border: `1px solid ${capturingHotkey ? "var(--color-accent)" : "var(--color-border)"}`,
              }}
              data-testid="clip-hotkey"
            >
              <Keyboard size={12} />
              {capturingHotkey
                ? "Press a key combination..."
                : hotkey || "Click to set hotkey"}
            </div>
          </div>
        </div>
      </div>

      {/* Footer — Save / Cancel */}
      <div className="flex items-center justify-end gap-2 pt-4 mt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded text-[12px] font-medium"
          style={{ color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
          data-testid="clip-cancel"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded text-[12px] font-medium disabled:opacity-50"
          style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
          data-testid="clip-save"
        >
          <Save size={12} /> Save Clip
        </button>
      </div>
    </div>
  );
}

export default ClipEditor;
