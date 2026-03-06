import type { VideoSnippet } from "../types";

interface VideoSnippetListProps {
  snippets: VideoSnippet[];
  onEdit: (snippet: VideoSnippet) => void;
  onDelete: (id: string) => void;
  onPlay?: (snippet: VideoSnippet) => void;
  demoMode?: boolean;
}

function VideoSnippetList({ snippets, onEdit, onDelete, onPlay, demoMode }: VideoSnippetListProps) {
  if (snippets.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: "var(--color-text-secondary)" }} data-testid="video-empty-state">
        <p className="text-[13px]">No video snippets yet</p>
        <p className="text-[12px] mt-1">Create one from an imported video.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="video-snippet-list">
      {snippets.map((snippet) => (
        <div
          key={snippet.id}
          className="flex items-center justify-between rounded-lg px-4 py-3"
          style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
          data-testid={`video-snippet-${snippet.id}`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="font-medium truncate text-[13px]" style={{ color: "var(--color-text)" }}>
                {snippet.title}
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded font-mono" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}>
                {snippet.hotkey}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-accent)" }}>
                {snippet.speed}x
              </span>
            </div>
            {snippet.description && (
              <p className="text-[12px] mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
                {snippet.description}
              </p>
            )}
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
              {snippet.videoFile} ({snippet.startTime.toFixed(1)}s –{" "}
              {snippet.endTime.toFixed(1)}s)
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {demoMode && onPlay && (
              <button
                onClick={() => onPlay(snippet)}
                className="text-[12px] font-medium"
                style={{ color: "var(--color-success)" }}
                data-testid={`video-play-${snippet.id}`}
              >
                ▶ Play
              </button>
            )}
            <button
              onClick={() => onEdit(snippet)}
              className="text-[12px]"
              style={{ color: "var(--color-accent)" }}
              data-testid={`video-edit-${snippet.id}`}
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(snippet.id)}
              className="text-[12px]"
              style={{ color: "var(--color-danger)" }}
              data-testid={`video-delete-${snippet.id}`}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default VideoSnippetList;
