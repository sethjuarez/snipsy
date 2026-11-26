import { useEffect, useState } from "react";
import { AlertTriangle, Clapperboard, Save, Undo2 } from "lucide-react";
import Button from "./ui/Button";
import { DEFAULT_STAGE_CONFIG, type StageConfig, type StageStatus } from "../types";

const mutedStyle = { color: "var(--color-text-secondary)" };
const cardStyle = { backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" };

interface StageViewProps {
  projectPath: string;
  config: StageConfig | null;
  /** `null` while loading. */
  status: StageStatus | null;
  busy: boolean;
  /** Reject with a message on failure; the caller reports it. */
  onSave: (config: StageConfig) => Promise<void>;
  onStage: () => void;
  onUnstage: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const STATE_LABELS: Record<StageStatus["state"], string> = {
  notStaged: "Not staged",
  staging: "Stage didn't finish",
  staged: "Staged",
  degraded: "Staged, needs attention",
  unstaging: "Unstage didn't finish",
};

function Toggle({ label, hint, checked, onChange, testId }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void; testId: string }) {
  return (
    <label className="flex items-start gap-2 text-base" style={{ color: "var(--color-text)" }}>
      <input type="checkbox" className="mt-1" checked={checked} onChange={(event) => onChange(event.target.checked)} data-testid={testId} />
      <span>
        {label}
        <span className="block text-sm" style={mutedStyle}>{hint}</span>
      </span>
    </label>
  );
}

/** Setup → Stage: what Stage changes on this PC for this project, and Stage/Unstage. */
function StageView({ projectPath, config, status, busy, onSave, onStage, onUnstage, onDirtyChange }: StageViewProps) {
  const saved = config ?? DEFAULT_STAGE_CONFIG;
  const [draft, setDraft] = useState<StageConfig>(saved);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  if (status && !status.supported) {
    return (
      <div className="rounded-lg p-4 text-base" style={cardStyle} data-testid="stage-unsupported">
        Stage is Windows-only for now.
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } catch {
      // The caller reports the error.
    } finally {
      setSaving(false);
    }
  };

  const state = status?.state ?? "notStaged";
  const staged = state !== "notStaged";
  const stagedHere = staged && status?.projectPath === projectPath;
  const stagedElsewhere = staged && !stagedHere;
  const anyOn = saved.shared.keepAwake || saved.windows.mouseSonar;
  const frozenDiffers = stagedHere && status?.config && JSON.stringify(status.config) !== JSON.stringify(saved);

  return (
    <div className="space-y-4" data-testid="stage-view">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-3 rounded-lg p-4"
        style={cardStyle}
        data-testid="stage-form"
      >
        <p className="text-base" style={mutedStyle}>
          Stage puts this PC in presenting shape. Unstage puts back what Stage changed. Settings you or another app changed
          since are kept.
        </p>
        <Toggle
          label="Keep awake while Snipsy is running"
          hint="The screen and PC stay on while staged and Snipsy is open."
          checked={draft.shared.keepAwake}
          onChange={(keepAwake) => setDraft({ ...draft, shared: { ...draft.shared, keepAwake } })}
          testId="stage-keep-awake"
        />
        <Toggle
          label="Find my pointer"
          hint="Press Ctrl to show where the mouse pointer is (Windows mouse sonar)."
          checked={draft.windows.mouseSonar}
          onChange={(mouseSonar) => setDraft({ ...draft, windows: { ...draft.windows, mouseSonar } })}
          testId="stage-mouse-sonar"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" tone="primary" icon={<Save size={12} />} disabled={!dirty || saving} data-testid="stage-save">
            {saving ? "Saving…" : "Save"}
          </Button>
          {(dirty || frozenDiffers) && stagedHere && (
            <span className="text-sm" style={mutedStyle} data-testid="stage-next-time">
              Changes apply the next time you Stage.
            </span>
          )}
        </div>
      </form>

      <div className="space-y-3 rounded-lg p-4" style={cardStyle} data-testid="stage-status">
        <div className="flex items-center gap-2 text-base" style={{ color: "var(--color-text)" }}>
          {state === "staged" ? (
            <Clapperboard size={14} style={{ color: "var(--color-success)" }} aria-hidden="true" />
          ) : staged ? (
            <AlertTriangle size={14} style={{ color: "var(--color-warning, #f59e0b)" }} aria-hidden="true" />
          ) : null}
          <span className="font-medium" data-testid="stage-state">{STATE_LABELS[state]}</span>
          {status?.projectName && staged && <span style={mutedStyle}>· {status.projectName}</span>}
        </div>

        {status?.error && (
          <p className="text-sm" role="alert" style={{ color: "var(--color-danger)" }} data-testid="stage-error">{status.error}</p>
        )}
        {stagedElsewhere && (
          <p className="text-sm" style={mutedStyle} data-testid="stage-elsewhere">
            Staged for “{status?.projectName}”. Unstage it first, then Stage this project.
          </p>
        )}
        {staged && status && (status.settings.length > 0 || status.keepAwake.requested) && (
          <ul className="space-y-1 text-sm" style={mutedStyle} data-testid="stage-settings">
            {status.keepAwake.requested && (
              <li>Keep awake: {status.keepAwake.active ? "on" : "not active"}</li>
            )}
            {status.settings.map((setting) => (
              <li key={setting.id}>
                {setting.label}: {setting.drifted ? "changed since staging (Stage again to fix)" : entryLabel(setting.status)}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Button
            tone="success"
            icon={<Clapperboard size={12} />}
            onClick={onStage}
            disabled={busy || stagedElsewhere || state === "unstaging" || (!stagedHere && !anyOn) || !status}
            title={!anyOn && !stagedHere ? "Turn on and save at least one setting first" : undefined}
            data-testid="stage-button"
          >
            {stagedHere ? "Stage again" : "Stage"}
          </Button>
          <Button icon={<Undo2 size={12} />} onClick={onUnstage} disabled={busy || !staged} data-testid="unstage-button">
            Unstage
          </Button>
        </div>
      </div>
    </div>
  );
}

function entryLabel(status: StageStatus["settings"][number]["status"]): string {
  switch (status.state) {
    case "applied":
      return "on";
    case "alreadySet":
      return "already on (left as is)";
    case "pending":
      return "not finished";
    case "failed":
      return `couldn't change it (${status.error})`;
    case "restored":
      return "put back";
    case "conflict":
      return "kept your value";
    case "restoreFailed":
      return `couldn't put it back (${status.error})`;
  }
}

export default StageView;
