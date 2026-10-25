import { useCallback, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { MoreHorizontal } from "lucide-react";
import IconButton from "./IconButton";
import Menu, { type MenuCloseReason, type MenuItem } from "./Menu";

interface ListRowProps {
  children: ReactNode;
  /** Always-visible actions on the right. */
  actions?: ReactNode;
  /** Shown in the "More" menu and on right-click. */
  menuItems?: MenuItem[];
  /** Accessible name of the row's menu, e.g. "Actions for Intro". */
  menuLabel: string;
  leading?: ReactNode;
  rowRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  className?: string;
  "data-testid"?: string;
}

/** Standard list row: leading slot, content, actions, plus a "More" / context menu. */
function ListRow({
  children,
  actions,
  menuItems = [],
  menuLabel,
  leading,
  rowRef,
  style,
  className = "",
  "data-testid": testId,
}: ListRowProps) {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback((reason: MenuCloseReason) => {
    setMenuPosition(null);
    // Keyboard and selection closes return focus to the trigger; the selected action may move it again.
    if (reason !== "outside") moreRef.current?.focus();
  }, []);
  const hasMenu = menuItems.length > 0;

  return (
    <div
      ref={rowRef}
      className={`group flex items-center gap-3 rounded-lg px-4 py-3 ${className}`}
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)", ...style }}
      onContextMenu={hasMenu
        ? (event) => {
          event.preventDefault();
          setMenuPosition({ x: event.clientX, y: event.clientY });
        }
        : undefined}
      data-testid={testId}
    >
      {leading}
      <div className="min-w-0 flex-1">{children}</div>
      {(actions || hasMenu) && (
        <div className="ml-2 flex shrink-0 items-center gap-2">
          {actions}
          {hasMenu && (
            <IconButton
              ref={moreRef}
              label={menuLabel}
              icon={<MoreHorizontal size={14} />}
              aria-haspopup="menu"
              aria-expanded={menuPosition !== null}
              onClick={() => {
                const rect = moreRef.current?.getBoundingClientRect();
                setMenuPosition(rect ? { x: rect.right - 180, y: rect.bottom + 4 } : { x: 0, y: 0 });
              }}
              data-testid={testId ? `${testId}-more` : undefined}
            />
          )}
        </div>
      )}
      {menuPosition && hasMenu && (
        <Menu
          items={menuItems}
          position={menuPosition}
          label={menuLabel}
          onClose={closeMenu}
          data-testid={testId ? `${testId}-menu` : undefined}
        />
      )}
    </div>
  );
}

export default ListRow;
