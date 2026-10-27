import type { LucideIcon } from "lucide-react";
import type { AppView } from "./Sidebar";

export interface SectionTab<T extends AppView> {
  id: T;
  label: string;
  count?: number;
  Icon: LucideIcon;
}

interface SectionTabsProps<T extends AppView> {
  label: string;
  testId: string;
  /** Prefix for each tab's test id. */
  tabTestId: string;
  tabs: SectionTab<T>[];
  active: T;
  onChange: (view: T) => void;
}

/** Tabs that switch between views nested under one sidebar item. */
function SectionTabs<T extends AppView>({ label, testId, tabTestId, tabs, active, onChange }: SectionTabsProps<T>) {
  return (
    <nav
      aria-label={label}
      className="mb-3 inline-flex gap-1 rounded-md p-1"
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      data-testid={testId}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={isActive ? "page" : undefined}
            className="flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            style={{
              backgroundColor: isActive ? "var(--color-accent)" : "transparent",
              color: isActive ? "var(--color-text-on-accent)" : "var(--color-text-secondary)",
            }}
            data-testid={`${tabTestId}-${tab.id}`}
          >
            <tab.Icon size={13} aria-hidden="true" />
            {tab.label}
            {tab.count !== undefined && <span className="opacity-75">{tab.count}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export default SectionTabs;
