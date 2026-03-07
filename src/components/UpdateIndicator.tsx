import { useState, useEffect, useRef } from "react";
import { Download } from "lucide-react";
import { useUpdateStore } from "../stores/updateStore";

export default function UpdateIndicator() {
  const update = useUpdateStore((s) => s.update);
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const handleClose = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handleClose);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("mousedown", handleClose);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  if (!update) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setProgress("Downloading...");
            break;
          case "Progress":
            downloaded += event.data.chunkLength ?? 0;
            setProgress(`${(downloaded / 1024 / 1024).toFixed(1)} MB`);
            break;
          case "Finished":
            setProgress("Installing...");
            break;
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      setProgress("Failed");
      setInstalling(false);
    }
  };

  return (
    <div
      ref={ref}
      className="relative flex items-center px-1"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <button
        className="relative w-7 h-7 flex items-center justify-center rounded"
        onClick={() => setOpen(!open)}
        title={`Update available: v${update.version}`}
        data-testid="update-indicator"
        style={{ color: "var(--color-accent, #6366f1)" }}
      >
        <Download size={14} />
        {/* Pulsing notification dot */}
        <span
          className="absolute top-1 right-1 w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: "var(--color-accent, #6366f1)" }}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-[100] w-[240px] py-2.5 px-3 rounded-lg shadow-lg"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
          data-testid="update-dropdown"
        >
          <div
            className="text-[10px] font-medium uppercase tracking-wider mb-1.5"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Update Available
          </div>
          <div className="text-xs mb-2" style={{ color: "var(--color-text)" }}>
            <span className="font-semibold">v{update.version}</span>
            {update.body && (
              <p
                className="mt-1 line-clamp-3"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {update.body}
              </p>
            )}
          </div>
          {installing ? (
            <div
              className="text-[11px]"
              style={{ color: "var(--color-accent, #6366f1)" }}
              data-testid="update-progress"
            >
              {progress}
            </div>
          ) : (
            <button
              onClick={handleInstall}
              className="w-full h-[26px] rounded text-[11px] font-medium text-white transition-colors"
              style={{ backgroundColor: "var(--color-accent, #6366f1)" }}
              data-testid="update-install-btn"
            >
              Download &amp; Install
            </button>
          )}
        </div>
      )}
    </div>
  );
}
