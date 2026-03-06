export type AppView = "text-snippets" | "videos" | "video-snippets" | "scripts";

interface NavItem {
  id: AppView;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "text-snippets", label: "Text", icon: "📝" },
  { id: "video-snippets", label: "Clips", icon: "🎬" },
  { id: "videos", label: "Videos", icon: "📹" },
  { id: "scripts", label: "Scripts", icon: "📋" },
];

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  collapsed?: boolean;
}

function Sidebar({ activeView, onViewChange, collapsed = false }: SidebarProps) {
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
              <span className="text-[14px]">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default Sidebar;
