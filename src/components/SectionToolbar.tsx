import type { ReactNode } from "react";

export interface ToolbarAction {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  form?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  testId?: string;
  tone?: "primary" | "secondary" | "danger";
}

interface SectionToolbarProps {
  title: string;
  status?: string;
  statusTestId?: string;
  statusTone?: "success" | "muted";
  primaryAction?: ToolbarAction;
  secondaryAction?: ToolbarAction;
  actions?: ToolbarAction[];
}

function getActionStyle(action: ToolbarAction): React.CSSProperties {
  if (action.tone === "danger") {
    return { backgroundColor: "var(--color-danger)", color: "var(--color-text-on-accent)" };
  }
  if (action.tone === "primary") {
    return {
      backgroundColor: action.disabled ? "var(--color-surface-inset)" : "var(--color-accent)",
      color: action.disabled ? "var(--color-text-secondary)" : "var(--color-text-on-accent)",
    };
  }
  return { backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" };
}

function ToolbarButton({ action }: { action: ToolbarAction }) {
  return (
    <button
      type={action.type ?? "button"}
      form={action.form}
      onClick={action.onClick}
      disabled={action.disabled}
      className="flex items-center gap-1 px-3 py-1 rounded text-sm font-medium disabled:opacity-50"
      style={getActionStyle(action)}
      data-testid={action.testId}
    >
      {action.icon}
      {action.label}
    </button>
  );
}

function SectionToolbar({
  title,
  status,
  statusTestId = "toolbar-status",
  statusTone = "muted",
  primaryAction,
  secondaryAction,
  actions = [],
}: SectionToolbarProps) {
  return (
    <div
      className="flex items-center justify-between px-4 shrink-0"
      data-testid="content-header"
      style={{
        height: 40,
        borderBottom: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <h2 className="text-md font-semibold truncate" style={{ color: "var(--color-text)" }}>
        {title}
      </h2>
      <div className="flex items-center gap-2">
        {status && (
          <span
            className="max-w-40 truncate text-xs"
            style={{ color: statusTone === "success" ? "var(--color-success)" : "var(--color-text-secondary)" }}
            title={status}
            data-testid={statusTestId}
          >
            {status}
          </span>
        )}
        {actions.map((action) => (
          <ToolbarButton key={action.testId ?? action.label} action={action} />
        ))}
        {primaryAction && <ToolbarButton action={{ tone: "primary", ...primaryAction }} />}
        {secondaryAction && <ToolbarButton action={{ tone: "secondary", ...secondaryAction }} />}
      </div>
    </div>
  );
}

export default SectionToolbar;
