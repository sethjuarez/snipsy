import { useTheme } from "../hooks/useTheme";
import { Minus, Square, X, Moon, Sun, Radio } from "lucide-react";

interface TitleBarProps {
  projectName: string | null;
  demoMode: boolean;
  onToggleDemo: () => void;
}

function TitleBar({ projectName, demoMode, onToggleDemo }: TitleBarProps) {
  const { theme, toggleTheme } = useTheme();

  const minimize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      getCurrentWindow().minimize();
    } catch { /* not in Tauri */ }
  };

  const toggleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      getCurrentWindow().toggleMaximize();
    } catch { /* not in Tauri */ }
  };

  const close = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      getCurrentWindow().close();
    } catch { /* not in Tauri */ }
  };

  return (
    <div
      className="no-select flex items-center justify-between shrink-0"
      data-tauri-drag-region
      style={{
        height: "var(--titlebar-height)",
        backgroundColor: "var(--color-surface-toolbar)",
        borderBottom: "1px solid var(--color-border)",
        padding: "0 12px",
      }}
    >
      {/* Left: App name + project */}
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <span className="font-semibold text-[13px]" style={{ color: "var(--color-text)" }}>
          Snipsy
        </span>
        {projectName && (
          <>
            <span style={{ color: "var(--color-text-secondary)" }}>/</span>
            <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              {projectName}
            </span>
          </>
        )}
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {/* Demo mode toggle */}
        {projectName && (
          <button
            onClick={onToggleDemo}
            className="flex items-center gap-1 px-3 py-0.5 rounded text-[11px] font-medium"
            data-testid="demo-mode-toggle"
            style={{
              backgroundColor: demoMode ? "var(--color-danger)" : "var(--color-success)",
              color: "#fff",
            }}
          >
            {demoMode && <Radio size={10} />}
            {demoMode ? "LIVE" : "Demo"}
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-7 h-7 flex items-center justify-center rounded"
          title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          data-testid="theme-toggle"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
        </button>

        {/* Window controls */}
        <button
          onClick={minimize}
          className="w-7 h-7 flex items-center justify-center rounded hover:opacity-80"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={toggleMaximize}
          className="w-7 h-7 flex items-center justify-center rounded hover:opacity-80"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label="Maximize"
        >
          <Square size={11} />
        </button>
        <button
          onClick={close}
          className="w-7 h-7 flex items-center justify-center rounded hover:opacity-80"
          style={{ color: "var(--color-danger)" }}
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
