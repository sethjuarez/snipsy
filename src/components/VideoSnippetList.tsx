import { Pencil, Trash2, Play, Keyboard, Monitor, MousePointer, MousePointer2Off, MousePointerClick, Volume2, VolumeOff } from "lucide-react";
import EmptyState from "./EmptyState";
import type { VideoSnippet } from "../types";

interface VideoSnippetListProps {
  snippets: VideoSnippet[];
  onEdit: (snippet: VideoSnippet) => void;
  onDelete: (id: string) => void;
  onPlay?: (snippet: VideoSnippet) => void;
}

function VideoSnippetList({ snippets, onEdit, onDelete, onPlay }: VideoSnippetListProps) {
  if (snippets.length === 0) {
    return (
      <EmptyState title="No video snippets yet" description="Create one from an imported video." data-testid="video-empty-state" />
    );
  }

  return (
    <div className="space-y-2" data-testid="video-snippet-list">
      {snippets.map((snippet) => (
        <div
          key={snippet.id}
          className="flex items-center rounded-lg px-4 py-3 gap-4"
          style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
          data-testid={`video-snippet-${snippet.id}`}
        >
          {/* Big play button */}
          {onPlay && (
            <button
              onClick={() => onPlay(snippet)}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
              style={{ backgroundColor: "var(--color-accent)", color: "var(--color-text-on-accent)" }}
              data-testid={`video-preview-${snippet.id}`}
              title="Preview clip"
            >
              <Play size={18} fill="currentColor" />
            </button>
          )}
          {/* Clip info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="font-medium truncate text-md" style={{ color: "var(--color-text)" }}>
                {snippet.title}
              </h3>
              <span className="flex items-center gap-1 text-sm px-2 py-0.5 rounded font-mono" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}>
                <Keyboard size={10} />
                {snippet.hotkey}
              </span>
              <span className="text-sm px-2 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-accent)" }}>
                ~{parseFloat(snippet.speed.toPrecision(3))}×
              </span>
              {snippet.targetMonitor && (
                <span className="flex items-center gap-1 text-sm px-2 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}>
                  <Monitor size={10} />
                  {snippet.targetMonitor}
                </span>
              )}
              <span
                className="inline-block w-4 h-4 rounded-sm border"
                style={{
                  backgroundColor: snippet.backgroundColor || "#000000",
                  borderColor: "var(--color-border)",
                }}
                title={`Background: ${snippet.backgroundColor || "#000000"}`}
                data-testid={`bg-color-swatch-${snippet.id}`}
              />
              <span
                className="flex items-center gap-1 text-sm px-2 py-0.5 rounded"
                style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
                title={snippet.hideCursor !== false ? "Cursor hidden during playback" : "Cursor visible during playback"}
                data-testid={`cursor-indicator-${snippet.id}`}
              >
                {snippet.hideCursor !== false ? <MousePointer2Off size={10} /> : <MousePointer size={10} />}
              </span>
              {snippet.clickToPlay && (
                <span
                  className="flex items-center gap-1 text-sm px-2 py-0.5 rounded"
                  style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
                  title="Click to play — first frame freezes until clicked"
                  data-testid={`click-to-play-indicator-${snippet.id}`}
                >
                  <MousePointerClick size={10} />
                </span>
              )}
              <span
                className="flex items-center gap-1 text-sm px-2 py-0.5 rounded"
                style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
                title={snippet.muted !== false ? "Audio muted during playback" : "Audio enabled during playback"}
                data-testid={`muted-indicator-${snippet.id}`}
              >
                {snippet.muted !== false ? <VolumeOff size={10} /> : <Volume2 size={10} />}
              </span>
            </div>
            {snippet.description && (
              <p className="text-base mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
                {snippet.description}
              </p>
            )}
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
              {snippet.videoFile} ({snippet.startTime.toFixed(1)}s –{" "}
              {snippet.endTime.toFixed(1)}s)
            </p>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => onEdit(snippet)}
              className="flex items-center gap-1 text-base"
              style={{ color: "var(--color-accent)" }}
              data-testid={`video-edit-${snippet.id}`}
            >
              <Pencil size={12} /> Edit
            </button>
            <button
              onClick={() => onDelete(snippet.id)}
              className="flex items-center gap-1 text-base"
              style={{ color: "var(--color-danger)" }}
              data-testid={`video-delete-${snippet.id}`}
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default VideoSnippetList;
