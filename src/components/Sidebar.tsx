import { LayoutDashboard, FileText, Film, Video, ScrollText, PanelLeftClose, PanelLeftOpen, LogOut, LayoutGrid, Keyboard, type LucideIcon } from "lucide-react";

export type AppView = "home" | "text-snippets" | "videos" | "video-snippets" | "automations" | "hotkeys" | "stream-deck";

interface NavItem {
  id: AppView;
  label: string;
  Icon: LucideIcon;
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
      { id: "text-snippets", label: "Text", Icon: FileText },
    ],
  },
  {
    id: "media",
    label: "Media",
    items: [
      { id: "videos", label: "Source videos", Icon: Video },
      { id: "video-snippets", label: "Clips", Icon: Film },
    ],
  },
  {
    id: "run",
    items: [
      { id: "automations", label: "Automations", Icon: ScrollText },
      { id: "hotkeys", label: "Hotkeys", Icon: Keyboard },
      { id: "stream-deck", label: "Stream Deck", Icon: LayoutGrid },
    ],
  },
];

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  onCloseProject?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const rowClass = "flex items-center gap-2 px-3 py-1.5 rounded text-base font-medium w-full text-left";

function Sidebar({ activeView, onViewChange, onCloseProject, collapsed = false, onCollapsedChange }: SidebarProps) {
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
              const isActive = activeView === item.id;
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

      {onCloseProject && (
        <div className="p-1.5" style={{ borderTop: "1px solid var(--color-border)" }}>
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
        </div>
      )}
    </nav>
  );
}

export default Sidebar;
