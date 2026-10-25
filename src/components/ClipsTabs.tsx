import { Film, Video } from "lucide-react";
import type { AppView } from "./Sidebar";

export type ClipsTab = Extract<AppView, "video-snippets" | "videos">;

interface ClipsTabsProps {
  active: ClipsTab;
  clipCount: number;
  videoCount?: number;
  onChange: (view: ClipsTab) => void;
}

/** Switches between clips and the source videos they are cut from. */
function ClipsTabs({ active, clipCount, videoCount, onChange }: ClipsTabsProps) {
  const tabs: { id: ClipsTab; label: string; count?: number; Icon: typeof Film }[] = [
    { id: "video-snippets", label: "Clips", count: clipCount, Icon: Film },
    { id: "videos", label: "Source videos", count: videoCount, Icon: Video },
  ];
  return (
    <nav
      aria-label="Clips sections"
      className="mb-3 inline-flex gap-1 rounded-md p-1"
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      data-testid="clips-tabs"
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
            data-testid={`clips-tab-${tab.id}`}
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

export default ClipsTabs;
