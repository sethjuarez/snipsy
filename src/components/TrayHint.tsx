import { useState } from "react";
import { Info, X } from "lucide-react";
import { isMacPlatform } from "../utils/platform";

const STORAGE_KEY = "snipsy-tray-hint-dismissed";

function getTrayHintCopy() {
  if (isMacPlatform()) {
    return (
      <>
        <strong>Tip:</strong> Keep Snipsy available from the macOS menu bar while demo mode is active.
      </>
    );
  }

  return (
    <>
      <strong>Tip:</strong> Pin Snipsy to your system tray for easy access.
      Right-click taskbar -&gt; Taskbar settings -&gt; Other system tray icons -&gt; toggle <em>Snipsy</em> on.
    </>
  );
}

/**
 * One-time hint banner telling the user how to pin Snipsy's tray icon.
 * Dismissed permanently via localStorage flag.
 */
export default function TrayHint() {
  const [visible, setVisible] = useState(
    () => !localStorage.getItem(STORAGE_KEY)
  );

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 text-sm shrink-0"
      style={{
        backgroundColor: "var(--color-surface-toolbar)",
        borderTop: "1px solid var(--color-border)",
        color: "var(--color-text-secondary)",
      }}
      data-testid="tray-hint"
    >
      <Info size={12} className="shrink-0" style={{ color: "var(--color-accent, #6366f1)" }} />
      <span className="flex-1">
        {getTrayHintCopy()}
      </span>
      <button
        onClick={dismiss}
        className="shrink-0 hover:opacity-80"
        aria-label="Dismiss tray hint"
        data-testid="tray-hint-dismiss"
      >
        <X size={12} />
      </button>
    </div>
  );
}
