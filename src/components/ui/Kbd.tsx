import { Fragment } from "react";
import { displayHotkey } from "../../utils/hotkeys";

interface KbdProps {
  /** Tauri accelerator string, e.g. CmdOrControl+Shift+1. */
  hotkey: string;
  emptyLabel?: string;
  "data-testid"?: string;
}

/** Renders a hotkey as keycaps; text content stays "Ctrl+Shift+1" for copy/search. */
function Kbd({ hotkey, emptyLabel = "No hotkey", "data-testid": testId }: KbdProps) {
  const parts = displayHotkey(hotkey).split("+").filter(Boolean);
  if (parts.length === 0) {
    return (
      <span className="text-sm italic" style={{ color: "var(--color-text-secondary)" }} data-testid={testId}>
        {emptyLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-sm" data-testid={testId}>
      {parts.map((part, index) => (
        <Fragment key={`${part}-${index}`}>
          {index > 0 && <span aria-hidden="true" style={{ color: "var(--color-text-secondary)", fontSize: "0.7em" }}>+</span>}
          <kbd
            className="rounded px-1.5 py-0.5 leading-none"
            style={{
              backgroundColor: "var(--color-surface-inset)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderBottomWidth: 2,
            }}
          >
            {part}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}

export default Kbd;
