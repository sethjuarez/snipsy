import type { VideoSnippet } from "../types";

interface VideoSnippetListProps {
  snippets: VideoSnippet[];
  onEdit: (snippet: VideoSnippet) => void;
  onDelete: (id: string) => void;
}

function VideoSnippetList({ snippets, onEdit, onDelete }: VideoSnippetListProps) {
  if (snippets.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400" data-testid="video-empty-state">
        <p className="text-lg">No video snippets yet</p>
        <p className="text-sm mt-1">Create one from an imported video.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="video-snippet-list">
      {snippets.map((snippet) => (
        <div
          key={snippet.id}
          className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
          data-testid={`video-snippet-${snippet.id}`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="font-medium text-gray-900 truncate">
                {snippet.title}
              </h3>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                {snippet.hotkey}
              </span>
              <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                {snippet.speed}x
              </span>
            </div>
            {snippet.description && (
              <p className="text-sm text-gray-500 mt-0.5 truncate">
                {snippet.description}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              {snippet.videoFile} ({snippet.startTime.toFixed(1)}s –{" "}
              {snippet.endTime.toFixed(1)}s)
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => onEdit(snippet)}
              className="text-sm text-blue-600 hover:text-blue-800"
              data-testid={`video-edit-${snippet.id}`}
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(snippet.id)}
              className="text-sm text-red-600 hover:text-red-800"
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
