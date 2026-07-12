import { CheckCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastTone = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  title: string;
  detail?: string;
  tone: ToastTone;
}

interface ToastViewportProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const TONE_STYLES: Record<ToastTone, { color: string; Icon: typeof Info }> = {
  success: { color: "var(--color-success)", Icon: CheckCircle },
  error: { color: "var(--color-danger)", Icon: AlertTriangle },
  info: { color: "var(--color-accent)", Icon: Info },
};

function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed right-4 bottom-10 z-50 flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2"
      role="status"
      aria-live="polite"
      data-testid="toast-viewport"
    >
      {toasts.map((toast) => {
        const { color, Icon } = TONE_STYLES[toast.tone];
        return (
          <div
            key={toast.id}
            className="rounded-lg p-3 shadow-lg"
            style={{
              backgroundColor: "var(--color-surface-alt)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
            data-testid={`toast-${toast.tone}`}
          >
            <div className="flex items-start gap-2">
              <Icon size={16} className="mt-0.5 shrink-0" style={{ color }} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-md">{toast.title}</div>
                {toast.detail && (
                  <div className="mt-0.5 text-base" style={{ color: "var(--color-text-secondary)" }}>
                    {toast.detail}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded"
                style={{ color: "var(--color-text-secondary)" }}
                aria-label={`Dismiss ${toast.title}`}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ToastViewport;
