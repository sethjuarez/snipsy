import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type MenuCloseReason = "escape" | "tab" | "outside" | "select";

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Draws a separator above this item. */
  separated?: boolean;
}

interface MenuProps {
  items: MenuItem[];
  /** Viewport coordinates of the menu's top-left corner. */
  position: { x: number; y: number };
  label: string;
  onClose: (reason: MenuCloseReason) => void;
  "data-testid"?: string;
}

const MENU_WIDTH = 180;

/** Floating action menu: arrow keys move, Enter selects, Escape or an outside click closes. */
function Menu({ items, position, label, onClose, "data-testid": testId }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = ref.current;
    menu?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();

    const handlePointer = (event: MouseEvent) => {
      if (menu && !menu.contains(event.target as Node)) onClose("outside");
    };
    const handleBlur = () => onClose("outside");
    document.addEventListener("mousedown", handlePointer);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("resize", handleBlur);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("resize", handleBlur);
    };
  }, [onClose]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const enabled = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const index = enabled.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose("escape");
    } else if (event.key === "Tab") {
      // Focus returns to the trigger synchronously, so the default Tab moves on from there.
      onClose("tab");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      enabled[(index + 1) % enabled.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      enabled[(index - 1 + enabled.length) % enabled.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      enabled[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      enabled[enabled.length - 1]?.focus();
    }
  };

  const left = Math.max(4, Math.min(position.x, window.innerWidth - MENU_WIDTH - 4));
  const top = Math.max(4, Math.min(position.y, window.innerHeight - items.length * 32 - 12));

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="fixed z-50 rounded-lg py-1 shadow-lg"
      style={{
        left,
        top,
        width: MENU_WIDTH,
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      data-testid={testId}
    >
      {items.map((item) => (
        <div key={item.id}>
          {item.separated && <div className="my-1 h-px" style={{ backgroundColor: "var(--color-border)" }} role="separator" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-base outline-none hover:bg-[var(--color-surface-inset)] focus:bg-[var(--color-surface-inset)] disabled:opacity-50"
            style={{ color: item.danger ? "var(--color-danger)" : "var(--color-text)" }}
            onClick={() => {
              onClose("select");
              item.onSelect();
            }}
            data-testid={testId ? `${testId}-${item.id}` : undefined}
          >
            <span className="flex w-4 justify-center">{item.icon}</span>
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export default Menu;
