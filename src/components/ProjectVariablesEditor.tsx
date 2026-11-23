import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import Button from "./ui/Button";
import type { ProjectVariable } from "../types";
import { projectVariableProblems } from "../utils/snippetText";

const fieldStyle = { backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" };

interface ProjectVariablesEditorProps {
  variables: ProjectVariable[];
  /** Rejects with a message on failure; the caller reports it. */
  onSave: (variables: ProjectVariable[]) => Promise<void>;
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

/** Edits the values `{{var:name}}` tokens type. */
function ProjectVariablesEditor({ variables, onSave }: ProjectVariablesEditorProps) {
  const [drafts, setDrafts] = useState(() => toDrafts(variables));
  const [saving, setSaving] = useState(false);
  const next = fromDrafts(drafts);
  const problems = projectVariableProblems(next);
  const changed = JSON.stringify(next) !== JSON.stringify(fromDrafts(toDrafts(variables)));
  const canSave = changed && problems.length === 0 && !saving;

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));

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
      className="space-y-2 pt-2.5"
      style={{ borderTop: "1px solid var(--color-border-subtle)" }}
      data-testid="settings-variables-form"
    >
      <div>
        <div className="text-base font-medium" style={{ color: "var(--color-text)" }}>Variables</div>
        <div className="mt-0.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Type a value anywhere with <code>{"{{var:name}}"}</code>. Change it here and every snippet follows.
        </div>
      </div>
      {drafts.map((draft, index) => (
        <div key={draft.key} className="flex items-start gap-2" data-testid="settings-variable-row">
          <input
            value={draft.name}
            onChange={(event) => update(draft.key, { name: event.target.value.toLowerCase() })}
            placeholder="name"
            aria-label={`Variable ${index + 1} name`}
            className="w-32 rounded px-2 py-1 font-mono text-base"
            style={fieldStyle}
            data-testid="settings-variable-name"
          />
          <input
            value={draft.value}
            onChange={(event) => update(draft.key, { value: event.target.value })}
            placeholder="value"
            aria-label={`Variable ${index + 1} value`}
            className="min-w-0 flex-1 rounded px-2 py-1 text-base"
            style={fieldStyle}
            data-testid="settings-variable-value"
          />
          <input
            value={draft.description}
            onChange={(event) => update(draft.key, { description: event.target.value })}
            placeholder="note (optional)"
            aria-label={`Variable ${index + 1} note`}
            className="w-36 rounded px-2 py-1 text-base"
            style={fieldStyle}
            data-testid="settings-variable-description"
          />
          <Button
            type="button"
            icon={<Trash2 size={12} />}
            aria-label={`Remove variable ${draft.name || index + 1}`}
            onClick={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}
            data-testid="settings-variable-remove"
          />
        </div>
      ))}
      {problems.length > 0 && (
        <p className="text-sm" style={{ color: "var(--color-danger)" }} data-testid="settings-variables-problem">
          {problems[0]}
        </p>
      )}
      <div className="flex justify-between">
        <Button
          type="button"
          icon={<Plus size={12} />}
          onClick={() => setDrafts((current) => [...current, { key: crypto.randomUUID(), name: "", value: "", description: "" }])}
          data-testid="settings-variable-add"
        >
          Add variable
        </Button>
        <Button type="submit" tone="primary" icon={<Save size={12} />} disabled={!canSave} data-testid="settings-variables-save">
          {saving ? "Saving…" : "Save variables"}
        </Button>
      </div>
    </form>
  );
}

export default ProjectVariablesEditor;
