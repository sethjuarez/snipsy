import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import type { PauseStop } from "../types";
import {
  detectMomentImportMode,
  formatImportTime,
  parseMomentList,
  planMomentImport,
  type MomentImportMode,
  type MomentImportRowStatus,
} from "../utils/momentImport";

interface MomentImportDialogProps {
  initialText: string;
  startTime: number;
  endTime: number;
  fps?: number;
  existingStops: PauseStop[];
  onApply: (stops: PauseStop[]) => void;
  onCancel: () => void;
}

const MODE_LABELS: Record<MomentImportMode, string> = {
  timecodes: "Timecodes",
  durations: "Section lengths",
};

const MODE_HINTS: Record<MomentImportMode, string> = {
  timecodes: "Each line is a time in the video, like 0:29 or 1:03:07. Add a label after it if you like.",
  durations: "Each line is how long a section runs, like 29s or 1 min 3 sec. Moments go between sections.",
};

const STATUS_COLORS: Record<MomentImportRowStatus, string> = {
  moment: "var(--color-accent)",
  info: "var(--color-text-secondary)",
  skipped: "var(--color-warning)",
  error: "var(--color-danger)",
};

const PLACEHOLDER = `0:29 Setup
0:56 Demo
1:37 Wrap up

or section lengths:
29 seconds
1 minute 3 seconds`;

function MomentImportDialog({
  initialText,
  startTime,
  endTime,
  fps,
  existingStops,
  onApply,
  onCancel,
}: MomentImportDialogProps) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(initialText);
  const [chosenMode, setChosenMode] = useState<MomentImportMode | null>(null);

  const entries = useMemo(() => parseMomentList(text, { fps }), [fps, text]);
  const detectedMode = useMemo(() => detectMomentImportMode(entries), [entries]);
  const mode = chosenMode ?? detectedMode;
  const plan = useMemo(() => planMomentImport(entries, mode, startTime, endTime), [endTime, entries, mode, startTime]);
  const clipLength = Math.max(endTime - startTime, 0);
  const lostExtras = existingStops.filter((stop) => stop.spotlight || stop.zoom).length;
  const problemCount = plan.rows.filter((row) => row.status === "skipped" || row.status === "error").length;
  const hasUsableRows = plan.rows.some((row) => row.status === "moment" || row.status === "info");
  // A valid list can mean "no moments" (one section), which still rewrites existing ones.
  const canApply = hasUsableRows && (plan.stops.length > 0 || existingStops.length > 0);

  useEffect(() => {
    const textarea = textRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  const apply = () => {
    if (canApply) onApply(plan.stops);
  };

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--color-overlay)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="moment-import-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          apply();
        }
      }}
      tabIndex={-1}
      data-testid="moment-import-dialog"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 rounded-lg p-5"
        style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 id="moment-import-title" className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            Paste moments
          </h3>
          <div
            className="flex rounded p-0.5"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
            role="group"
            aria-label="List type"
          >
            {(Object.keys(MODE_LABELS) as MomentImportMode[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => setChosenMode(option)}
                className="rounded px-2.5 py-1 text-sm"
                style={{
                  color: mode === option ? "var(--color-text-on-accent)" : "var(--color-text)",
                  backgroundColor: mode === option ? "var(--color-accent)" : "transparent",
                }}
                data-testid={`moment-import-mode-${option}`}
              >
                {MODE_LABELS[option]}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }} data-testid="moment-import-hint">
          {MODE_HINTS[mode]}
          {chosenMode === null && entries.some((entry) => entry.seconds !== undefined) && " (detected)"}
        </p>

        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={7}
          spellCheck={false}
          className="w-full resize-y rounded px-2 py-1.5 font-mono text-sm"
          style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
          aria-label="Times to import"
          data-testid="moment-import-text"
        />

        <div
          className="relative h-3 rounded"
          style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
          aria-hidden="true"
          data-testid="moment-import-timeline"
        >
          {clipLength > 0 && plan.stops.map((stop) => (
            <span
              key={stop.time}
              className="absolute top-0 h-full w-0.5"
              style={{ left: `${((stop.time - startTime) / clipLength) * 100}%`, backgroundColor: "var(--color-accent)" }}
            />
          ))}
        </div>

        {plan.rows.length > 0 && (
          <div className="min-h-0 flex-1 overflow-auto rounded" style={{ border: "1px solid var(--color-border)" }}>
            <table className="w-full text-sm" data-testid="moment-import-rows">
              <tbody>
                {plan.rows.map((row, index) => (
                  <tr
                    key={`${row.line}-${index}`}
                    style={{ borderTop: index ? "1px solid var(--color-border)" : undefined }}
                    data-status={row.status}
                    data-testid="moment-import-row"
                  >
                    <td className="w-8 px-2 py-1 text-right font-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      {row.line}
                    </td>
                    <td className="max-w-[14rem] truncate px-2 py-1 font-mono" style={{ color: "var(--color-text)" }} title={row.source}>
                      {row.source}
                    </td>
                    <td className="px-2 py-1" style={{ color: STATUS_COLORS[row.status] }}>
                      {row.time !== undefined && (
                        <span className="font-mono">
                          {row.status === "moment" ? "◆ " : ""}
                          {formatImportTime(row.time)}
                        </span>
                      )}
                      {row.status === "moment" && row.label && <span> · {row.label}</span>}
                      {row.message && <span className="ml-1 text-xs">{row.time !== undefined ? `— ${row.message}` : row.message}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {plan.notes.map((note) => (
          <p key={note} className="text-sm" style={{ color: STATUS_COLORS.skipped }} data-testid="moment-import-note">
            {note}
          </p>
        ))}

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }} data-testid="moment-import-summary">
            {plan.stops.length} moment{plan.stops.length === 1 ? "" : "s"}
            {existingStops.length > 0 && ` replace the current ${existingStops.length}`}
            {problemCount > 0 && ` · ${problemCount} line${problemCount === 1 ? "" : "s"} skipped`}
            {lostExtras > 0 && canApply && (
              <span style={{ color: "var(--color-danger)" }} data-testid="moment-import-loss-warning">
                {` · ${lostExtras} spotlight/zoom moment${lostExtras === 1 ? "" : "s"} will be removed`}
              </span>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-base font-medium"
              style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
              data-testid="moment-import-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!canApply}
              className="rounded px-3 py-1.5 text-base font-medium disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)", color: "var(--color-text-on-accent)" }}
              title="Replace this clip's moments (Ctrl+Enter)"
              data-testid="moment-import-apply"
            >
              {plan.stops.length === 0 && existingStops.length > 0
                ? "Clear moments"
                : existingStops.length > 0 ? "Replace moments" : "Add moments"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MomentImportDialog;
