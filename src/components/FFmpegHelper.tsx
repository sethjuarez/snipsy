import { useEffect, useState } from "react";
import { ExternalLink, FolderOpen, RefreshCw, RotateCcw, X, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { getBackend } from "../services";
import type { FfmpegStatus } from "../services/backendService";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface FFmpegHelperProps {
  onClose: () => void;
  onFixed: () => void;
}

const backend = getBackend();

function FFmpegHelper({ onClose, onFixed }: FFmpegHelperProps) {
  const [status, setStatus] = useState<FfmpegStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState<"ffmpeg" | "ffprobe" | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<{ ffmpeg: string | null; ffprobe: string | null }>({
    ffmpeg: null,
    ffprobe: null,
  });
  const [message, setMessage] = useState("");
  const trapRef = useFocusTrap<HTMLDivElement>();

  const refresh = async () => {
    setChecking(true);
    setMessage("");
    try {
      const nextStatus = await backend.checkFfmpeg();
      setStatus(nextStatus);
      if (nextStatus.available) onFixed();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check FFmpeg status.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const locateTool = async (tool: "ffmpeg" | "ffprobe") => {
    setSaving(tool);
    setMessage("");
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selection = await open({ multiple: false });
      if (typeof selection !== "string") return;

      const nextPaths = { ...selectedPaths, [tool]: selection };
      const nextStatus = await backend.setFfmpegPaths(nextPaths.ffmpeg, nextPaths.ffprobe);
      setSelectedPaths(nextPaths);
      setStatus(nextStatus);
      if (nextStatus.available) {
        onFixed();
      } else {
        setMessage("Select both FFmpeg and FFprobe if they are not installed in a standard location.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not save the ${tool} path.`);
    } finally {
      setSaving(null);
    }
  };

  const resetPaths = async () => {
    setChecking(true);
    setMessage("");
    try {
      const nextStatus = await backend.setFfmpegPaths(null, null);
      setStatus(nextStatus);
      setSelectedPaths({ ffmpeg: null, ffprobe: null });
      if (nextStatus.available) onFixed();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reset the saved FFmpeg paths.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--color-overlay)" }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ffmpeg-dialog-title"
    >
      <div
        className="rounded-lg shadow-xl max-w-md w-full mx-4"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <h3 id="ffmpeg-dialog-title" className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            Video Tools
          </h3>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:opacity-70" style={{ color: "var(--color-text-secondary)" }} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-base leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
            Snipsy uses FFmpeg and FFprobe for video processing and automation recordings. They are not bundled with Snipsy.
          </p>

          {(["ffmpeg", "ffprobe"] as const).map((tool) => {
            const toolStatus = status?.[tool];
            const ready = toolStatus?.available;
            return (
              <div key={tool} className="p-3 rounded-md space-y-2" style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}>
                <div className="flex items-center gap-2 text-sm font-medium" style={{ color: ready ? "var(--color-success)" : "var(--color-text)" }}>
                  {ready ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                  {tool === "ffmpeg" ? "FFmpeg" : "FFprobe"} {ready ? "ready" : "needed"}
                </div>
                {toolStatus?.path && <p className="text-xs break-all" style={{ color: "var(--color-text-secondary)" }}>{toolStatus.path}</p>}
                {toolStatus?.version && <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{toolStatus.version}</p>}
                {toolStatus?.error && <p className="text-xs" style={{ color: "var(--color-danger)" }}>{toolStatus.error}</p>}
                <button
                  onClick={() => void locateTool(tool)}
                  disabled={saving !== null}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
                  style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                >
                  {saving === tool ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
                  Locate {tool === "ffmpeg" ? "FFmpeg" : "FFprobe"}
                </button>
              </div>
            );
          })}

          {message && <p className="text-sm" style={{ color: "var(--color-danger)" }}>{message}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => void refresh()}
              disabled={checking || saving !== null}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium"
              style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              <RefreshCw size={13} className={checking ? "animate-spin" : ""} /> Check Again
            </button>
            <button
              onClick={() => void resetPaths()}
              disabled={checking || saving !== null}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium"
              style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              <RotateCcw size={13} /> Reset Paths
            </button>
          </div>

          <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
            Install FFmpeg with your preferred package manager, then locate the two executables here if Snipsy cannot find them automatically.{" "}
            <a
              href="https://ffmpeg.org/download.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 underline"
              style={{ color: "var(--color-accent)" }}
            >
              FFmpeg downloads <ExternalLink size={10} />
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default FFmpegHelper;
