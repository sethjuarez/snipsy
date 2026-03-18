import { Pencil, Trash2, Monitor, Play } from "lucide-react";
import EmptyState from "./EmptyState";
import type { Script } from "../types";

const PLATFORM_LABELS: Record<string, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

interface ScriptListProps {
  scripts: Script[];
  onEdit: (script: Script) => void;
  onDelete: (id: string) => void;
  onRun?: (scriptId: string) => void;
}

function ScriptList({ scripts, onEdit, onDelete, onRun }: ScriptListProps) {
  if (scripts.length === 0) {
    return (
      <EmptyState title="No scripts yet" description="Create a script to automate demo recordings." data-testid="script-empty-state" />
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
              <h3 className="font-medium truncate text-md" style={{ color: "var(--color-text)" }}>
                {script.title}
              </h3>
              <span className="text-sm px-2 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-warning)" }}>
                {script.steps.length} step{script.steps.length !== 1 && "s"}
              </span>
              {script.platform && (
                <span className="flex items-center gap-1 text-sm px-2 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }} data-testid={`script-platform-${script.id}`}>
                  <Monitor size={10} />
                  {PLATFORM_LABELS[script.platform] ?? script.platform}
                </span>
              )}
            </div>
            {script.description && (
              <p className="text-base mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
                {script.description}
              </p>
            )}
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
              Output: {script.outputVideo}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {onRun && (
              <button
                onClick={() => onRun(script.id)}
                className="flex items-center gap-1 text-base"
                style={{ color: "var(--color-success, #22c55e)" }}
                data-testid={`script-run-${script.id}`}
              >
                <Play size={12} /> Replay & Record
              </button>
            )}
            <button
              onClick={() => onEdit(script)}
              className="flex items-center gap-1 text-base"
              style={{ color: "var(--color-accent)" }}
              data-testid={`script-edit-${script.id}`}
            >
              <Pencil size={12} /> Edit
            </button>
            <button
              onClick={() => onDelete(script.id)}
              className="flex items-center gap-1 text-base"
              style={{ color: "var(--color-danger)" }}
              data-testid={`script-delete-${script.id}`}
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ScriptList;
