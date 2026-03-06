import { useState } from "react";
import { Download, RefreshCw, RotateCcw, ExternalLink, X, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { createBackendService } from "../services";

type InstallState = "idle" | "installing" | "success" | "error";

interface FFmpegHelperProps {
  onClose: () => void;
  onFixed: () => void;
}

function FFmpegHelper({ onClose, onFixed }: FFmpegHelperProps) {
  const [installState, setInstallState] = useState<InstallState>("idle");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  const handleInstall = async () => {
    setInstallState("installing");
    setMessage("");
    try {
      const backend = createBackendService();
      const result = await backend.installFfmpeg();
      setInstallState("success");
      setMessage(result);
    } catch (err) {
      setInstallState("error");
      setMessage(typeof err === "string" ? err : (err as Error).message || "Installation failed.");
    }
  };

  const handleRestart = async () => {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      setMessage("Please close and reopen Snipsy manually.");
    }
  };

  const handleRecheck = async () => {
    setChecking(true);
    try {
      const backend = createBackendService();
      const available = await backend.checkFfmpeg();
      if (available) {
        onFixed();
      } else {
        setMessage("FFmpeg still not detected on PATH. Click 'Restart Snipsy' to pick up the new PATH.");
      }
    } catch {
      setMessage("Could not check FFmpeg status.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-lg shadow-xl max-w-md w-full mx-4"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>
            FFmpeg Required
          </h3>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:opacity-70"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
            FFmpeg is a free tool needed for video processing and script recording.
            It's not bundled with Snipsy, but you can install it in one click.
          </p>

          {/* Auto-install button */}
          <button
            onClick={handleInstall}
            disabled={installState === "installing"}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-medium transition-opacity"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "#fff",
              opacity: installState === "installing" ? 0.7 : 1,
            }}
          >
            {installState === "installing" ? (
              <><Loader2 size={14} className="animate-spin" /> Installing…</>
            ) : (
              <><Download size={14} /> Install FFmpeg Automatically</>
            )}
          </button>

          {/* Status message */}
          {message && (
            <div
              className="p-3 rounded-md text-[11px] leading-relaxed"
              style={{
                backgroundColor: "var(--color-surface-inset)",
                border: "1px solid var(--color-border)",
                color: installState === "success" ? "var(--color-success)" :
                       installState === "error" ? "var(--color-danger)" :
                       "var(--color-text-secondary)",
              }}
            >
              <div className="flex items-start gap-2">
                {installState === "success" && <CheckCircle size={13} className="shrink-0 mt-0.5" />}
                {installState === "error" && <AlertTriangle size={13} className="shrink-0 mt-0.5" />}
                <span className="whitespace-pre-wrap">{message}</span>
              </div>
            </div>
          )}

          {/* Re-check button */}
          <button
            onClick={handleRecheck}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-[12px] font-medium"
            style={{
              backgroundColor: "var(--color-surface-inset)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              opacity: checking ? 0.7 : 1,
            }}
          >
            <RefreshCw size={13} className={checking ? "animate-spin" : ""} /> Check Again
          </button>

          {/* Restart button — shown after install attempt */}
          {(installState === "success" || installState === "error") && (
            <button
              onClick={handleRestart}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-[12px] font-medium"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "#fff",
              }}
            >
              <RotateCcw size={13} /> Restart Snipsy
            </button>
          )}

          {/* Manual instructions */}
          <details className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
            <summary className="cursor-pointer hover:underline">Manual installation instructions</summary>
            <div
              className="mt-2 p-3 rounded-md space-y-2"
              style={{ backgroundColor: "var(--color-surface-inset)" }}
            >
              <p><strong>Windows:</strong> <code>winget install ffmpeg</code></p>
              <p><strong>macOS:</strong> <code>brew install ffmpeg</code></p>
              <p><strong>Linux:</strong> <code>sudo apt install ffmpeg</code></p>
              <p>
                Or download from{" "}
                <a
                  href="https://ffmpeg.org/download.html"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 underline"
                  style={{ color: "var(--color-accent)" }}
                  onClick={(e) => {
                    e.preventDefault();
                    window.open("https://ffmpeg.org/download.html", "_blank");
                  }}
                >
                  ffmpeg.org <ExternalLink size={10} />
                </a>
              </p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export default FFmpegHelper;
