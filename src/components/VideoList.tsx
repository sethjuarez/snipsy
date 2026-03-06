import { useState, useEffect } from "react";
import { createBackendService } from "../services";
import { FileVideo, Upload } from "lucide-react";

const backend = createBackendService();

interface VideoListProps {
  projectPath: string;
}

function VideoList({ projectPath }: VideoListProps) {
  const [videos, setVideos] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    backend.getImportedVideos(projectPath).then(setVideos);
  }, [projectPath]);

  const handleImport = async () => {
    const filePath = await backend.selectVideoFile();
    if (!filePath) return; // user cancelled

    setImporting(true);
    try {
      const videoPath = await backend.importVideo(projectPath, filePath);
      setVideos((prev) => [...prev, videoPath]);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Imported Videos</h3>
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
          className="text-center py-4 text-[12px]"
          style={{ color: "var(--color-text-secondary)" }}
          data-testid="no-videos"
        >
          No videos imported yet.
        </p>
      ) : (
        <ul className="space-y-1" data-testid="video-list">
          {videos.map((video, i) => (
            <li
              key={i}
              className="flex items-center gap-2 text-[12px] rounded px-3 py-2"
              style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              data-testid={`video-item-${i}`}
            >
              <FileVideo size={14} style={{ color: "var(--color-accent)" }} />
              {video}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default VideoList;
