import { useCallback, useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { useTheme } from "../hooks/useTheme";
import { Minus, Square, Copy, X, Moon, Sun, Play, CircleStop, ShieldAlert, Search, Settings } from "lucide-react";
import Kbd from "./ui/Kbd";
import { getBackend } from "../services";
import { isMacPlatform, traySurfaceName } from "../utils/platform";
import appIcon from "../assets/icon.png";


interface TitleBarProps {
  projectName: string | null;
  demoMode: boolean;
  onToggleDemo: () => void;
  /** Opens the command palette; the search button is hidden when omitted. */
  onOpenPalette?: () => void;
  /** Opens Settings, optionally at a section; the gear is hidden when omitted. */
  onOpenSettings?: (section?: "permissions") => void;
}

function isInteractiveTitlebarTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button, a, input, select, textarea, [role='button'], [data-titlebar-interactive='true']"));
}

function TitleBar({ projectName, demoMode, onToggleDemo, onOpenPalette, onOpenSettings }: TitleBarProps) {
  const { theme, toggleTheme } = useTheme();
  const isMac = isMacPlatform();
  const [maximized, setMaximized] = useState(false);
  const [elevated, setElevated] = useState(true); // assume true until checked

  // Resolve the Tauri window once — null when running in browser
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [appWindow, setAppWindow] = useState<any>(null);
  useEffect(() => {
    import("@tauri-apps/api/window")
      .then((mod) => setAppWindow(mod.getCurrentWindow()))
      .catch(() => {});
  }, []);

  // Check elevation status on mount
  useEffect(() => {
    getBackend().isElevated().then(setElevated).catch(() => {});
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

  // Minimize always hides to tray
  const minimize = useCallback(() => {
    appWindow?.hide();
  }, [appWindow]);
  const toggleMaximize = useCallback(async () => {
    if (!appWindow) return;
    await appWindow.toggleMaximize();
    appWindow.isMaximized().then(setMaximized).catch(() => {});
  }, [appWindow]);
  // Close actually quits the app (with confirmation)
  const close = useCallback(async () => {
    if (!appWindow) return;
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const ok = await confirm("Are you sure you want to quit Snipsy?", {
      title: "Quit Snipsy",
      okLabel: "Quit",
      cancelLabel: "Cancel",
    });
    if (ok) appWindow.close();
  }, [appWindow]);

  const handleRelaunchAsAdmin = useCallback(() => {
    getBackend().relaunchAsAdmin().catch(() => {});
  }, []);

  const handleTitlebarMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!appWindow || event.button !== 0 || isInteractiveTitlebarTarget(event.target)) return;
    if (event.detail > 1) return;

    appWindow.startDragging?.().catch?.(() => {});
  }, [appWindow]);

  const handleTitlebarDoubleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (isInteractiveTitlebarTarget(event.target)) return;
    event.preventDefault();
    void toggleMaximize();
  }, [toggleMaximize]);

  const titlebarHeight = isMac ? "var(--macos-titlebar-height)" : "var(--titlebar-height)";
  const titlebarButtonStyle: CSSProperties = {
    height: 28,
    minWidth: 28,
    color: "var(--color-text-secondary)",
  };
  const windowButtonStyle: CSSProperties = {
    height: titlebarHeight,
    width: 46,
    color: "var(--color-text-secondary)",
  };

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleTitlebarMouseDown}
      onDoubleClick={handleTitlebarDoubleClick}
      className="no-select flex items-center justify-between shrink-0"
      style={{
        height: titlebarHeight,
        backgroundColor: "var(--color-surface-toolbar)",
        borderBottom: "1px solid var(--color-border)",
        padding: isMac ? "0 12px 0 var(--macos-traffic-light-space)" : "0 12px",
      }}
    >
      {/* Left: App icon + name + project (draggable) */}
      <div data-tauri-drag-region className="flex min-w-0 items-center gap-2 shrink-0">
        {!isMac && <img src={appIcon} alt="" className="h-4 w-4 shrink-0" draggable={false} />}
        <span data-tauri-drag-region className="font-semibold leading-none" style={{ color: "var(--color-text)", fontSize: "var(--font-size-md)" }}>
          Snipsy
        </span>
        {projectName && (
          <>
            <span data-tauri-drag-region className="leading-none" style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-base)" }}>/</span>
            <span data-tauri-drag-region className="truncate leading-none" style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-base)", maxWidth: 260 }}>
              {projectName}
            </span>
          </>
        )}
      </div>

      {/* Center: command palette launcher, flanked by draggable space */}
      <div data-tauri-drag-region className="flex flex-1 min-w-0 items-center justify-center px-3">
        {onOpenPalette && (
          <button
            type="button"
            onClick={onOpenPalette}
            className="inline-flex min-w-0 items-center gap-2 rounded-md px-2 transition-colors hover:bg-[var(--color-surface-inset)]"
            style={{ height: 24, width: "100%", maxWidth: 360, border: "1px solid var(--color-border)", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}
            title="Search snippets and commands"
            aria-label="Search snippets and commands"
            aria-keyshortcuts="Control+K Meta+K"
            data-testid="command-palette-button"
          >
            <Search size={13} aria-hidden="true" />
            <span className="flex-1 truncate text-left">Search or run a command</span>
            <Kbd hotkey="CmdOrControl+K" />
          </button>
        )}
      </div>

      {/* Right: controls (no-drag so buttons are clickable) */}
      <div className="flex items-center shrink-0" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <div className="flex items-center gap-1 px-1">
          {/* Demo mode toggle — labeled so the main action is obvious */}
          {projectName && (
            <button
              onClick={onToggleDemo}
              className="inline-flex items-center justify-center gap-1.5 rounded-md px-2 font-medium transition-colors hover:bg-[var(--color-surface-inset)]"
              data-testid="demo-mode-toggle"
              title={demoMode ? "Stop demo and unregister hotkeys" : `Start demo: hide to the ${traySurfaceName()} and arm hotkeys`}
              aria-label={demoMode ? "Stop demo" : "Start demo"}
              style={{ ...titlebarButtonStyle, color: demoMode ? "var(--color-danger)" : "var(--color-success)", fontSize: "var(--font-size-sm)" }}
            >
              {demoMode
                ? <CircleStop size={14} className="demo-pulse" aria-hidden="true" />
                : <Play size={12} fill="currentColor" aria-hidden="true" />}
              <span>{demoMode ? "Stop" : "Start"}</span>
            </button>
          )}

          {/* Elevation warning — show when not running as admin */}
          {projectName && !elevated && (
            <button
              onClick={onOpenSettings ? () => onOpenSettings("permissions") : handleRelaunchAsAdmin}
              className="inline-flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-inset)]"
              title={onOpenSettings ? "Not running as administrator. Open permission settings." : "Input protection requires Admin. Click to restart as Administrator."}
              aria-label={onOpenSettings ? "Permission settings" : "Restart as Administrator"}
              data-testid="elevation-warning"
              style={{ ...titlebarButtonStyle, color: "var(--color-warning, #f59e0b)" }}
            >
              <ShieldAlert size={14} />
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="inline-flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-inset)]"
            title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            data-testid="theme-toggle"
            style={titlebarButtonStyle}
          >
            {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          {onOpenSettings && (
            <button
              onClick={() => onOpenSettings()}
              className="inline-flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-inset)]"
              title={isMac ? "Settings (⌘,)" : "Settings (Ctrl+,)"}
              aria-label="Settings"
              aria-keyshortcuts="Control+Comma Meta+Comma"
              data-testid="settings-button"
              style={titlebarButtonStyle}
            >
              <Settings size={14} />
            </button>
          )}


        </div>
        {!isMac && (
          <>
            {/* Separator */}
            <div className="w-px h-4 mx-1 shrink-0" style={{ backgroundColor: "var(--color-border)" }} />

            {/* Window controls */}
            <button
              onClick={minimize}
              className="titlebar-window-control"
              style={windowButtonStyle}
              aria-label="Minimize"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={toggleMaximize}
              className="titlebar-window-control"
              style={windowButtonStyle}
              aria-label={maximized ? "Restore" : "Maximize"}
            >
              {maximized ? <Copy size={11} /> : <Square size={11} />}
            </button>
            <button
              onClick={close}
              className="titlebar-window-control titlebar-window-control-close"
              style={windowButtonStyle}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default TitleBar;
