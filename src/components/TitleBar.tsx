import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { Minus, Square, Copy, X, Moon, Sun, Play, Circle } from "lucide-react";
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

  // In demo mode, minimize hides to tray instead
  const minimize = useCallback(() => {
    if (demoMode && appWindow) {
      appWindow.hide();
    } else {
      appWindow?.minimize();
    }
  }, [appWindow, demoMode]);
  const toggleMaximize = useCallback(() => appWindow?.toggleMaximize(), [appWindow]);
  const close = useCallback(() => appWindow?.close(), [appWindow]);

  return (
    <div
      data-tauri-drag-region
      className="no-select flex items-center justify-between shrink-0"
      style={{
        height: "var(--titlebar-height)",
        backgroundColor: demoMode ? "var(--color-danger)" : "var(--color-surface-toolbar)",
        borderBottom: demoMode ? "none" : "1px solid var(--color-border)",
        padding: "0 12px",
        transition: "background-color 0.3s ease",
      }}
    >
      {/* Left: App icon + name + project (draggable) */}
      <div data-tauri-drag-region className="flex items-center gap-2 shrink-0">
        <img src={appIcon} alt="" className="w-4 h-4" draggable={false} />
        <span data-tauri-drag-region className="font-semibold text-[13px]" style={{ color: demoMode ? "#fff" : "var(--color-text)" }}>
          Snipsy
        </span>
        {projectName && (
          <>
            <span data-tauri-drag-region style={{ color: demoMode ? "rgba(255,255,255,0.5)" : "var(--color-text-secondary)" }}>/</span>
            <span data-tauri-drag-region className="text-[12px]" style={{ color: demoMode ? "rgba(255,255,255,0.7)" : "var(--color-text-secondary)" }}>
              {projectName}
            </span>
          </>
        )}
        {/* Glowing red LIVE indicator */}
        {demoMode && (
          <span className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider" style={{ color: "#fff" }}>
            <Circle size={8} className="demo-pulse" fill="#fff" stroke="none" />
            LIVE
          </span>
        )}
      </div>

      {/* Center spacer (draggable) */}
      <div data-tauri-drag-region className="flex-1" />

      {/* Right: controls (no-drag so buttons are clickable) */}
      <div className="flex items-center shrink-0" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <div className="flex items-center gap-1 px-1">
          {/* Demo mode toggle — green play button / red stop */}
          {projectName && (
            <button
              onClick={onToggleDemo}
              className="w-7 h-7 flex items-center justify-center rounded"
              data-testid="demo-mode-toggle"
              title={demoMode ? "Exit Demo Mode" : "Enter Demo Mode"}
              style={{ color: demoMode ? "#fff" : "var(--color-success)" }}
            >
              {demoMode ? <X size={14} /> : <Play size={14} fill="currentColor" />}
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-7 h-7 flex items-center justify-center rounded"
            title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            data-testid="theme-toggle"
            style={{ color: demoMode ? "rgba(255,255,255,0.7)" : "var(--color-text-secondary)" }}
          >
            {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-4 mx-1 shrink-0" style={{ backgroundColor: demoMode ? "rgba(255,255,255,0.3)" : "var(--color-border)" }} />

        {/* Window controls */}
        <button
          onClick={minimize}
          className="inline-flex items-center justify-center w-11 hover:opacity-80"
          style={{ height: "var(--titlebar-height)", color: demoMode ? "rgba(255,255,255,0.7)" : "var(--color-text-secondary)" }}
          aria-label="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={toggleMaximize}
          className="inline-flex items-center justify-center w-11 hover:opacity-80"
          style={{ height: "var(--titlebar-height)", color: demoMode ? "rgba(255,255,255,0.7)" : "var(--color-text-secondary)" }}
          aria-label="Maximize"
        >
          {maximized ? <Copy size={11} /> : <Square size={11} />}
        </button>
        <button
          onClick={close}
          className="inline-flex items-center justify-center w-11 hover:bg-red-500 hover:text-white transition-colors"
          style={{ height: "var(--titlebar-height)", color: demoMode ? "rgba(255,255,255,0.7)" : "var(--color-text-secondary)" }}
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
