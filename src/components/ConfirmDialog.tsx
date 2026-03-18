import { useFocusTrap } from "../hooks/useFocusTrap";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  "data-testid"?: string;
}

function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
  "data-testid": testId,
}: ConfirmDialogProps) {
  const trapRef = useFocusTrap<HTMLDivElement>();

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "var(--color-overlay)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      tabIndex={-1}
      data-testid={testId}
    >
      <div
        className="rounded-lg p-5 w-full max-w-sm space-y-4"
        style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      >
        <h3 id="confirm-dialog-title" className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          {title}
        </h3>
        <p className="text-base" style={{ color: "var(--color-text-secondary)" }}>
          {message}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-base font-medium"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
            data-testid="confirm-dialog-cancel"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded text-base font-medium"
            style={{
              backgroundColor: danger ? "var(--color-danger)" : "var(--color-accent)",
              color: "var(--color-text-on-accent)",
            }}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
