import { History, Pencil, Play, Trash2 } from "lucide-react";
import EmptyState from "./EmptyState";
import type { Script } from "../types";

interface ScriptListProps {
  automations: Script[];
  onEdit: (script: Script) => void;
  onDelete: (id: string) => void;
  onRun?: (scriptId: string) => void;
  runningScriptId?: string | null;
  runHistory?: AutomationRunHistoryItem[];
}

export interface AutomationRunHistoryItem {
  scriptId: string;
  title: string;
  status: "success" | "error";
  message: string;
  completedAt: string;
}

function ScriptList({ automations, onEdit, onDelete, onRun, runningScriptId, runHistory = [] }: ScriptListProps) {
  if (automations.length === 0) {
    return (
      <EmptyState title="No automations yet" description="Create an automation to run repeatable demo actions." data-testid="automation-empty-state" />
    );
  }

  return (
    <div className="space-y-2" data-testid="automation-list">
      {automations.map((script) => (
        <AutomationRow
          key={script.id}
          script={script}
          onEdit={onEdit}
          onDelete={onDelete}
          onRun={onRun}
          running={runningScriptId === script.id}
          lastRun={runHistory.find((item) => item.scriptId === script.id)}
        />
      ))}
    </div>
  );
}

function AutomationRow({
  script,
  onEdit,
  onDelete,
  onRun,
  running,
  lastRun,
}: {
  script: Script;
  onEdit: (script: Script) => void;
  onDelete: (id: string) => void;
  onRun?: (scriptId: string) => void;
  running: boolean;
  lastRun?: AutomationRunHistoryItem;
}) {
  const contributionCount = script.contributionGroups?.reduce((sum, group) => sum + group.contributions.length, 0) ?? 0;

  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      data-testid={`automation-${script.id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="font-medium truncate text-md" style={{ color: "var(--color-text)" }}>
              {script.title}
            </h3>
            <span className="text-sm px-2 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-accent)" }}>
              {contributionCount} contribution{contributionCount !== 1 && "s"}
            </span>
          </div>
          {script.description && (
            <p className="text-base mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
              {script.description}
            </p>
          )}
          {lastRun && (
            <p className="flex items-center gap-1 text-sm mt-1" style={{ color: lastRun.status === "success" ? "var(--color-success)" : "var(--color-danger)" }} data-testid={`automation-last-run-${script.id}`}>
              <History size={11} />
              Last run {new Date(lastRun.completedAt).toLocaleTimeString()}: {lastRun.message}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-4">
          {onRun && (
            <button
              onClick={() => onRun(script.id)}
              disabled={running}
              className="flex items-center gap-1 text-base"
              style={{ color: running ? "var(--color-text-secondary)" : "var(--color-success, #22c55e)", cursor: running ? "progress" : "pointer" }}
              data-testid={`automation-run-${script.id}`}
              aria-label={`${running ? "Running" : "Run"} ${script.title}`}
            >
              <Play size={12} /> {running ? "Running..." : "Run"}
            </button>
          )}
          <button
            onClick={() => onEdit(script)}
            className="flex items-center gap-1 text-base"
            style={{ color: "var(--color-accent)" }}
            data-testid={`automation-edit-${script.id}`}
            aria-label={`Edit ${script.title}`}
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={() => onDelete(script.id)}
            className="flex items-center gap-1 text-base"
            style={{ color: "var(--color-danger)" }}
            data-testid={`automation-delete-${script.id}`}
            aria-label={`Delete ${script.title}`}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScriptList;
