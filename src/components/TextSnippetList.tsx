import type { TextSnippet } from "../types";

interface TextSnippetListProps {
  snippets: TextSnippet[];
  onEdit: (snippet: TextSnippet) => void;
  onDelete: (id: string) => void;
}

function TextSnippetList({ snippets, onEdit, onDelete }: TextSnippetListProps) {
  if (snippets.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400" data-testid="empty-state">
        <p className="text-lg">No text snippets yet</p>
        <p className="text-sm mt-1">Create one to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="text-snippet-list">
      {snippets.map((snippet) => (
        <div
          key={snippet.id}
          className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
          data-testid={`snippet-${snippet.id}`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="font-medium text-gray-900 truncate">
                {snippet.title}
              </h3>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                {snippet.hotkey}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  snippet.delivery === "fast-type"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-green-50 text-green-700"
                }`}
              >
                {snippet.delivery}
              </span>
            </div>
            {snippet.description && (
              <p className="text-sm text-gray-500 mt-0.5 truncate">
                {snippet.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => onEdit(snippet)}
              className="text-sm text-blue-600 hover:text-blue-800"
              data-testid={`edit-${snippet.id}`}
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(snippet.id)}
              className="text-sm text-red-600 hover:text-red-800"
              data-testid={`delete-${snippet.id}`}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default TextSnippetList;
