import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { toneStyle, type ButtonTone } from "./Button";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label" | "title"> {
  /** Required: used for both the tooltip and the accessible name. */
  label: string;
  icon: ReactNode;
  tone?: ButtonTone;
  "data-testid"?: string;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, tone = "secondary", className = "", style, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded disabled:opacity-50 ${className}`}
      style={{ ...toneStyle(tone), border: undefined, ...style }}
      {...rest}
    >
      {icon}
    </button>
  );
});

export default IconButton;
