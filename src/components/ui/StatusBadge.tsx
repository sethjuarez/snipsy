import type { ReactNode } from "react";

export type StatusTone = "success" | "warning" | "danger" | "accent" | "muted";

const TONE_COLORS: Record<StatusTone, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning, #d97706)",
  danger: "var(--color-danger)",
  accent: "var(--color-accent)",
  muted: "var(--color-text-secondary)",
};

interface StatusBadgeProps {
  tone?: StatusTone;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
  "data-testid"?: string;
}

function StatusBadge({ tone = "muted", icon, children, title, "data-testid": testId }: StatusBadgeProps) {
  const color = TONE_COLORS[tone];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-sm"
      style={{
        color,
        backgroundColor: tone === "muted" ? "var(--color-surface-inset)" : `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
      title={title}
      data-tone={tone}
      data-testid={testId}
    >
      {icon}
      {children}
      {title && <span className="sr-only">: {title}</span>}
    </span>
  );
}

export default StatusBadge;
