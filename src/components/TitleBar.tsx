import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { Minus, Square, Copy, X, Moon, Sun, Radio } from "lucide-react";
import appIcon from "../assets/icon.png";

interface TitleBarProps {
  projectName: string | null;
  demoMode: boolean;
  onToggleDemo: () => void;
}

function TitleBar({ projectName, demoMode, onToggleDemo }: TitleBarProps) {
  const { theme, toggleTheme } = useTheme();
  const [maximized, setMaximized] = useState(false);

  // Resolve the Tauri window once — null when running in browser
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [appWindow, setAppWindow] = useState<any>(null);
  useEffect(() => {
    import("@tauri-apps/api/window")
      .then((mod) => setAppWindow(mod.getCurrentWindow()))
      .catch(() => {});
  }, []);

  // Track maximized state
  useEffect(() => {
    if (!appWindow) return;
    appWindow.isMaximized().then(setMaximized).catch(() => {});

    let unlisten: (() => void) | undefined;
    appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized).catch(() => {});
    }).then((fn: () => void) => { unlisten = fn; });
    return () => unlisten?.();
  }, [appWindow]);

  const minimize = useCallback(() => appWindow?.minimize(), [appWindow]);
  const toggleMaximize = useCallback(() => appWindow?.toggleMaximize(), [appWindow]);
  const close = useCallback(() => appWindow?.close(), [appWindow]);

  return (
    <div
      data-tauri-drag-region
      className="no-select flex items-center justify-between shrink-0"
      style={{
        height: "var(--titlebar-height)",
        backgroundColor: "var(--color-surface-toolbar)",
        borderBottom: "1px solid var(--color-border)",
        padding: "0 12px",
      }}
    >
      {/* Left: App icon + name + project (draggable) */}
      <div data-tauri-drag-region className="flex items-center gap-2 shrink-0">
        <img src={appIcon} alt="" className="w-4 h-4" draggable={false} />
        <span data-tauri-drag-region className="font-semibold text-[13px]" style={{ color: "var(--color-text)" }}>
          Snipsy
        </span>
        {projectName && (
          <>
            <span data-tauri-drag-region style={{ color: "var(--color-text-secondary)" }}>/</span>
            <span data-tauri-drag-region className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              {projectName}
            </span>
          </>
        )}
      </div>

      {/* Center spacer (draggable) */}
      <div data-tauri-drag-region className="flex-1" />

      {/* Right: controls (no-drag so buttons are clickable) */}
      <div className="flex items-center shrink-0" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <div className="flex items-center gap-1 px-1">
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
        </div>

        {/* Separator */}
        <div className="w-px h-4 mx-1 shrink-0" style={{ backgroundColor: "var(--color-border)" }} />

        {/* Window controls */}
        <button
          onClick={minimize}
          className="inline-flex items-center justify-center w-11 hover:opacity-80"
          style={{ height: "var(--titlebar-height)", color: "var(--color-text-secondary)" }}
          aria-label="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={toggleMaximize}
          className="inline-flex items-center justify-center w-11 hover:opacity-80"
          style={{ height: "var(--titlebar-height)", color: "var(--color-text-secondary)" }}
          aria-label="Maximize"
        >
          {maximized ? <Copy size={11} /> : <Square size={11} />}
        </button>
        <button
          onClick={close}
          className="inline-flex items-center justify-center w-11 hover:bg-red-500 hover:text-white transition-colors"
          style={{ height: "var(--titlebar-height)", color: "var(--color-text-secondary)" }}
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
