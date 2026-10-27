import { LayoutDashboard, FileText, Film, ScrollText, PanelLeftClose, PanelLeftOpen, LogOut, LayoutGrid, Archive, Keyboard, type LucideIcon } from "lucide-react";

export type AppView = "home" | "text-snippets" | "images" | "videos" | "video-snippets" | "automations" | "hotkeys" | "stream-deck";

interface NavSubview {
  id: AppView;
  label: string;
}

interface NavItem {
  id: AppView;
  label: string;
  Icon: LucideIcon;
  /** Views reached through tabs inside this item; the item stays highlighted on them. */
  subviews?: NavSubview[];
}

interface NavSection {
  id: string;
  label?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "main",
    items: [
      { id: "home", label: "Overview", Icon: LayoutDashboard },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { id: "text-snippets", label: "Snippets", Icon: FileText, subviews: [{ id: "images", label: "Images" }] },
      { id: "video-snippets", label: "Clips", Icon: Film, subviews: [{ id: "videos", label: "Source videos" }] },
    ],
  },
  {
    id: "setup",
    label: "Setup",
    items: [
      { id: "automations", label: "Automations", Icon: ScrollText },
    ],
  },
  {
    id: "controls",
    label: "Controls",
    items: [
      { id: "hotkeys", label: "Hotkeys", Icon: Keyboard },
      { id: "stream-deck", label: "Stream Deck", Icon: LayoutGrid },
    ],
  },
];

export function isNavItemActive(item: NavItem, view: AppView): boolean {
  return item.id === view || Boolean(item.subviews?.some((subview) => subview.id === view));
}

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  onCloseProject?: () => void;
  onExportProject?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const rowClass = "flex items-center gap-2 px-3 py-1.5 rounded text-base font-medium w-full text-left";

function Sidebar({ activeView, onViewChange, onCloseProject, onExportProject, collapsed = false, onCollapsedChange }: SidebarProps) {
  return (
    <nav
      className="no-select flex flex-col shrink-0 overflow-hidden"
      style={{
        width: collapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)",
        backgroundColor: "var(--color-surface-alt)",
        borderRight: "1px solid var(--color-border)",
      }}
      data-testid="sidebar"
      aria-label={collapsed ? "Main navigation collapsed" : "Main navigation"}
    >
      <div className="p-1.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <button
          type="button"
          onClick={() => onCollapsedChange?.(!collapsed)}
          className={rowClass}
          style={{ color: "var(--color-text-secondary)" }}
          data-testid="sidebar-collapse-toggle"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
      <div className="flex flex-col gap-2 p-1.5 flex-1 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div
            key={section.id}
            role="group"
            aria-label={section.label}
            className="flex flex-col gap-0.5"
            data-testid={`nav-section-${section.id}`}
          >
            {section.label && !collapsed && (
              <div className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-secondary)" }} aria-hidden="true">
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const isActive = isNavItemActive(item, activeView);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onViewChange(item.id)}
                  className={rowClass}
                  style={{
                    backgroundColor: isActive ? "var(--color-accent)" : "transparent",
                    color: isActive ? "var(--color-text-on-accent)" : "var(--color-text-secondary)",
                  }}
                  data-testid={`nav-${item.id}`}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                >
                  <item.Icon size={15} />
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {(onCloseProject || onExportProject) && (
        <div className="flex flex-col gap-0.5 p-1.5" style={{ borderTop: "1px solid var(--color-border)" }}>
          {onExportProject && (
            <button
              type="button"
              onClick={onExportProject}
              className={rowClass}
              style={{ color: "var(--color-text-secondary)" }}
              data-testid="nav-export-project"
              aria-label="Export project"
              title="Export project as a .zip (videos included)"
            >
              <Archive size={15} />
              {!collapsed && <span>Export project</span>}
            </button>
          )}
          {onCloseProject && (
            <button
              type="button"
              onClick={onCloseProject}
              className={rowClass}
              style={{ color: "var(--color-text-secondary)" }}
              data-testid="nav-close-project"
              aria-label="Close project"
              title="Close project"
            >
              <LogOut size={15} />
              {!collapsed && <span>Close project</span>}
            </button>
          )}
        </div>
      )}
    </nav>
  );
}

export default Sidebar;
