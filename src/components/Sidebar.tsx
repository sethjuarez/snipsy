import { Home, LayoutDashboard, FileText, Film, Video, ScrollText, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";

export type AppView = "home" | "text-snippets" | "videos" | "video-snippets" | "scripts";

interface NavItem {
  id: AppView;
  label: string;
  Icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Overview", Icon: LayoutDashboard },
  { id: "text-snippets", label: "Text", Icon: FileText },
  { id: "videos", label: "Videos", Icon: Video },
  { id: "video-snippets", label: "Clips", Icon: Film },
  { id: "scripts", label: "Automations", Icon: ScrollText },
];

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  onGoHome?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

function Sidebar({ activeView, onViewChange, onGoHome, collapsed = false, onCollapsedChange }: SidebarProps) {
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
          className="flex items-center gap-2 px-3 py-1.5 rounded text-base font-medium w-full text-left"
          style={{ color: "var(--color-text-secondary)" }}
          data-testid="sidebar-collapse-toggle"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
      <div className="flex flex-col gap-0.5 p-1.5 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-base font-medium text-left"
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

      {/* Home / close project button at bottom */}
      {onGoHome && (
        <div className="p-1.5" style={{ borderTop: "1px solid var(--color-border)" }}>
          <button
            onClick={onGoHome}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-base font-medium w-full text-left"
            style={{ color: "var(--color-text-secondary)" }}
            data-testid="nav-home"
            title="Home"
          >
            <Home size={15} />
            {!collapsed && <span>Home</span>}
          </button>
        </div>
      )}
    </nav>
  );
}

export default Sidebar;
