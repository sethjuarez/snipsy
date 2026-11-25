import { useEffect, useState } from "react";
import { AlertTriangle, Plus, Save, Trash2 } from "lucide-react";
import Button from "./ui/Button";
import type { ProjectVariable } from "../types";
import { projectVariableProblems } from "../utils/snippetText";
import { usageCount, type VariableUsage } from "../utils/variableUsage";

const fieldStyle = { backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" };
const headerStyle = { color: "var(--color-text-secondary)" };

interface VariablesViewProps {
  variables: ProjectVariable[];
  /** Who references each name, defined or not. */
  usage: ReadonlyMap<string, VariableUsage>;
  /** Rejects with a message on failure; the caller reports it. */
  onSave: (variables: ProjectVariable[]) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

interface Draft {
  key: string;
  name: string;
  value: string;
  description: string;
}

const toDrafts = (variables: ProjectVariable[]): Draft[] =>
  variables.map((variable) => ({
    key: crypto.randomUUID(),
    name: variable.name,
    value: variable.value,
    description: variable.description ?? "",
  }));

const fromDrafts = (drafts: Draft[]): ProjectVariable[] =>
  drafts.map((draft) => ({
    name: draft.name.trim(),
    value: draft.value,
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
  }));

function usedBy(usage: VariableUsage | undefined): string {
  if (!usage) return "";
  return [...usage.snippets.map((title) => `Snippet: ${title}`), ...usage.automations.map((title) => `Automation: ${title}`)].join("\n");
}

/** Setup → Variables: the values `{{var:name}}` fills in, and who uses each one. */
function VariablesView({ variables, usage, onSave, onDirtyChange }: VariablesViewProps) {
  const [drafts, setDrafts] = useState(() => toDrafts(variables));
  const [saving, setSaving] = useState(false);
  const next = fromDrafts(drafts);
  const problems = projectVariableProblems(next);
  const changed = JSON.stringify(next) !== JSON.stringify(fromDrafts(toDrafts(variables)));
  const canSave = changed && problems.length === 0 && !saving;
  const draftNames = new Set(next.map((variable) => variable.name));
  const missing = [...usage.keys()].filter((name) => !draftNames.has(name)).sort();

  useEffect(() => {
    onDirtyChange?.(changed);
  }, [changed, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  const add = (name = "") =>
    setDrafts((current) => [...current, { key: crypto.randomUUID(), name, value: "", description: "" }]);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(next);
    } catch {
      // The caller reports the error.
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-3 rounded-lg p-4"
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      data-testid="variables-form"
    >
      <p className="text-base" style={headerStyle}>
        Use a value anywhere Snipsy reads text with <code>{"{{var:name}}"}</code>: snippet text, and automation URLs and titles.
        Change it here and everything that uses it follows.
      </p>

      {missing.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded px-3 py-2 text-base"
          style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)" }}
          role="alert"
          data-testid="variables-missing"
        >
          <AlertTriangle size={14} style={{ color: "var(--color-warning, #f59e0b)" }} aria-hidden="true" />
          <span>Used but not defined:</span>
          {missing.map((name) => (
            <Button key={name} type="button" icon={<Plus size={12} />} onClick={() => add(name)} title={usedBy(usage.get(name))} data-testid="variables-missing-add">
              {name}
            </Button>
          ))}
        </div>
      )}

      {drafts.length === 0 ? (
        <p className="text-base" style={headerStyle} data-testid="variables-empty">No variables yet.</p>
      ) : (
        <table className="w-full text-base" data-testid="variables-table">
          <thead>
            <tr className="text-left text-sm" style={headerStyle}>
              <th className="pb-1 pr-2 font-medium">Name</th>
              <th className="pb-1 pr-2 font-medium">Value</th>
              <th className="pb-1 pr-2 font-medium">Description</th>
              <th className="pb-1 pr-2 font-medium">Used by</th>
              <th className="pb-1"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft, index) => {
              const uses = usage.get(draft.name.trim());
              const count = usageCount(uses);
              return (
                <tr key={draft.key} data-testid="variable-row">
                  <td className="py-1 pr-2 align-top">
                    <input
                      value={draft.name}
                      onChange={(event) => update(draft.key, { name: event.target.value.toLowerCase() })}
                      placeholder="name"
                      aria-label={`Variable ${index + 1} name`}
                      className="w-36 rounded px-2 py-1 font-mono text-base"
                      style={fieldStyle}
                      data-testid="variable-name"
                    />
                  </td>
                  <td className="py-1 pr-2 align-top">
                    <input
                      value={draft.value}
                      onChange={(event) => update(draft.key, { value: event.target.value })}
                      placeholder={count > 0 ? "empty" : "value"}
                      aria-label={`Variable ${index + 1} value`}
                      className="w-full min-w-0 rounded px-2 py-1 text-base"
                      style={fieldStyle}
                      data-testid="variable-value"
                    />
                  </td>
                  <td className="py-1 pr-2 align-top">
                    <input
                      value={draft.description}
                      onChange={(event) => update(draft.key, { description: event.target.value })}
                      placeholder="optional"
                      aria-label={`Variable ${index + 1} description`}
                      className="w-full min-w-0 rounded px-2 py-1 text-base"
                      style={fieldStyle}
                      data-testid="variable-description"
                    />
                  </td>
                  <td className="py-1 pr-2 align-top whitespace-nowrap text-sm" style={headerStyle} title={usedBy(uses)} data-testid="variable-used-by">
                    <span className="inline-block py-1.5">{count === 0 ? "Unused" : `${count} ${count === 1 ? "item" : "items"}`}</span>
                  </td>
                  <td className="py-1 align-top">
                    <Button
                      type="button"
                      icon={<Trash2 size={12} />}
                      aria-label={`Remove variable ${draft.name || index + 1}`}
                      onClick={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}
                      data-testid="variable-remove"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {problems.length > 0 && (
        <p className="text-sm" style={{ color: "var(--color-danger)" }} data-testid="variables-problem">
          {problems[0]}
        </p>
      )}
      <div className="flex justify-between">
        <Button type="button" icon={<Plus size={12} />} onClick={() => add()} data-testid="variable-add">
          Add variable
        </Button>
        <Button type="submit" tone="primary" icon={<Save size={12} />} disabled={!canSave} data-testid="variables-save">
          {saving ? "Saving…" : "Save variables"}
        </Button>
      </div>
    </form>
  );
}

export default VariablesView;
