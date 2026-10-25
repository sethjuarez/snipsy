import { AlertTriangle, Copy, Film, Pencil, Trash2, Play, Monitor, MousePointer, MousePointer2Off, MousePointerClick, Volume2, VolumeOff } from "lucide-react";
import { useState } from "react";
import EmptyState from "./EmptyState";
import type { VideoSnippet } from "../types";
import { displayHotkey, hotkeyProblem, type HotkeyOwner } from "../utils/hotkeys";
import { matchesQuery } from "../utils/search";
import ListFilter, { NoMatches } from "./ui/ListFilter";
import Button from "./ui/Button";
import Kbd from "./ui/Kbd";
import ListRow from "./ui/ListRow";
import StatusBadge from "./ui/StatusBadge";
import type { MenuItem } from "./ui/Menu";

interface VideoSnippetListProps {
  snippets: VideoSnippet[];
  onEdit: (snippet: VideoSnippet) => void;
  onDelete: (id: string) => void;
  onPlay?: (snippet: VideoSnippet) => void;
  onDuplicate?: (snippet: VideoSnippet) => void;
  /** Opens the source video library so a clip can be cut. */
  onBrowseVideos?: () => void;
  hotkeyOwners?: HotkeyOwner[];
  /** Relative paths of imported source videos; when set, clips pointing elsewhere are flagged. */
  availableVideoFiles?: ReadonlySet<string>;
}

const chipStyle = { backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" };

function VideoSnippetList({
  snippets,
  onEdit,
  onDelete,
  onPlay,
  onDuplicate,
  onBrowseVideos,
  hotkeyOwners,
  availableVideoFiles,
}: VideoSnippetListProps) {
  const [query, setQuery] = useState("");
  if (snippets.length === 0) {
    return (
      <EmptyState
        icon={Film}
        title="No clips yet"
        description="Clips play a trimmed section of a source video when you press their hotkey."
        action={onBrowseVideos ? { label: "Choose a source video", icon: <Film size={12} />, onClick: onBrowseVideos, testId: "empty-browse-videos" } : undefined}
        tip="Tip: import a recording under Source videos, then use Create clip."
        data-testid="video-empty-state"
      />
    );
  }

  const visible = query.trim()
    ? snippets.filter((s) => matchesQuery(query, s.title, s.description, s.videoFile, displayHotkey(s.hotkey)))
    : snippets;

  return (
    <>
    <ListFilter value={query} onChange={setQuery} label="clips" total={snippets.length} shown={visible.length} />
    {visible.length === 0 && <NoMatches query={query} onClear={() => setQuery("")} />}
    <div className="space-y-2" data-testid="video-snippet-list">
      {visible.map((snippet) => {
        const problem = hotkeyOwners ? hotkeyProblem(snippet.hotkey, hotkeyOwners, snippet.id) : null;
        const missingVideo = availableVideoFiles ? !availableVideoFiles.has(snippet.videoFile) : false;
        const menuItems: MenuItem[] = [
          ...(onPlay ? [{ id: "preview", label: "Preview", icon: <Play size={12} />, onSelect: () => onPlay(snippet), disabled: missingVideo }] : []),
          { id: "edit", label: "Edit", icon: <Pencil size={12} />, onSelect: () => onEdit(snippet) },
          ...(onDuplicate ? [{ id: "duplicate", label: "Duplicate", icon: <Copy size={12} />, onSelect: () => onDuplicate(snippet) }] : []),
          { id: "delete", label: "Delete", icon: <Trash2 size={12} />, onSelect: () => onDelete(snippet.id), danger: true, separated: true },
        ];

        return (
          <ListRow
            key={snippet.id}
            className="gap-4"
            menuItems={menuItems}
            menuLabel={`More actions for ${snippet.title}`}
            data-testid={`video-snippet-${snippet.id}`}
            leading={onPlay && (
              <button
                type="button"
                onClick={() => onPlay(snippet)}
                disabled={missingVideo}
                className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity disabled:opacity-40"
                style={{ backgroundColor: "var(--color-accent)", color: "var(--color-text-on-accent)" }}
                data-testid={`video-preview-${snippet.id}`}
                title={missingVideo ? "Source video is missing" : "Preview clip"}
                aria-label={`Preview ${snippet.title}`}
              >
                <Play size={18} fill="currentColor" />
              </button>
            )}
            actions={
              <>
                <Button tone="ghost" icon={<Pencil size={12} />} onClick={() => onEdit(snippet)} title="Edit clip" data-testid={`video-edit-${snippet.id}`}>
                  Edit
                </Button>
                <Button tone="danger" icon={<Trash2 size={12} />} onClick={() => onDelete(snippet.id)} title="Delete clip" data-testid={`video-delete-${snippet.id}`}>
                  Delete
                </Button>
              </>
            }
          >
            <div className="flex items-center gap-3 min-w-0 flex-wrap">
              <h3 className="font-medium truncate text-md" style={{ color: "var(--color-text)" }}>
                {snippet.title}
              </h3>
              <Kbd hotkey={snippet.hotkey} />
              {missingVideo && (
                <StatusBadge tone="danger" icon={<AlertTriangle size={10} />} title={`${snippet.videoFile} is not in this project's videos folder`} data-testid={`video-missing-${snippet.id}`}>
                  Missing video
                </StatusBadge>
              )}
              {problem && (
                <StatusBadge tone={problem.tone} icon={<AlertTriangle size={10} />} title={problem.detail} data-testid={`video-status-${snippet.id}`}>
                  {problem.label}
                </StatusBadge>
              )}
              <span className="text-sm px-2 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-accent)" }}>
                ~{parseFloat(snippet.speed.toPrecision(3))}×
              </span>
              {snippet.targetMonitor && (
                <span className="flex items-center gap-1 text-sm px-2 py-0.5 rounded" style={chipStyle}>
                  <Monitor size={10} />
                  {snippet.targetMonitor}
                </span>
              )}
              <span
                className="inline-block w-4 h-4 rounded-sm border"
                style={{ backgroundColor: snippet.backgroundColor || "#000000", borderColor: "var(--color-border)" }}
                title={`Background: ${snippet.backgroundColor || "#000000"}`}
                data-testid={`bg-color-swatch-${snippet.id}`}
              />
              <span
                className="flex items-center gap-1 text-sm px-2 py-0.5 rounded"
                style={chipStyle}
                title={snippet.hideCursor !== false ? "Cursor hidden during playback" : "Cursor visible during playback"}
                data-testid={`cursor-indicator-${snippet.id}`}
              >
                {snippet.hideCursor !== false ? <MousePointer2Off size={10} /> : <MousePointer size={10} />}
              </span>
              {snippet.clickToPlay && (
                <span
                  className="flex items-center gap-1 text-sm px-2 py-0.5 rounded"
                  style={chipStyle}
                  title="Click to play — first frame freezes until clicked"
                  data-testid={`click-to-play-indicator-${snippet.id}`}
                >
                  <MousePointerClick size={10} />
                </span>
              )}
              {snippet.pauseStops && snippet.pauseStops.length > 0 && (
                <span
                  className="flex items-center gap-1 text-sm px-2 py-0.5 rounded"
                  style={chipStyle}
                  title={`${snippet.pauseStops.length} moment${snippet.pauseStops.length === 1 ? "" : "s"}`}
                  data-testid={`pause-stops-indicator-${snippet.id}`}
                >
                  <MousePointerClick size={10} />
                  {snippet.pauseStops.length} stop{snippet.pauseStops.length === 1 ? "" : "s"}
                </span>
              )}
              <span
                className="flex items-center gap-1 text-sm px-2 py-0.5 rounded"
                style={chipStyle}
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
              {snippet.videoFile} ({snippet.startTime.toFixed(1)}s – {snippet.endTime.toFixed(1)}s)
            </p>
          </ListRow>
        );
      })}
    </div>
    </>
  );
}

export default VideoSnippetList;
