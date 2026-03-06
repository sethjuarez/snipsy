import { useState, useCallback } from "react";
import type { VideoSnippet, TransitionAction } from "../types";

interface VideoSnippetFormProps {
  snippet?: VideoSnippet;
  onSave: (snippet: VideoSnippet) => void;
  onCancel: () => void;
}

function formatKeyCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CmdOrControl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  const key = e.key;
  if (!["Control", "Shift", "Alt", "Meta"].includes(key)) {
    if (key.length === 1) parts.push(key.toUpperCase());
    else parts.push(key);
  }
  return parts.join("+");
}

function VideoSnippetForm({ snippet, onSave, onCancel }: VideoSnippetFormProps) {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !hotkey || !videoFile) return;

    onSave({
      id: snippet?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      videoFile,
      startTime,
      endTime,
      hotkey,
      speed,
      transitionActions:
        transitionActions.length > 0 ? transitionActions : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="video-snippet-form">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Snippet title"
            required
            className="w-full px-3 py-2 rounded text-[13px]"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="video-snippet-title"
          />
        </div>
        <div>
          <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Video File</label>
          <input
            type="text"
            value={videoFile}
            onChange={(e) => setVideoFile(e.target.value)}
            placeholder="videos/example.mp4"
            required
            className="w-full px-3 py-2 rounded text-[13px]"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="video-snippet-file"
          />
        </div>
      </div>

      <div>
        <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full px-3 py-2 rounded text-[13px]"
          style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          data-testid="video-snippet-description"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Start (s)</label>
          <input
            type="number"
            value={startTime}
            onChange={(e) => setStartTime(Number(e.target.value))}
            min={0}
            step={0.1}
            className="w-full px-3 py-2 rounded text-[13px]"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="video-snippet-start"
          />
        </div>
        <div>
          <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>End (s)</label>
          <input
            type="number"
            value={endTime}
            onChange={(e) => setEndTime(Number(e.target.value))}
            min={0}
            step={0.1}
            className="w-full px-3 py-2 rounded text-[13px]"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid="video-snippet-end"
          />
        </div>
        <div>
          <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Speed</label>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full px-3 py-2 rounded text-[13px]"
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
        <label className="block font-medium mb-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Hotkey</label>
        <input
          type="text"
          value={capturingHotkey ? "Press a key combo..." : hotkey}
          readOnly
          onFocus={() => setCapturingHotkey(true)}
          onBlur={() => setCapturingHotkey(false)}
          onKeyDown={handleHotkeyCapture}
          placeholder="Click to capture hotkey"
          className="w-full px-3 py-2 rounded font-mono text-[13px]"
          style={capturingHotkey
            ? { backgroundColor: "var(--color-surface-inset)", border: "2px solid var(--color-accent)", color: "var(--color-text)" }
            : { backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }
          }
          data-testid="video-snippet-hotkey"
        />
      </div>

      <div data-testid="transition-actions-section">
        <div className="flex items-center justify-between mb-2">
          <label className="block font-medium text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Transition Actions
          </label>
          <button
            type="button"
            onClick={addTransitionAction}
            className="text-[12px] font-medium"
            style={{ color: "var(--color-accent)" }}
            data-testid="add-transition-action"
          >
            + Add Action
          </button>
        </div>
        {transitionActions.length === 0 && (
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }} data-testid="no-transition-actions">
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
              className="px-2 py-1 rounded text-[12px]"
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
              className="px-2 py-1 rounded text-[12px]"
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
              className="w-20 px-2 py-1 rounded text-[12px]"
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
              className="w-20 px-2 py-1 rounded text-[12px]"
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              data-testid={`transition-y-${index}`}
            />
            <button
              type="button"
              onClick={() => removeTransitionAction(index)}
              className="text-[12px]"
              style={{ color: "var(--color-danger)" }}
              data-testid={`transition-remove-${index}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="px-4 py-2 rounded font-medium text-[13px]"
          style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
          data-testid="video-snippet-save"
        >
          {snippet ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded font-medium text-[13px]"
          style={{ backgroundColor: "var(--color-surface-alt)", color: "var(--color-text)" }}
          data-testid="video-snippet-cancel"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default VideoSnippetForm;
