import type { ChangeEvent } from "react";
import type { StreamDeckIcon } from "../types";
import { STREAM_DECK_PRESETS, defaultStreamDeckIcon, isSafeImageDataUrl, streamDeckIconToDataUrl } from "../utils/streamDeckIcons";

interface IconEditorProps {
  icon: StreamDeckIcon;
  title: string;
  snippetType: "text" | "video";
  onChange: (icon: StreamDeckIcon) => void;
  compact?: boolean;
  testIdPrefix: string;
}

const MAX_IMAGE_BYTES = 750 * 1024;
const DEFAULT_PRESET = {
  text: "text",
  video: "play",
} as const;

function IconEditor({ icon, title, snippetType, onChange, compact = false, testIdPrefix }: IconEditorProps) {
  const fallback = defaultStreamDeckIcon(snippetType);
  const fallbackBackground = fallback.background ?? (snippetType === "video" ? "#1e1b4b" : "#111827");
  const fallbackForeground = fallback.kind !== "image" ? fallback.foreground ?? (snippetType === "video" ? "#a78bfa" : "#38bdf8") : snippetType === "video" ? "#a78bfa" : "#38bdf8";
  const background = icon.background ?? fallbackBackground;
  const foreground = icon.kind !== "image" ? icon.foreground ?? fallbackForeground : fallbackForeground;
  const preview = streamDeckIconToDataUrl(icon, title, snippetType);
  const imageIsValid = icon.kind !== "image" || isSafeImageDataUrl(icon.value);

  function updateKind(kind: StreamDeckIcon["kind"]) {
    if (kind === "emoji") {
      onChange({ kind, value: snippetType === "video" ? "▶" : "✨", background, foreground });
    } else if (kind === "generated") {
      onChange({ kind, background, foreground });
    } else if (kind === "image") {
      onChange({ kind, value: "", background });
    } else {
      onChange({ kind, value: snippetType === "video" ? "play" : "text", background, foreground });
    }
  }

  function updateBackground(value: string) {
    onChange({ ...icon, background: value });
  }

  function updateForeground(value: string) {
    if (icon.kind !== "image") {
      onChange({ ...icon, foreground: value });
    }
  }

  function updatePreset(value: string) {
    onChange({ kind: "preset", value: STREAM_DECK_PRESETS.includes(value as (typeof STREAM_DECK_PRESETS)[number]) ? value as (typeof STREAM_DECK_PRESETS)[number] : DEFAULT_PRESET[snippetType], background, foreground });
  }

  function updateEmoji(value: string) {
    onChange({ kind: "emoji", value, background, foreground });
  }

  function updateImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      onChange({ kind: "image", value: "", background });
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      onChange({ kind: "image", value: isSafeImageDataUrl(value) ? value : "", background });
    });
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <label className={`block font-medium mb-2 ${compact ? "text-xs" : "text-base"}`} style={{ color: "var(--color-text-secondary)" }}>
        Icon
      </label>
      <div className={`flex gap-3 items-start ${compact ? "gap-2" : ""}`}>
        <img src={preview} alt="" className={`${compact ? "w-14 h-14 rounded-lg" : "w-20 h-20 rounded-xl"}`} data-testid={`${testIdPrefix}-preview`} />
        <div className="grid grid-cols-2 gap-3 flex-1">
          <select
            value={icon.kind}
            onChange={(e) => updateKind(e.target.value as StreamDeckIcon["kind"])}
            className={`${compact ? "px-2 py-1 text-sm" : "px-3 py-2 text-md"} rounded`}
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            data-testid={`${testIdPrefix}-kind`}
          >
            <option value="preset">Preset</option>
            <option value="emoji">Emoji</option>
            <option value="generated">Generated initials</option>
            <option value="image">Image</option>
          </select>
          {icon.kind === "preset" ? (
            <select
              value={icon.value}
              onChange={(e) => updatePreset(e.target.value)}
              className={`${compact ? "px-2 py-1 text-sm" : "px-3 py-2 text-md"} rounded`}
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              data-testid={`${testIdPrefix}-preset`}
            >
              {STREAM_DECK_PRESETS.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
            </select>
          ) : icon.kind === "emoji" ? (
            <input
              value={icon.value}
              onChange={(e) => updateEmoji(e.target.value)}
              className={`${compact ? "px-2 py-1 text-sm" : "px-3 py-2 text-md"} rounded`}
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              data-testid={`${testIdPrefix}-emoji`}
            />
          ) : icon.kind === "image" ? (
            <label className={`${compact ? "px-2 py-1 text-sm" : "px-3 py-2 text-md"} rounded cursor-pointer text-center`}
              style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
              Choose image
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={updateImage} className="hidden" data-testid={`${testIdPrefix}-image`} />
            </label>
          ) : (
            <div className={`${compact ? "px-2 py-1 text-sm" : "px-3 py-2 text-md"} rounded`} style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
              Uses title initials
            </div>
          )}
          <input
            type="color"
            aria-label="Icon background"
            value={background}
            onChange={(e) => updateBackground(e.target.value)}
            className={`${compact ? "h-8" : "h-10"} w-full rounded`}
            data-testid={`${testIdPrefix}-background`}
          />
          {icon.kind !== "image" ? (
            <input
              type="color"
              aria-label="Icon foreground"
              value={foreground}
              onChange={(e) => updateForeground(e.target.value)}
              className={`${compact ? "h-8" : "h-10"} w-full rounded`}
              data-testid={`${testIdPrefix}-foreground`}
            />
          ) : (
            <p className="text-xs self-center" style={{ color: imageIsValid ? "var(--color-text-secondary)" : "var(--color-danger)" }}>
              {imageIsValid ? "Cropped to fit" : "Use PNG, JPG, WebP, or GIF under 750KB"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default IconEditor;
