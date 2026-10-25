import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, FileText, Film, Keyboard, Pencil, Workflow, X } from "lucide-react";
import type { Script, TextSnippet, VideoSnippet } from "../types";
import type { HotkeyIssue } from "../services/backendService";
import {
  assignHotkeys,
  collectHotkeyOwners,
  formatKeyCombo,
  validateHotkey,
  type HotkeyAssignment,
  type HotkeyKind,
  type HotkeyOwner,
} from "../utils/hotkeys";
import Button from "./ui/Button";
import EmptyState from "./EmptyState";
import Kbd from "./ui/Kbd";
import StatusBadge, { type StatusTone } from "./ui/StatusBadge";

interface HotkeysTableProps {
  textSnippets: TextSnippet[];
  videoSnippets: VideoSnippet[];
  automations: Script[];
  demoMode: boolean;
  /** Hotkeys the last demo registration could not arm. */
  issues?: HotkeyIssue[];
  /** Set when an edit was saved but live demo hotkeys could not be refreshed. */
  syncError?: string | null;
  onChangeHotkey: (owner: HotkeyOwner, hotkey: string) => Promise<void>;
  onOpen: (owner: HotkeyOwner) => void;
}

const KIND_LABEL: Record<HotkeyKind, string> = { text: "Text", video: "Clip", automation: "Automation" };
const KIND_ICON: Record<HotkeyKind, typeof FileText> = { text: FileText, video: Film, automation: Workflow };

function statusBadge(item: HotkeyAssignment, demoMode: boolean): { tone: StatusTone; label: string; detail?: string } {
  switch (item.state) {
    case "armed":
      return demoMode ? { tone: "success", label: "Armed" } : { tone: "success", label: "Ready" };
    case "failed":
      return { tone: "danger", label: "Not registered", detail: item.detail };
    case "duplicate":
      return { tone: "danger", label: "Duplicate", detail: item.detail };
    case "invalid":
      return { tone: "danger", label: "Invalid", detail: item.detail };
    case "unassigned":
      return item.owner.kind === "automation"
        ? { tone: "muted", label: "Optional", detail: "Automations can run from Stream Deck or the palette without a hotkey." }
        : { tone: "warning", label: "No hotkey", detail: "Assign a hotkey so this works in demo mode." };
  }
}

const isProblem = (item: HotkeyAssignment) =>
  item.state === "duplicate" || item.state === "invalid" || item.state === "failed" || (item.state === "unassigned" && item.owner.kind !== "automation");

/** Every hotkey in the project with what demo mode will do with it. */
function HotkeysTable({ textSnippets, videoSnippets, automations, demoMode, issues = [], syncError, onChangeHotkey, onOpen }: HotkeysTableProps) {
  const owners = useMemo(
    () => [
      ...collectHotkeyOwners(textSnippets, videoSnippets, []),
      ...automations.map<HotkeyOwner>((script) => ({ id: script.id, title: script.title, hotkey: script.hotkey ?? "", kind: "automation" })),
    ],
    [textSnippets, videoSnippets, automations],
  );
  const assignments = useMemo(() => assignHotkeys(owners, demoMode ? issues : []), [owners, demoMode, issues]);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const problemCount = assignments.filter(isProblem).length;
  const armedCount = assignments.filter((item) => item.state === "armed").length;
  const rows = problemsOnly ? assignments.filter(isProblem) : assignments;

  const stopEditing = () => {
    setEditingId(null);
    setError(null);
  };

  const save = async (owner: HotkeyOwner, hotkey: string) => {
    setSaving(true);
    try {
      await onChangeHotkey(owner, hotkey);
      stopEditing();
    } catch (saveError) {
      setError({ id: owner.id, message: `Could not save: ${String(saveError)}` });
    } finally {
      setSaving(false);
    }
  };

  const handleCapture = (owner: HotkeyOwner, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      stopEditing();
      return;
    }
    if (saving) return;
    const combo = formatKeyCombo(event.nativeEvent);
    if (!combo.includes("+") || combo.endsWith("+")) return;
    const status = validateHotkey(combo, owners, owner.id);
    if (status.state !== "available") {
      setError({ id: owner.id, message: status.message });
      return;
    }
    void save(owner, combo);
  };

  if (owners.length === 0) {
    return (
      <EmptyState
        icon={Keyboard}
        title="No hotkeys yet"
        description="Create a text snippet, clip, or automation to assign a hotkey."
        tip="Tip: press Ctrl+K to create anything."
        data-testid="hotkeys-empty-state"
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="hotkeys-view">
      {demoMode && syncError && (
        <p role="alert" className="rounded px-3 py-2 text-sm" style={{ color: "var(--color-danger)", backgroundColor: "color-mix(in srgb, var(--color-danger) 10%, transparent)" }} data-testid="hotkeys-sync-error">
          Changes are saved, but live demo hotkeys weren't updated ({syncError}). Stop and restart the demo to apply them.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="success" data-testid="hotkeys-armed-count">
          {armedCount} {demoMode ? "armed" : "ready"}
        </StatusBadge>
        <StatusBadge tone={problemCount > 0 ? "danger" : "muted"} data-testid="hotkeys-problem-count">
          {problemCount} {problemCount === 1 ? "problem" : "problems"}
        </StatusBadge>
        <Button
          className="ml-auto"
          tone={problemsOnly ? "primary" : "secondary"}
          aria-pressed={problemsOnly}
          onClick={() => setProblemsOnly((value) => !value)}
          data-testid="hotkeys-problems-only"
        >
          Problems only
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-base" style={{ color: "var(--color-text-secondary)" }} data-testid="hotkeys-no-problems">
          No hotkey problems.
        </p>
      ) : (
        <table className="w-full text-base" style={{ borderCollapse: "collapse" }} data-testid="hotkeys-table">
          <thead>
            <tr className="text-left text-sm" style={{ color: "var(--color-text-secondary)" }}>
              <th className="px-2 py-1 font-medium">Hotkey</th>
              <th className="px-2 py-1 font-medium">Item</th>
              <th className="px-2 py-1 font-medium">Type</th>
              <th className="px-2 py-1 font-medium">Status</th>
              <th className="px-2 py-1 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const { owner } = item;
              const badge = statusBadge(item, demoMode);
              const KindIcon = KIND_ICON[owner.kind];
              const editing = editingId === owner.id;
              const rowError = error?.id === owner.id ? error.message : null;
              const title = owner.title || "Untitled";
              return (
                <tr key={owner.id} style={{ borderTop: "1px solid var(--color-border)" }} data-testid={`hotkey-row-${owner.id}`} data-state={item.state}>
                  <td className="px-2 py-1.5 align-top" style={{ minWidth: 180 }}>
                    {editing ? (
                      <input
                          autoFocus
                          readOnly
                          value=""
                          placeholder="Press a key combo…"
                          onKeyDown={(event) => handleCapture(owner, event)}
                          onBlur={stopEditing}
                          className="w-full rounded px-2 py-1 text-sm"
                          style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-accent)" }}
                          aria-label={`New hotkey for ${title}`}
                          aria-invalid={rowError ? true : undefined}
                          aria-describedby={rowError ? `hotkey-error-${owner.id}` : undefined}
                          data-testid={`hotkey-capture-${owner.id}`}
                        />
                    ) : (
                      <Kbd hotkey={owner.hotkey} emptyLabel={owner.kind === "automation" ? "None" : "No hotkey"} />
                    )}
                    {rowError && (
                      <p id={`hotkey-error-${owner.id}`} role="alert" className="mt-1 text-sm" style={{ color: "var(--color-danger)" }} data-testid={`hotkey-error-${owner.id}`}>
                        {rowError}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <button
                      type="button"
                      onClick={() => onOpen(owner)}
                      className="truncate text-left font-medium hover:underline"
                      style={{ color: "var(--color-text)", maxWidth: 260 }}
                      title={`Open ${title}`}
                      data-testid={`hotkey-open-${owner.id}`}
                    >
                      {title}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 align-top" style={{ color: "var(--color-text-secondary)" }}>
                    <span className="inline-flex items-center gap-1">
                      <KindIcon size={12} /> {KIND_LABEL[owner.kind]}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <StatusBadge
                      tone={badge.tone}
                      icon={badge.tone === "danger" || badge.tone === "warning" ? <AlertTriangle size={10} /> : undefined}
                      title={badge.detail}
                      data-testid={`hotkey-status-${owner.id}`}
                    >
                      {badge.label}
                    </StatusBadge>
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <div className="flex justify-end gap-1">
                      <Button
                        tone="ghost"
                        icon={<Pencil size={12} />}
                        onMouseDown={(event) => editing && event.preventDefault()}
                        onClick={() => {
                          setError(null);
                          setEditingId(editing ? null : owner.id);
                        }}
                        aria-label={`Change hotkey for ${title}`}
                        data-testid={`hotkey-change-${owner.id}`}
                      >
                        {editing ? "Cancel" : "Change"}
                      </Button>
                      {owner.kind === "automation" && owner.hotkey && !editing && (
                        <Button
                          tone="danger"
                          icon={<X size={12} />}
                          disabled={saving}
                          onClick={() => void save(owner, "")}
                          aria-label={`Remove hotkey from ${title}`}
                          data-testid={`hotkey-clear-${owner.id}`}
                        >
                          Remove
                        </Button>
                      )}
                      <Button
                        tone="secondary"
                        icon={<ExternalLink size={12} />}
                        onClick={() => onOpen(owner)}
                        aria-label={`Open ${title}`}
                        data-testid={`hotkey-goto-${owner.id}`}
                      >
                        Open
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        When two items share a hotkey, the first one listed wins in demo mode.
      </p>
    </div>
  );
}

export default HotkeysTable;
