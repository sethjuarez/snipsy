import { Folder, AlertTriangle, Radio } from "lucide-react";

interface StatusBarProps {
  projectPath: string | null;
  ffmpegAvailable: boolean | null;
  demoMode: boolean;
  onFfmpegClick?: () => void;
}

function StatusBar({ projectPath, ffmpegAvailable, demoMode, onFfmpegClick }: StatusBarProps) {
  return (
    <div
      className="no-select flex items-center justify-between px-3 shrink-0"
      style={{
        height: "var(--statusbar-height)",
        backgroundColor: demoMode ? "var(--color-accent)" : "var(--color-surface-toolbar)",
        borderTop: "1px solid var(--color-border)",
        fontSize: "11px",
        color: demoMode ? "#fff" : "var(--color-text-secondary)",
      }}
      data-testid="status-bar"
    >
      <div className="flex items-center gap-3">
        {demoMode && (
          <span className="flex items-center gap-1 font-medium">
            <Radio size={10} /> LIVE DEMO
          </span>
        )}
        {projectPath && !demoMode && (
          <span className="flex items-center gap-1.5 truncate max-w-xs">
            <Folder size={11} />
            {projectPath}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {ffmpegAvailable === false && (
          <button
            onClick={onFfmpegClick}
            className="flex items-center gap-1 cursor-pointer hover:underline"
            style={{ color: demoMode ? "#fff" : "var(--color-warning)" }}
          >
            <AlertTriangle size={11} /> FFmpeg missing — click to fix
          </button>
        )}
      </div>
    </div>
  );
}

export default StatusBar;
