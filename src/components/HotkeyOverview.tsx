import { Keyboard, Play, Film, FileText, MousePointerClick } from "lucide-react";
import type { TextSnippet, VideoSnippet } from "../types";

interface HotkeyOverviewProps {
  textSnippets: TextSnippet[];
  videoSnippets: VideoSnippet[];
  onPlayVideo?: (snippet: VideoSnippet) => void;
}

function TextCard({ snippet }: { snippet: TextSnippet }) {
  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col"
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      data-testid="hotkey-entry"
    >
      {/* Preview area — shows the text content */}
      <div
        className="px-3 py-3 overflow-hidden"
        style={{ backgroundColor: "var(--color-surface-inset)", minHeight: 80, maxHeight: 120 }}
      >
        <pre
          className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {snippet.text}
        </pre>
      </div>
      {/* Info bar */}
      <div className="px-3 py-2 flex items-center gap-2">
        <span
          className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded font-mono shrink-0"
          style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
        >
          <Keyboard size={10} />
          {snippet.hotkey}
        </span>
        <FileText size={12} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
        <span className="text-[12px] font-medium truncate" style={{ color: "var(--color-text)" }}>
          {snippet.title}
        </span>
        <span className="text-[10px] ml-auto shrink-0 px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}>
          {snippet.delivery === "paste" ? "Paste" : "Fast-type"}
        </span>
      </div>
    </div>
  );
}

function VideoCard({ snippet, onPlay }: { snippet: VideoSnippet; onPlay?: (s: VideoSnippet) => void }) {
  const duration = snippet.endTime - snippet.startTime;

  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col"
      style={{ backgroundColor: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
      data-testid="hotkey-entry"
    >
      {/* Preview area — video placeholder with play button */}
      <div
        className="relative flex items-center justify-center"
        style={{ backgroundColor: snippet.backgroundColor || "#000000", minHeight: 80 }}
      >
        {onPlay && (
          <button
            onClick={() => onPlay(snippet)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
            style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
            title="Preview clip"
            data-testid={`overview-play-${snippet.id}`}
          >
            <Play size={18} fill="currentColor" />
          </button>
        )}
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}>
            {duration.toFixed(1)}s @ {snippet.speed}×
          </span>
          {snippet.clickToPlay && (
            <span className="text-[10px] px-1 py-0.5 rounded flex items-center gap-0.5" style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}>
              <MousePointerClick size={9} />
            </span>
          )}
        </div>
      </div>
      {/* Info bar */}
      <div className="px-3 py-2 flex items-center gap-2">
        <span
          className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded font-mono shrink-0"
          style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text-secondary)" }}
        >
          <Keyboard size={10} />
          {snippet.hotkey}
        </span>
        <Film size={12} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
        <span className="text-[12px] font-medium truncate" style={{ color: "var(--color-text)" }}>
          {snippet.title}
        </span>
      </div>
    </div>
  );
}

function HotkeyOverview({ textSnippets, videoSnippets, onPlayVideo }: HotkeyOverviewProps) {
  if (textSnippets.length === 0 && videoSnippets.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: "var(--color-text-secondary)" }} data-testid="hotkey-overview-empty">
        <Keyboard size={32} className="mx-auto mb-3 opacity-40" />
        <p className="text-[13px]">No hotkeys configured yet</p>
        <p className="text-[12px] mt-1">Create text snippets or video clips to assign hotkeys.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3" data-testid="hotkey-overview">
      {textSnippets.map((s) => (
        <TextCard key={s.id} snippet={s} />
      ))}
      {videoSnippets.map((s) => (
        <VideoCard key={s.id} snippet={s} onPlay={onPlayVideo} />
      ))}
    </div>
  );
}

export default HotkeyOverview;
