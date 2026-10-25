import { useState } from "react";
import { AlertTriangle, CheckCircle, Play, Radio, Square, XCircle } from "lucide-react";
import type { Preflight, PreflightCheck, PreflightState } from "../utils/preflight";
import { DEMO_INTRO_SEEN_KEY } from "../utils/preflight";
import { traySurfaceName } from "../utils/platform";
import Button from "./ui/Button";
import KeepAwakeToggle from "./KeepAwakeToggle";
import Dialog from "./ui/Dialog";

const STATE_ICON: Record<PreflightState, { icon: typeof CheckCircle; color: string; label: string }> = {
  pass: { icon: CheckCircle, color: "var(--color-success)", label: "OK" },
  warn: { icon: AlertTriangle, color: "var(--color-warning, #f59e0b)", label: "Warning" },
  fail: { icon: XCircle, color: "var(--color-danger)", label: "Blocked" },
};

function PreflightList({ checks, testId }: { checks: PreflightCheck[]; testId: string }) {
  return (
    <ul className="space-y-1.5" data-testid={testId}>
      {checks.map((check) => {
        const { icon: Icon, color, label } = STATE_ICON[check.state];
        return (
          <li
            key={check.id}
            className="flex items-start gap-2 rounded px-3 py-2 text-base"
            style={{ backgroundColor: "var(--color-surface-inset)" }}
            data-testid={`preflight-${check.id}`}
            data-state={check.state}
          >
            <Icon size={14} className="mt-0.5 shrink-0" style={{ color }} aria-hidden="true" />
            <span className="min-w-0">
              <span className="sr-only">{label}: </span>
              <span style={{ color: "var(--color-text)" }}>{check.label}</span>
              {check.detail && (
                <span className="block text-sm" style={{ color: "var(--color-text-secondary)" }}>{check.detail}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const STATUS_TEXT: Record<PreflightState, string> = { pass: "Ready", warn: "Ready with warnings", fail: "Not ready" };

interface DemoPreflightPanelProps {
  preflight: Preflight;
  demoMode: boolean;
  projectName: string;
  /** Hotkeys registered while live; defaults to the preflight prediction. */
  liveArmedCount?: number;
  onToggleDemo: () => void;
}

/** Overview card: checklist before a demo, live status while it runs. */
export function DemoPreflightPanel({ preflight, demoMode, projectName, liveArmedCount = preflight.armedCount, onToggleDemo }: DemoPreflightPanelProps) {
  const status = demoMode ? "Live" : STATUS_TEXT[preflight.state];
  const badgeStyle = demoMode
    ? { backgroundColor: "var(--color-danger)", color: "var(--color-text-on-accent)" }
    : preflight.state === "fail"
      ? { backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }
      : { backgroundColor: preflight.state === "pass" ? "var(--color-success)" : "var(--color-warning, #f59e0b)", color: "var(--color-text-on-accent)" };

  return (
    <section
      className="rounded-lg p-4"
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      data-testid="demo-readiness-panel"
      aria-label="Demo readiness"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-md font-semibold flex items-center gap-2" style={{ color: "var(--color-text)" }}>
            <Radio size={16} style={{ color: demoMode ? "var(--color-danger)" : "var(--color-accent)" }} aria-hidden="true" />
            {demoMode ? "Demo is live" : "Demo preflight"}
            <span className="text-sm px-2 py-0.5 rounded font-medium" style={badgeStyle} data-testid="demo-readiness-status">
              {status}
            </span>
          </h3>
          <p className="text-base mt-1" style={{ color: "var(--color-text-secondary)" }} role="status" data-testid="demo-live-status">
            {demoMode
              ? `${projectName} · ${liveArmedCount} hotkey${liveArmedCount === 1 ? "" : "s"} armed. Stop from here or the ${traySurfaceName()} menu.`
              : `Start hides Snipsy to the ${traySurfaceName()} and listens for your hotkeys.`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {!demoMode && <KeepAwakeToggle testId="demo-panel-keep-awake" />}
          <Button
            tone={demoMode ? "danger" : "primary"}
            icon={demoMode ? <Square size={12} fill="currentColor" aria-hidden="true" /> : <Play size={12} fill="currentColor" aria-hidden="true" />}
            onClick={onToggleDemo}
            aria-label={demoMode ? "Stop demo" : "Start demo"}
            data-testid="demo-panel-toggle"
          >
            {demoMode ? "Stop" : "Start"}
          </Button>
        </div>
      </div>
      {!demoMode && (
        <div className="mt-4">
          <PreflightList checks={preflight.checks} testId="demo-preflight-checks" />
        </div>
      )}
    </section>
  );
}

interface DemoStartDialogProps {
  preflight: Preflight;
  onStart: () => void;
  onClose: () => void;
}

/** Explains demo mode before the first start, or when nothing would be armed. */
export function DemoStartDialog({ preflight, onStart, onClose }: DemoStartDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const tray = traySurfaceName();
  const issues = preflight.checks.filter((check) => check.state !== "pass");

  const start = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(DEMO_INTRO_SEEN_KEY, "true");
      } catch {
        // Storage can be unavailable; the dialog just shows again next time.
      }
    }
    onClose();
    onStart();
  };

  return (
    <Dialog title="Start demo?" onClose={onClose} data-testid="demo-start-dialog">
      <div className="px-4 pb-4 space-y-3 overflow-y-auto">
        <ul className="list-disc pl-5 space-y-1 text-base" style={{ color: "var(--color-text)" }}>
          <li data-testid="demo-start-armed">
            {preflight.armedCount === 0
              ? "No hotkeys will be armed."
              : `${preflight.armedCount} hotkey${preflight.armedCount === 1 ? "" : "s"} will listen system-wide.`}
          </li>
          <li>Snipsy hides to the {tray} so your audience won't see it.</li>
          <li>To stop, open the {tray} icon and choose Exit Demo Mode.</li>
        </ul>
        {issues.length > 0 && <PreflightList checks={issues} testId="demo-start-issues" />}
        <label className="flex items-center gap-2 text-base" style={{ color: "var(--color-text-secondary)" }}>
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(event) => setDontShowAgain(event.target.checked)}
            data-testid="demo-start-dont-show"
          />
          Don't show this again
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose} data-testid="demo-start-cancel">Cancel</Button>
          <Button tone="primary" onClick={start} data-testid="demo-start-confirm">
            {preflight.state === "fail" ? "Start anyway" : "Start"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
