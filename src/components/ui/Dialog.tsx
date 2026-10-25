import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { matchesShortcut } from "../../commands/catalog";
import IconButton from "./IconButton";

/** App-level shortcuts that must still reach the window while a dialog is open. */
const PASSTHROUGH_SHORTCUTS = ["CmdOrControl+K", "CmdOrControl+/", "CmdOrControl+,"];

interface DialogProps {
  title: string;
  /** Visually hide the heading when the content already explains itself. */
  hideTitle?: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** Align near the top (palette style) instead of centered. */
  placement?: "center" | "top";
  showClose?: boolean;
  "data-testid"?: string;
}

/** Modal dialog with focus trap, Escape and backdrop-click dismissal. */
function Dialog({
  title,
  hideTitle = false,
  onClose,
  children,
  width = 480,
  placement = "center",
  showClose = true,
  "data-testid": testId,
}: DialogProps) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const titleId = useId();

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center ${placement === "top" ? "items-start pt-[12vh]" : "items-center"}`}
      style={{ backgroundColor: "var(--color-overlay)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="rounded-lg w-full mx-4 flex flex-col overflow-hidden"
        style={{
          maxWidth: width,
          maxHeight: placement === "top" ? "70vh" : "80vh",
          backgroundColor: "var(--color-surface-alt)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.35)",
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }
          // Keep keystrokes (e.g. Ctrl+S) from reaching editors behind the modal.
          if (!PASSTHROUGH_SHORTCUTS.some((shortcut) => matchesShortcut(event, shortcut))) event.stopPropagation();
        }}
        data-testid={testId}
      >
        <div className={hideTitle ? "sr-only" : "flex items-center justify-between gap-2 px-4 pt-3 pb-2"}>
          <h2 id={titleId} className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            {title}
          </h2>
          {showClose && !hideTitle && (
            <IconButton label="Close" tone="ghost" icon={<X size={14} />} onClick={onClose} data-testid={testId ? `${testId}-close` : undefined} />
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export default Dialog;
