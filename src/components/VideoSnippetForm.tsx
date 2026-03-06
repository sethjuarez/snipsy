import { useState, useCallback } from "react";
import type { VideoSnippet } from "../types";

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
      transitionActions: snippet?.transitionActions,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="video-snippet-form">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Snippet title"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="video-snippet-title"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Video File</label>
          <input
            type="text"
            value={videoFile}
            onChange={(e) => setVideoFile(e.target.value)}
            placeholder="videos/example.mp4"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="video-snippet-file"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid="video-snippet-description"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start (s)</label>
          <input
            type="number"
            value={startTime}
            onChange={(e) => setStartTime(Number(e.target.value))}
            min={0}
            step={0.1}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="video-snippet-start"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End (s)</label>
          <input
            type="number"
            value={endTime}
            onChange={(e) => setEndTime(Number(e.target.value))}
            min={0}
            step={0.1}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="video-snippet-end"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Speed</label>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Hotkey</label>
        <input
          type="text"
          value={capturingHotkey ? "Press a key combo..." : hotkey}
          readOnly
          onFocus={() => setCapturingHotkey(true)}
          onBlur={() => setCapturingHotkey(false)}
          onKeyDown={handleHotkeyCapture}
          placeholder="Click to capture hotkey"
          className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
            capturingHotkey ? "border-blue-500 bg-blue-50" : "border-gray-300"
          }`}
          data-testid="video-snippet-hotkey"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
          data-testid="video-snippet-save"
        >
          {snippet ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded font-medium hover:bg-gray-200"
          data-testid="video-snippet-cancel"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default VideoSnippetForm;
