import type { TextSnippet } from "../types";

interface TextSnippetListProps {
  snippets: TextSnippet[];
  onEdit: (snippet: TextSnippet) => void;
  onDelete: (id: string) => void;
}

function TextSnippetList({ snippets, onEdit, onDelete }: TextSnippetListProps) {
  if (snippets.length === 0) {
    return (
      <div className="text-center py-12" data-testid="empty-state" style={{ color: "var(--color-text-secondary)" }}>
        <p className="text-[13px]">No text snippets yet</p>
        <p className="text-[12px] mt-1">Create one to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="text-snippet-list">
      {snippets.map((snippet) => (
        <div
          key={snippet.id}
          className="flex items-center justify-between rounded-lg px-4 py-3"
          data-testid={`snippet-${snippet.id}`}
          style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="font-medium truncate text-[13px]" style={{ color: "var(--color-text)" }}>
                {snippet.title}
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded font-mono" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}>
                {snippet.hotkey}
              </span>
              <span
                className="text-[11px] px-2 py-0.5 rounded"
                style={snippet.delivery === "fast-type"
                  ? { backgroundColor: "var(--color-surface-inset)", color: "var(--color-accent)" }
                  : { backgroundColor: "var(--color-surface-inset)", color: "var(--color-success)" }}
              >
                {snippet.delivery}
              </span>
            </div>
            {snippet.description && (
              <p className="text-[12px] mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
                {snippet.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => onEdit(snippet)}
              className="text-[12px]"
              data-testid={`edit-${snippet.id}`}
              style={{ color: "var(--color-accent)" }}
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(snippet.id)}
              className="text-[12px]"
              data-testid={`delete-${snippet.id}`}
              style={{ color: "var(--color-danger)" }}
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
