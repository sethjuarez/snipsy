import { useState, useEffect, useMemo } from "react";
import { createBackendService } from "../services";
import { FileVideo, Upload, Scissors, Film, Trash2 } from "lucide-react";
import type { ImportedVideo, VideoSnippet } from "../types";

const backend = createBackendService();

// Convert local file path to a URL the webview can load (only in Tauri context)
let convertFileSrc: ((path: string) => string) | null = null;
import("@tauri-apps/api/core")
  .then((mod) => { if (mod?.isTauri?.()) convertFileSrc = mod.convertFileSrc; })
  .catch(() => {});

interface VideoListProps {
  projectPath: string;
  videoSnippets: VideoSnippet[];
  onCreateClip: (video: ImportedVideo) => void;
  onDeleteVideo: (video: ImportedVideo) => void;
}

function VideoList({ projectPath, videoSnippets, onCreateClip, onDeleteVideo }: VideoListProps) {
  const [videos, setVideos] = useState<ImportedVideo[]>([]);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ImportedVideo | null>(null);

  useEffect(() => {
    backend.getImportedVideos(projectPath).then(setVideos);
  }, [projectPath]);

  // Count clips per video
  const clipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of videoSnippets) {
      counts[s.videoFile] = (counts[s.videoFile] || 0) + 1;
    }
    return counts;
  }, [videoSnippets]);

  const handleImport = async () => {
    const filePath = await backend.selectVideoFile();
    if (!filePath) return;

    setImporting(true);
    try {
      await backend.importVideo(projectPath, filePath);
      const updated = await backend.getImportedVideos(projectPath);
      setVideos(updated);
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    await backend.deleteVideo(projectPath, confirmDelete.relativePath);
    onDeleteVideo(confirmDelete);
    const updated = await backend.getImportedVideos(projectPath);
    setVideos(updated);
    setConfirmDelete(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Videos</h3>
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded disabled:opacity-50"
          style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
          data-testid="import-video"
        >
          <Upload size={12} />
          {importing ? "Importing..." : "Import Video"}
        </button>
      </div>

      {videos.length === 0 ? (
        <p
          className="text-center py-8 text-[12px]"
          style={{ color: "var(--color-text-secondary)" }}
          data-testid="no-videos"
        >
          No videos imported yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2" data-testid="video-list">
          {videos.map((video, i) => {
            const thumbUrl = video.thumbnailPath && convertFileSrc
              ? convertFileSrc(video.thumbnailPath)
              : null;
            const count = clipCounts[video.relativePath] || 0;

            return (
              <div
                key={video.relativePath}
                className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
                data-testid={`video-item-${i}`}
              >
                {/* Thumbnail */}
                <div
                  className="shrink-0 rounded overflow-hidden flex items-center justify-center"
                  style={{ width: 80, height: 45, backgroundColor: "var(--color-surface-inset)" }}
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={video.name}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <FileVideo size={18} style={{ color: "var(--color-text-secondary)", opacity: 0.4 }} />
                  )}
                </div>

                {/* Name + clip count */}
                <div className="flex-1 min-w-0">
                  <span
                    className="block text-[12px] font-medium truncate"
                    style={{ color: "var(--color-text)" }}
                    title={video.name}
                  >
                    {video.name}
                  </span>
                  <span
                    className="flex items-center gap-1 text-[11px] mt-0.5"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <Film size={10} /> {count} clip{count !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Actions */}
                <button
                  onClick={() => onCreateClip(video)}
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium"
                  style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
                  data-testid={`create-clip-${i}`}
                >
                  <Scissors size={11} /> Create Clip
                </button>
                <button
                  onClick={() => setConfirmDelete(video)}
                  className="shrink-0 flex items-center justify-center w-7 h-7 rounded"
                  style={{ color: "var(--color-danger, #ef4444)" }}
                  data-testid={`delete-video-${i}`}
                  title="Remove video"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          data-testid="delete-video-dialog"
        >
          <div
            className="rounded-lg p-5 w-full max-w-sm space-y-4"
            style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
          >
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>
              Remove Video?
            </h3>
            <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              This will permanently delete <strong>{confirmDelete.name}</strong>
              {(clipCounts[confirmDelete.relativePath] || 0) > 0 && (
                <> and its <strong>{clipCounts[confirmDelete.relativePath]}</strong> associated clip{clipCounts[confirmDelete.relativePath] === 1 ? "" : "s"}</>
              )}.
              This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 rounded text-[12px] font-medium"
                style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
                data-testid="cancel-delete-video"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 rounded text-[12px] font-medium"
                style={{ backgroundColor: "var(--color-danger, #ef4444)", color: "#fff" }}
                data-testid="confirm-delete-video"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoList;
