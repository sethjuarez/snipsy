import { useEffect, useState, useCallback } from "react";
import type { VideoSnippet, TransitionAction, StreamDeckIcon } from "../types";
import { formatKeyCombo, validateHotkey, type HotkeyOwner } from "../utils/hotkeys";
import { STREAM_DECK_PRESETS, defaultStreamDeckIcon, streamDeckIconToDataUrl } from "../utils/streamDeckIcons";

interface VideoSnippetFormProps {
  snippet?: VideoSnippet;
  onSave: (snippet: VideoSnippet) => void;
  hotkeyOwners?: HotkeyOwner[];
  onSaveStateChange?: (state: { canSave: boolean; readinessText: string; saveStatus: "idle" | "unsaved" | "saved" }) => void;
}

function VideoSnippetForm({ snippet, onSave, hotkeyOwners = [], onSaveStateChange }: VideoSnippetFormProps) {
  const [title, setTitle] = useState(snippet?.title ?? "");
  const [description, setDescription] = useState(snippet?.description ?? "");
  const [videoFile, setVideoFile] = useState(snippet?.videoFile ?? "");
  const [startTime, setStartTime] = useState(snippet?.startTime ?? 0);
  const [endTime, setEndTime] = useState(snippet?.endTime ?? 30);
  const [hotkey, setHotkey] = useState(snippet?.hotkey ?? "");
  const [speed, setSpeed] = useState(snippet?.speed ?? 1.0);
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [transitionActions, setTransitionActions] = useState<TransitionAction[]>(
    snippet?.transitionActions ?? [],
  );
  const [muted, setMuted] = useState(snippet?.muted !== false);
  const [pauseStops] = useState(snippet?.pauseStops);
  const initialIcon = snippet?.streamDeckIcon ?? defaultStreamDeckIcon("video");
  const [iconKind, setIconKind] = useState<StreamDeckIcon["kind"]>(initialIcon.kind);
  const [iconPreset, setIconPreset] = useState<string>(initialIcon.kind === "preset" ? initialIcon.value : "play");
  const [iconEmoji, setIconEmoji] = useState(initialIcon.kind === "emoji" ? initialIcon.value : "▶");
  const [iconBackground, setIconBackground] = useState(initialIcon.background ?? "#1e1b4b");
  const [iconForeground, setIconForeground] = useState(initialIcon.foreground ?? "#a78bfa");
  const [saveStatus, setSaveStatus] = useState<"idle" | "unsaved" | "saved">("idle");
  const hotkeyStatus = validateHotkey(hotkey, hotkeyOwners, snippet?.id);
  const canSave = Boolean(title.trim()) && Boolean(videoFile.trim()) && hotkeyStatus.state === "available";
  const readinessText = canSave
    ? "Ready"
    : `Needs ${[
      !title.trim() ? "Title" : null,
      !videoFile.trim() ? "Video file" : null,
      hotkeyStatus.state !== "available" ? "Hotkey" : null,
    ].filter(Boolean).join(", ")}`;
  const streamDeckIcon: StreamDeckIcon = iconKind === "emoji"
    ? { kind: "emoji", value: iconEmoji || "▶", background: iconBackground, foreground: iconForeground }
    : iconKind === "generated"
      ? { kind: "generated", background: iconBackground, foreground: iconForeground }
      : { kind: "preset", value: STREAM_DECK_PRESETS.includes(iconPreset as (typeof STREAM_DECK_PRESETS)[number]) ? iconPreset as (typeof STREAM_DECK_PRESETS)[number] : "play", background: iconBackground, foreground: iconForeground };
  const streamDeckPreview = streamDeckIconToDataUrl(streamDeckIcon, title || "Clip", "video");

  const addTransitionAction = () => {
    setTransitionActions([
      ...transitionActions,
      { triggerAt: "end", action: "click", x: 0, y: 0 },
    ]);
  };

  const updateTransitionAction = (
    index: number,
    field: keyof TransitionAction,
    value: string | number,
  ) => {
    const updated = [...transitionActions];
    updated[index] = { ...updated[index], [field]: value };
    setTransitionActions(updated);
  };

  const removeTransitionAction = (index: number) => {
    setTransitionActions(transitionActions.filter((_, i) => i !== index));
  };

  const handleHotkeyCapture = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const combo = formatKeyCombo(e.nativeEvent);
      if (combo.includes("+") && !combo.endsWith("+")) {
        setHotkey(combo);
        setCapturingHotkey(false);
      }
    },
    [],
  );

  const saveSnippet = () => {
    if (!canSave) return;

    onSave({
      id: snippet?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      videoFile,
      startTime,
      endTime,
      hotkey,
      speed,
      muted,
      pauseStops,
      streamDeckIcon,
      transitionActions:
        transitionActions.length > 0 ? transitionActions : undefined,
    });
    setSaveStatus("saved");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveSnippet();
  };

  useEffect(() => {
    if (saveStatus === "saved") setSaveStatus("unsaved");
  }, [title, description, videoFile, startTime, endTime, hotkey, speed, muted, transitionActions, iconKind, iconPreset, iconEmoji, iconBackground, iconForeground]);

  useEffect(() => {
    onSaveStateChange?.({ canSave, readinessText: saveStatus === "saved" ? "Saved" : readinessText, saveStatus });
  }, [canSave, onSaveStateChange, readinessText, saveStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s" || capturingHotkey) return;
      event.preventDefault();
      saveSnippet();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <form id="video-snippet-editor-form" onSubmit={handleSubmit} className="space-y-4" data-testid="video-snippet-form">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="video-snippet-title" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>Title</label>
          <input
            id="video-snippet-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Snippet title"
            required
            className="w-full px-3 py-2 rounded text-md"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="video-snippet-title"
          />
        </div>
        <div>
          <label htmlFor="video-snippet-file" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>Video File</label>
          <input
            id="video-snippet-file"
            type="text"
            value={videoFile}
            onChange={(e) => setVideoFile(e.target.value)}
            placeholder="videos/example.mp4"
            required
            className="w-full px-3 py-2 rounded text-md"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="video-snippet-file"
          />
        </div>
      </div>

      <div>
        <label htmlFor="video-snippet-description" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>Description</label>
        <input
          id="video-snippet-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full px-3 py-2 rounded text-md"
          style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          data-testid="video-snippet-description"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="video-snippet-start" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>Start (s)</label>
          <input
            id="video-snippet-start"
            type="number"
            value={startTime}
            onChange={(e) => setStartTime(Number(e.target.value))}
            min={0}
            step={0.1}
            className="w-full px-3 py-2 rounded text-md"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="video-snippet-start"
          />
        </div>
        <div>
          <label htmlFor="video-snippet-end" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>End (s)</label>
          <input
            id="video-snippet-end"
            type="number"
            value={endTime}
            onChange={(e) => setEndTime(Number(e.target.value))}
            min={0}
            step={0.1}
            className="w-full px-3 py-2 rounded text-md"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="video-snippet-end"
          />
        </div>
        <div>
          <label htmlFor="video-snippet-speed" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>Speed</label>
          <select
            id="video-snippet-speed"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full px-3 py-2 rounded text-md"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="video-snippet-speed"
          >
            <option value={0.5}>0.5x</option>
            <option value={1.0}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2.0}>2x</option>
            <option value={3.0}>3x</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="video-snippet-hotkey" className="block font-medium mb-1 text-base" style={{ color: "var(--color-text-secondary)" }}>Hotkey</label>
        <input
          id="video-snippet-hotkey"
          type="text"
          value={capturingHotkey ? "Press a key combo..." : hotkey}
          readOnly
          onFocus={() => setCapturingHotkey(true)}
          onBlur={() => setCapturingHotkey(false)}
          onKeyDown={handleHotkeyCapture}
          placeholder="Click to capture hotkey"
          className="w-full px-3 py-2 rounded font-mono text-md"
          style={capturingHotkey
            ? { backgroundColor: "var(--color-surface-inset)", border: "2px solid var(--color-accent)", color: "var(--color-text)" }
            : { backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }
          }
          data-testid="video-snippet-hotkey"
          aria-describedby="video-snippet-hotkey-status"
        />
        <p
          id="video-snippet-hotkey-status"
          className="mt-1 text-sm"
          style={{
            color:
              hotkeyStatus.state === "available"
                ? "var(--color-success)"
                : hotkeyStatus.state === "conflict" || hotkeyStatus.state === "invalid"
                  ? "var(--color-danger)"
                  : "var(--color-text-secondary)",
          }}
          data-testid="video-snippet-hotkey-status"
        >
          {hotkeyStatus.message}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="muted"
          checked={muted}
          onChange={(e) => setMuted(e.target.checked)}
          className="rounded"
          data-testid="video-snippet-muted"
        />
        <label htmlFor="muted" className="font-medium text-base" style={{ color: "var(--color-text-secondary)" }}>
          Mute audio during playback
        </label>
      </div>

      <div>
        <label className="block font-medium mb-2 text-base" style={{ color: "var(--color-text-secondary)" }}>
          Icon
        </label>
        <div className="flex gap-3 items-start">
          <img src={streamDeckPreview} alt="" className="w-20 h-20 rounded-xl" data-testid="video-streamdeck-icon-preview" />
          <div className="grid grid-cols-2 gap-3 flex-1">
            <select
              value={iconKind}
              onChange={(e) => setIconKind(e.target.value as StreamDeckIcon["kind"])}
              className="px-3 py-2 rounded text-md"
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              data-testid="video-streamdeck-icon-kind"
            >
              <option value="preset">Preset</option>
              <option value="emoji">Emoji</option>
              <option value="generated">Generated initials</option>
            </select>
            {iconKind === "preset" ? (
              <select
                value={iconPreset}
                onChange={(e) => setIconPreset(e.target.value)}
                className="px-3 py-2 rounded text-md"
                style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                data-testid="video-streamdeck-icon-preset"
              >
                {STREAM_DECK_PRESETS.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
              </select>
            ) : iconKind === "emoji" ? (
              <input
                value={iconEmoji}
                onChange={(e) => setIconEmoji(e.target.value)}
                className="px-3 py-2 rounded text-md"
                style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                data-testid="video-streamdeck-icon-emoji"
              />
            ) : (
              <div className="px-3 py-2 rounded text-md" style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                Uses title initials
              </div>
            )}
            <input
              type="color"
              aria-label="Icon background"
              value={iconBackground}
              onChange={(e) => setIconBackground(e.target.value)}
              className="h-10 w-full rounded"
              data-testid="video-streamdeck-icon-background"
            />
            <input
              type="color"
              aria-label="Icon foreground"
              value={iconForeground}
              onChange={(e) => setIconForeground(e.target.value)}
              className="h-10 w-full rounded"
              data-testid="video-streamdeck-icon-foreground"
            />
          </div>
        </div>
      </div>

      <div data-testid="transition-actions-section">
        <div className="flex items-center justify-between mb-2">
          <label className="block font-medium text-base" style={{ color: "var(--color-text-secondary)" }}>
            Transition Actions
          </label>
          <button
            type="button"
            onClick={addTransitionAction}
            className="text-base font-medium"
            style={{ color: "var(--color-accent)" }}
            data-testid="add-transition-action"
          >
            + Add Action
          </button>
        </div>
        {transitionActions.length === 0 && (
          <p className="text-base" style={{ color: "var(--color-text-secondary)" }} data-testid="no-transition-actions">
            No transition actions. Actions execute during video playback.
          </p>
        )}
        {transitionActions.map((action, index) => (
          <div
            key={index}
            className="flex items-center gap-2 mb-2 p-2 rounded"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border-subtle)" }}
            data-testid={`transition-action-${index}`}
          >
            <select
              value={action.triggerAt}
              onChange={(e) =>
                updateTransitionAction(index, "triggerAt", e.target.value)
              }
              className="px-2 py-1 rounded text-base"
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              data-testid={`transition-trigger-${index}`}
            >
              <option value="end">At End</option>
              <option value="0">At 0s</option>
              <option value="5">At 5s</option>
              <option value="10">At 10s</option>
              <option value="15">At 15s</option>
            </select>
            <select
              value={action.action}
              onChange={(e) =>
                updateTransitionAction(index, "action", e.target.value)
              }
              className="px-2 py-1 rounded text-base"
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              data-testid={`transition-type-${index}`}
            >
              <option value="click">Click</option>
            </select>
            <input
              type="number"
              value={action.x ?? 0}
              onChange={(e) =>
                updateTransitionAction(index, "x", Number(e.target.value))
              }
              placeholder="X"
              className="w-20 px-2 py-1 rounded text-base"
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              data-testid={`transition-x-${index}`}
            />
            <input
              type="number"
              value={action.y ?? 0}
              onChange={(e) =>
                updateTransitionAction(index, "y", Number(e.target.value))
              }
              placeholder="Y"
              className="w-20 px-2 py-1 rounded text-base"
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              data-testid={`transition-y-${index}`}
            />
            <button
              type="button"
              onClick={() => removeTransitionAction(index)}
              className="text-base"
              style={{ color: "var(--color-danger)" }}
              data-testid={`transition-remove-${index}`}
              aria-label={`Remove transition action ${index + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

    </form>
  );
}

export default VideoSnippetForm;
