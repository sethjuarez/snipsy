import { useState, useEffect } from "react";
import { createBackendService } from "../services";

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
    setImporting(true);
    try {
      // In real app, a file dialog would open here.
      // For mock mode, we just simulate an import.
      const videoPath = await backend.importVideo(projectPath, "selected-file.mp4");
      setVideos((prev) => [...prev, videoPath]);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-md font-medium text-gray-700">Imported Videos</h3>
        <button
          onClick={handleImport}
          disabled={importing}
          className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
          data-testid="import-video"
        >
          {importing ? "Importing..." : "Import Video"}
        </button>
      </div>

      {videos.length === 0 ? (
        <p
          className="text-gray-400 text-sm text-center py-4"
          data-testid="no-videos"
        >
          No videos imported yet.
        </p>
      ) : (
        <ul className="space-y-1" data-testid="video-list">
          {videos.map((video, i) => (
            <li
              key={i}
              className="flex items-center gap-2 text-sm text-gray-600 bg-white border border-gray-200 rounded px-3 py-2"
              data-testid={`video-item-${i}`}
            >
              <span className="text-purple-500">🎬</span>
              {video}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default VideoList;
