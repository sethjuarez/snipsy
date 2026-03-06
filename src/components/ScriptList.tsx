import type { Script } from "../types";

interface ScriptListProps {
  scripts: Script[];
  onEdit: (script: Script) => void;
  onDelete: (id: string) => void;
}

function ScriptList({ scripts, onEdit, onDelete }: ScriptListProps) {
  if (scripts.length === 0) {
    return (
      <div
        className="text-center py-8"
        style={{ color: "var(--color-text-secondary)" }}
        data-testid="script-empty-state"
      >
        <p className="text-[13px]">No scripts yet</p>
        <p className="text-[12px] mt-1">
          Create a script to automate demo recordings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="script-list">
      {scripts.map((script) => (
        <div
          key={script.id}
          className="flex items-center justify-between rounded-lg px-4 py-3"
          style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
          data-testid={`script-${script.id}`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="font-medium truncate text-[13px]" style={{ color: "var(--color-text)" }}>
                {script.title}
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-warning)" }}>
                {script.steps.length} step{script.steps.length !== 1 && "s"}
              </span>
            </div>
            {script.description && (
              <p className="text-[12px] mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
                {script.description}
              </p>
            )}
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
              Output: {script.outputVideo}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => onEdit(script)}
              className="text-[12px]"
              style={{ color: "var(--color-accent)" }}
              data-testid={`script-edit-${script.id}`}
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(script.id)}
              className="text-[12px]"
              style={{ color: "var(--color-danger)" }}
              data-testid={`script-delete-${script.id}`}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ScriptList;
