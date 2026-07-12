import { AlertTriangle, CheckCircle, History, Pencil, Trash2, Monitor, Play } from "lucide-react";
import EmptyState from "./EmptyState";
import type { Script, ScriptStep } from "../types";

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

function getPortability(script: Script): { state: "portable" | "review"; label: string; detail: string } {
  if (script.platform) {
    return {
      state: "review",
      label: "Platform-specific",
      detail: `Recorded on ${PLATFORM_LABELS[script.platform] ?? script.platform}. Review before reusing on another OS.`,
    };
  }

  const coordinateStep = script.steps.find((step: ScriptStep) =>
    step.action === "click" || step.action === "move" || (step.action === "scroll" && (step.x !== undefined || step.y !== undefined)),
  );
  if (coordinateStep) {
    return {
      state: "review",
      label: "Needs review",
      detail: "Uses pointer coordinates, so layout or monitor changes may affect playback.",
    };
  }

  return {
    state: "portable",
    label: "Portable",
    detail: "Uses keyboard, typing, waits, and launch actions only.",
  };
}

function ScriptList({ scripts, onEdit, onDelete, onRun, runningScriptId, runHistory = [] }: ScriptListProps) {
  if (scripts.length === 0) {
    return (
      <EmptyState title="No automations yet" description="Create an automation to run repeatable demo actions." data-testid="script-empty-state" />
    );
  }

  return (
    <div className="space-y-2" data-testid="script-list">
      {scripts.map((script) => (
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
  const portability = getPortability(script);

  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      data-testid={`script-${script.id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="font-medium truncate text-md" style={{ color: "var(--color-text)" }}>
              {script.title}
            </h3>
            <span className="text-sm px-2 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-warning)" }}>
              {script.steps.length} step{script.steps.length !== 1 && "s"}
            </span>
            <span
              className="flex items-center gap-1 text-sm px-2 py-0.5 rounded"
              title={portability.detail}
              style={{
                backgroundColor: "var(--color-surface-inset)",
                color: portability.state === "portable" ? "var(--color-success)" : "var(--color-warning)",
              }}
              data-testid={`script-portability-${script.id}`}
            >
              {portability.state === "portable" ? <CheckCircle size={10} /> : <AlertTriangle size={10} />}
              {portability.label}
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
            Run output: {script.outputVideo}
          </p>
          {lastRun && (
            <p className="flex items-center gap-1 text-sm mt-1" style={{ color: lastRun.status === "success" ? "var(--color-success)" : "var(--color-danger)" }} data-testid={`script-last-run-${script.id}`}>
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
              data-testid={`script-run-${script.id}`}
              aria-label={`${running ? "Running" : "Run"} ${script.title}`}
            >
              <Play size={12} /> {running ? "Running..." : "Run"}
            </button>
          )}
          <button
            onClick={() => onEdit(script)}
            className="flex items-center gap-1 text-base"
            style={{ color: "var(--color-accent)" }}
            data-testid={`script-edit-${script.id}`}
            aria-label={`Edit ${script.title}`}
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={() => onDelete(script.id)}
            className="flex items-center gap-1 text-base"
            style={{ color: "var(--color-danger)" }}
            data-testid={`script-delete-${script.id}`}
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
