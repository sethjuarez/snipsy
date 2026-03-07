import { useState, useEffect, useMemo } from "react";
import { createBackendService } from "../services";
import { FileVideo, Upload, Scissors, Film } from "lucide-react";
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
}

function VideoList({ projectPath, videoSnippets, onCreateClip }: VideoListProps) {
  const [videos, setVideos] = useState<ImportedVideo[]>([]);
  const [importing, setImporting] = useState(false);

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
      // Reload full list to get thumbnail info
      const updated = await backend.getImportedVideos(projectPath);
      setVideos(updated);
    } finally {
      setImporting(false);
    }
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
        <div className="grid grid-cols-2 gap-3" data-testid="video-list">
          {videos.map((video, i) => {
            const thumbUrl = video.thumbnailPath && convertFileSrc
              ? convertFileSrc(video.thumbnailPath)
              : null;
            const count = clipCounts[video.relativePath] || 0;

            return (
              <div
                key={video.relativePath}
                className="rounded-lg overflow-hidden"
                style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
                data-testid={`video-item-${i}`}
              >
                {/* Thumbnail */}
                <div
                  className="relative w-full flex items-center justify-center overflow-hidden"
                  style={{ aspectRatio: "16/9", backgroundColor: "var(--color-surface-inset)" }}
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={video.name}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <FileVideo size={32} style={{ color: "var(--color-text-secondary)", opacity: 0.4 }} />
                  )}
                </div>

                {/* Info */}
                <div className="px-3 py-2.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="text-[12px] font-medium truncate"
                      style={{ color: "var(--color-text)" }}
                      title={video.name}
                    >
                      {video.name}
                    </span>
                    <span
                      className="flex items-center gap-1 text-[11px] shrink-0"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      <Film size={11} /> {count}
                    </span>
                  </div>

                  <button
                    onClick={() => onCreateClip(video)}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-medium"
                    style={{
                      backgroundColor: "var(--color-accent)",
                      color: "#fff",
                    }}
                    data-testid={`create-clip-${i}`}
                  >
                    <Scissors size={11} /> Create Clip
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default VideoList;
