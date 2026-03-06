import { Home, FileText, Film, Video, ScrollText, type LucideIcon } from "lucide-react";

export type AppView = "text-snippets" | "videos" | "video-snippets" | "scripts";

interface NavItem {
  id: AppView;
  label: string;
  Icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: "text-snippets", label: "Text", Icon: FileText },
  { id: "video-snippets", label: "Clips", Icon: Film },
  { id: "videos", label: "Videos", Icon: Video },
  { id: "scripts", label: "Scripts", Icon: ScrollText },
];

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  onGoHome?: () => void;
  collapsed?: boolean;
}

function Sidebar({ activeView, onViewChange, onGoHome, collapsed = false }: SidebarProps) {
  return (
    <nav
      className="no-select flex flex-col shrink-0 overflow-hidden"
      style={{
        width: collapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)",
        backgroundColor: "var(--color-surface-alt)",
        borderRight: "1px solid var(--color-border)",
      }}
      data-testid="sidebar"
    >
      <div className="flex flex-col gap-0.5 p-1.5 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-[12px] font-medium text-left"
              style={{
                backgroundColor: isActive ? "var(--color-accent)" : "transparent",
                color: isActive ? "#fff" : "var(--color-text-secondary)",
              }}
              data-testid={`nav-${item.id}`}
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
            className="flex items-center gap-2 px-3 py-1.5 rounded text-[12px] font-medium w-full text-left"
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
