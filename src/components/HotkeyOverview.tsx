import { Keyboard, FileText, Film, type LucideIcon } from "lucide-react";
import type { TextSnippet, VideoSnippet } from "../types";

interface HotkeyOverviewProps {
  textSnippets: TextSnippet[];
  videoSnippets: VideoSnippet[];
}

interface HotkeyEntry {
  hotkey: string;
  title: string;
  type: "text" | "video";
  Icon: LucideIcon;
  subtitle?: string;
}

function HotkeyOverview({ textSnippets, videoSnippets }: HotkeyOverviewProps) {
  const entries: HotkeyEntry[] = [
    ...textSnippets.map((s) => ({
      hotkey: s.hotkey,
      title: s.title,
      type: "text" as const,
      Icon: FileText,
      subtitle: s.delivery === "paste" ? "Paste" : "Fast-type",
    })),
    ...videoSnippets.map((s) => ({
      hotkey: s.hotkey,
      title: s.title,
      type: "video" as const,
      Icon: Film,
      subtitle: s.clickToPlay ? "Click to play" : undefined,
    })),
  ];

  if (entries.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: "var(--color-text-secondary)" }} data-testid="hotkey-overview-empty">
        <Keyboard size={32} className="mx-auto mb-3 opacity-40" />
        <p className="text-[13px]">No hotkeys configured yet</p>
        <p className="text-[12px] mt-1">Create text snippets or video clips to assign hotkeys.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="hotkey-overview">
      {entries.map((entry) => (
        <div
          key={`${entry.type}-${entry.hotkey}`}
          className="flex items-center gap-3 rounded-lg px-4 py-2.5"
          style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
          data-testid="hotkey-entry"
        >
          <span
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded font-mono shrink-0 min-w-[120px] justify-center"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
          >
            <Keyboard size={11} />
            {entry.hotkey}
          </span>
          <entry.Icon size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
          <span className="text-[13px] font-medium truncate" style={{ color: "var(--color-text)" }}>
            {entry.title}
          </span>
          {entry.subtitle && (
            <span className="text-[11px] ml-auto shrink-0" style={{ color: "var(--color-text-secondary)" }}>
              {entry.subtitle}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default HotkeyOverview;
