import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonTone = "primary" | "secondary" | "danger" | "success" | "ghost";

const TONE_STYLES: Record<ButtonTone, { color: string; backgroundColor: string; border?: string }> = {
  primary: { color: "var(--color-text-on-accent)", backgroundColor: "var(--color-accent)" },
  secondary: { color: "var(--color-text)", backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" },
  danger: { color: "var(--color-danger)", backgroundColor: "var(--color-surface-inset)" },
  success: { color: "var(--color-success)", backgroundColor: "var(--color-surface-inset)" },
  ghost: { color: "var(--color-accent)", backgroundColor: "var(--color-surface-inset)" },
};

export function toneStyle(tone: ButtonTone) {
  return TONE_STYLES[tone];
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  tone?: ButtonTone;
  icon?: ReactNode;
  children?: ReactNode;
  "data-testid"?: string;
}

function Button({ tone = "secondary", icon, children, className = "", style, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-base disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{ ...TONE_STYLES[tone], ...style }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export default Button;
