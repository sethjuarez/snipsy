import { AlertTriangle, Copy, History, Pencil, Play, Plus, Trash2, Workflow } from "lucide-react";
import EmptyState from "./EmptyState";
import type { Script } from "../types";
import { hotkeyProblem, type HotkeyOwner } from "../utils/hotkeys";
import Button from "./ui/Button";
import Kbd from "./ui/Kbd";
import ListRow from "./ui/ListRow";
import StatusBadge from "./ui/StatusBadge";
import type { MenuItem } from "./ui/Menu";

interface ScriptListProps {
  automations: Script[];
  onEdit: (script: Script) => void;
  onDelete: (id: string) => void;
  onRun?: (scriptId: string) => void;
  onDuplicate?: (script: Script) => void;
  onAdd?: () => void;
  runningScriptId?: string | null;
  runHistory?: AutomationRunHistoryItem[];
  hotkeyOwners?: HotkeyOwner[];
}

export interface AutomationRunHistoryItem {
  scriptId: string;
  title: string;
  status: "success" | "error";
  message: string;
  completedAt: string;
}

function ScriptList({ automations, onEdit, onDelete, onRun, onDuplicate, onAdd, runningScriptId, runHistory = [], hotkeyOwners }: ScriptListProps) {
  if (automations.length === 0) {
    return (
      <EmptyState
        icon={Workflow}
        title="No automations yet"
        description="Automations run a sequence of actions, like opening the sites your demo needs."
        action={onAdd ? { label: "Add automation", icon: <Plus size={12} />, onClick: onAdd, testId: "empty-add-automation" } : undefined}
        tip="Tip: run an automation before you present to set up every browser tab."
        data-testid="automation-empty-state"
      />
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
          onDuplicate={onDuplicate}
          running={runningScriptId === script.id}
          lastRun={runHistory.find((item) => item.scriptId === script.id)}
          hotkeyOwners={hotkeyOwners}
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
  onDuplicate,
  running,
  lastRun,
  hotkeyOwners,
}: {
  script: Script;
  onEdit: (script: Script) => void;
  onDelete: (id: string) => void;
  onRun?: (scriptId: string) => void;
  onDuplicate?: (script: Script) => void;
  running: boolean;
  lastRun?: AutomationRunHistoryItem;
  hotkeyOwners?: HotkeyOwner[];
}) {
  const actionCount = script.contributionGroups?.reduce((sum, group) => sum + group.contributions.length, 0) ?? 0;
  const problem = hotkeyOwners ? hotkeyProblem(script.hotkey, hotkeyOwners, script.id, true) : null;
  const menuItems: MenuItem[] = [
    ...(onRun ? [{ id: "run", label: "Run now", icon: <Play size={12} />, onSelect: () => onRun(script.id), disabled: running }] : []),
    { id: "edit", label: "Edit", icon: <Pencil size={12} />, onSelect: () => onEdit(script) },
    ...(onDuplicate ? [{ id: "duplicate", label: "Duplicate", icon: <Copy size={12} />, onSelect: () => onDuplicate(script) }] : []),
    { id: "delete", label: "Delete", icon: <Trash2 size={12} />, onSelect: () => onDelete(script.id), danger: true, separated: true },
  ];

  return (
    <ListRow
      menuItems={menuItems}
      menuLabel={`More actions for ${script.title}`}
      data-testid={`automation-${script.id}`}
      actions={
        <>
          {onRun && (
            <Button
              tone="success"
              icon={<Play size={12} />}
              onClick={() => onRun(script.id)}
              disabled={running}
              style={{ cursor: running ? "progress" : "pointer" }}
              aria-label={`${running ? "Running" : "Run"} ${script.title}`}
              data-testid={`automation-run-${script.id}`}
            >
              {running ? "Running..." : "Run"}
            </Button>
          )}
          <Button tone="ghost" icon={<Pencil size={12} />} onClick={() => onEdit(script)} aria-label={`Edit ${script.title}`} data-testid={`automation-edit-${script.id}`}>
            Edit
          </Button>
          <Button tone="danger" icon={<Trash2 size={12} />} onClick={() => onDelete(script.id)} aria-label={`Delete ${script.title}`} data-testid={`automation-delete-${script.id}`}>
            Delete
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 min-w-0">
        <h3 className="font-medium truncate text-md" style={{ color: "var(--color-text)" }}>
          {script.title}
        </h3>
        {script.hotkey && <Kbd hotkey={script.hotkey} />}
        <StatusBadge tone={actionCount > 0 ? "accent" : "warning"} data-testid={`automation-count-${script.id}`}>
          {actionCount === 0 ? "No actions" : `${actionCount} action${actionCount === 1 ? "" : "s"}`}
        </StatusBadge>
        {problem && (
          <StatusBadge tone={problem.tone} icon={<AlertTriangle size={10} />} title={problem.detail} data-testid={`automation-status-${script.id}`}>
            {problem.label}
          </StatusBadge>
        )}
        {lastRun?.status === "error" && (
          <StatusBadge tone="danger" icon={<AlertTriangle size={10} />} title={lastRun.message} data-testid={`automation-failed-${script.id}`}>
            Last run failed
          </StatusBadge>
        )}
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
    </ListRow>
  );
}

export default ScriptList;
