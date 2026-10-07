import type { StreamDeckIcon } from "../types";

export const STREAM_DECK_PRESETS = ["text", "code", "terminal", "play", "rocket"] as const;

export function defaultStreamDeckIcon(snippetType: "text" | "video"): StreamDeckIcon {
  return {
    kind: "preset",
    value: snippetType === "video" ? "play" : "text",
    background: snippetType === "video" ? "#1e1b4b" : "#111827",
    foreground: snippetType === "video" ? "#a78bfa" : "#38bdf8",
  };
}

export function normalizeStreamDeckIcon(
  icon: StreamDeckIcon | undefined,
  snippetType: "text" | "video",
): StreamDeckIcon {
  return icon ?? defaultStreamDeckIcon(snippetType);
}

export function streamDeckIconToSvg(
  icon: StreamDeckIcon | undefined,
  title: string,
  snippetType: "text" | "video",
  unavailableReason?: string,
) {
  const resolved = normalizeStreamDeckIcon(icon, snippetType);
  const background = sanitizeColor(resolved.background, snippetType === "video" ? "#1e1b4b" : "#111827");
  const foreground = sanitizeColor(resolved.foreground, snippetType === "video" ? "#a78bfa" : "#38bdf8");
  const dim = unavailableReason ? 0.42 : 1;
  const glyph = glyphForIcon(resolved, title);
  const badge = unavailableReason
    ? `<circle cx="78" cy="22" r="12" fill="#f59e0b"/><text x="78" y="28" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#111827">!</text>`
    : "";

  return `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="18" fill="${background}"/>
  <g opacity="${dim}">
    <text x="50" y="50" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${Array.from(glyph).length > 2 ? 26 : 34}" font-weight="700" fill="${foreground}">${escapeXml(glyph)}</text>
  </g>
  ${badge}
</svg>`;
}

export function streamDeckIconToDataUrl(
  icon: StreamDeckIcon | undefined,
  title: string,
  snippetType: "text" | "video",
  unavailableReason?: string,
) {
  return `data:image/svg+xml,${encodeURIComponent(streamDeckIconToSvg(icon, title, snippetType, unavailableReason))}`;
}

function glyphForIcon(icon: StreamDeckIcon, title: string) {
  if (icon.kind === "emoji") return Array.from(icon.value.trim()).slice(0, 4).join("") || "★";
  if (icon.kind === "generated") return initials(title);

  switch (icon.value) {
    case "code":
      return "</>";
    case "terminal":
      return ">_";
    case "play":
      return "▶";
    case "rocket":
      return "🚀";
    case "text":
    default:
      return "T";
  }
}

function initials(title: string) {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "S";
  return parts.slice(0, 2).map((part) => Array.from(part)[0]?.toUpperCase()).join("");
}

function sanitizeColor(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
