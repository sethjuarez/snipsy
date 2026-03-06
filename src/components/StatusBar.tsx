interface StatusBarProps {
  projectPath: string | null;
  ffmpegAvailable: boolean | null;
  demoMode: boolean;
}

function StatusBar({ projectPath, ffmpegAvailable, demoMode }: StatusBarProps) {
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
        {demoMode && <span className="font-medium">● LIVE DEMO</span>}
        {projectPath && !demoMode && (
          <span className="truncate max-w-xs">{projectPath}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {ffmpegAvailable === false && (
          <span style={{ color: demoMode ? "#fff" : "var(--color-warning)" }}>
            ⚠ FFmpeg missing
          </span>
        )}
      </div>
    </div>
  );
}

export default StatusBar;
