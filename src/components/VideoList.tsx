import { forwardRef, useState, useEffect, useMemo, useCallback, useImperativeHandle, useRef } from "react";
import { getBackend } from "../services";
import { isTauriRuntime, tauriFileSrc } from "../services/auditaur";
import { FileVideo, Scissors, Film, Trash2 } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { captureVideoThumbnail } from "../utils/videoThumbnail";
import type { ImportedVideo, VideoSnippet } from "../types";

const backend = getBackend();

// Convert local file path to a URL the webview can load (only in Tauri context)
let convertFileSrc: ((path: string) => string) | null = null;
if (isTauriRuntime()) {
  convertFileSrc = tauriFileSrc;
}

interface VideoListProps {
  projectPath: string;
  videoSnippets: VideoSnippet[];
  onCreateClip: (video: ImportedVideo) => void;
  onDeleteVideo: (video: ImportedVideo) => void;
  onToolbarStateChange?: (state: VideoListToolbarState) => void;
  /** Called with the project's video paths whenever the list loads or changes. */
  onVideosChange?: (relativePaths: string[]) => void;
}

export interface VideoListHandle {
  importVideo: () => void;
}

export interface VideoListToolbarState {
  importing: boolean;
}

const VideoList = forwardRef<VideoListHandle, VideoListProps>(function VideoList(
  { projectPath, videoSnippets, onCreateClip, onDeleteVideo, onToolbarStateChange, onVideosChange },
  ref,
) {
  // Tagged with its project so a late load can't be mixed with another project's videos.
  const [loaded, setLoaded] = useState<{ project: string; videos: ImportedVideo[] }>({ project: "", videos: [] });
  const videos = loaded.project === projectPath ? loaded.videos : [];
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ImportedVideo | null>(null);

  const thumbnailAttempts = useRef(new Set<string>());
  const thumbnailQueue = useRef<Promise<void>>(Promise.resolve());
  // The project this component is currently mounted for; null after unmount.
  const activeProject = useRef<string | null>(null);

  const refreshVideos = useCallback(async (project: string) => {
    const list = await backend.getImportedVideos(project);
    if (activeProject.current === project) setLoaded({ project, videos: list });
  }, []);

  useEffect(() => {
    activeProject.current = projectPath;
    void refreshVideos(projectPath);
    return () => { activeProject.current = null; };
  }, [projectPath, refreshVideos]);

  // Generate missing thumbnails in the webview, one video at a time.
  useEffect(() => {
    const toSrc = convertFileSrc;
    if (!toSrc || loaded.project !== projectPath) return;
    const project = projectPath;
    const isActive = () => activeProject.current === project;
    for (const video of loaded.videos) {
      const key = `${project}|${video.relativePath}`;
      if (video.thumbnailPath || thumbnailAttempts.current.has(key)) continue;
      thumbnailAttempts.current.add(key);
      thumbnailQueue.current = thumbnailQueue.current.then(async () => {
        if (!isActive()) {
          thumbnailAttempts.current.delete(key);
          return;
        }
        try {
          const jpeg = await captureVideoThumbnail(toSrc(video.absolutePath));
          if (!isActive()) {
            thumbnailAttempts.current.delete(key);
            return;
          }
          const thumbnailPath = await backend.saveVideoThumbnail(project, video.relativePath, jpeg);
          if (!isActive()) return;
          setLoaded((current) => current.project !== project ? current : {
            project,
            videos: current.videos.map((v) =>
              v.relativePath === video.relativePath ? { ...v, thumbnailPath } : v),
          });
        } catch (error) {
          // Allow a retry on the next list refresh.
          thumbnailAttempts.current.delete(key);
          console.warn(`Could not create thumbnail for ${video.relativePath}:`, error);
        }
      });
    }
  }, [loaded, projectPath]);

  // Count clips per video
  const clipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of videoSnippets) {
      counts[s.videoFile] = (counts[s.videoFile] || 0) + 1;
    }
    return counts;
  }, [videoSnippets]);

  const handleImport = useCallback(async () => {
    const filePath = await backend.selectVideoFile();
    if (!filePath) return;

    setImporting(true);
    try {
      const relativePath = await backend.importVideo(projectPath, filePath);
      thumbnailAttempts.current.delete(`${projectPath}|${relativePath}`);
      await refreshVideos(projectPath);
    } finally {
      setImporting(false);
    }
  }, [projectPath, refreshVideos]);

  useImperativeHandle(ref, () => ({ importVideo: handleImport }), [handleImport]);

  useEffect(() => {
    onToolbarStateChange?.({ importing });
  }, [importing, onToolbarStateChange]);

  // Keyed on paths so thumbnail updates don't re-notify.
  const videoPathsKey = loaded.project === projectPath ? JSON.stringify(loaded.videos.map((video) => video.relativePath)) : null;
  useEffect(() => {
    if (videoPathsKey !== null) onVideosChange?.(JSON.parse(videoPathsKey) as string[]);
  }, [videoPathsKey, onVideosChange]);

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    await backend.deleteVideo(projectPath, confirmDelete.relativePath);
    onDeleteVideo(confirmDelete);
    await refreshVideos(projectPath);
    setConfirmDelete(null);
  };

  return (
    <div>
      {videos.length === 0 ? (
        <p
          className="text-center py-8 text-base"
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
                    className="block text-base font-medium truncate"
                    style={{ color: "var(--color-text)" }}
                    title={video.name}
                  >
                    {video.name}
                  </span>
                  <span
                    className="flex items-center gap-1 text-sm mt-0.5"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <Film size={10} /> {count} clip{count !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Actions */}
                <button
                  onClick={() => onCreateClip(video)}
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm font-medium"
                  style={{ backgroundColor: "var(--color-accent)", color: "var(--color-text-on-accent)" }}
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
                  aria-label="Remove video"
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
        <DeleteVideoDialog
          video={confirmDelete}
          clipCount={clipCounts[confirmDelete.relativePath] || 0}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
});

function DeleteVideoDialog({ video, clipCount, onCancel, onConfirm }: {
  video: ImportedVideo;
  clipCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>();

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "var(--color-overlay)" }}
      data-testid="delete-video-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-video-dialog-title"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      tabIndex={-1}
    >
      <div
        className="rounded-lg p-5 w-full max-w-sm space-y-4"
        style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      >
        <h3 id="delete-video-dialog-title" className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Remove Video?
        </h3>
        <p className="text-base" style={{ color: "var(--color-text-secondary)" }}>
          This will permanently delete <strong>{video.name}</strong>
          {clipCount > 0 && (
            <> and its <strong>{clipCount}</strong> associated clip{clipCount === 1 ? "" : "s"}</>
          )}.
          This action cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-base font-medium"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
            data-testid="cancel-delete-video"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded text-base font-medium"
            style={{ backgroundColor: "var(--color-danger, #ef4444)", color: "var(--color-text-on-accent)" }}
            data-testid="confirm-delete-video"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default VideoList;
