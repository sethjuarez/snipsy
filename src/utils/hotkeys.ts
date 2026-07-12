import { isMacPlatform } from "./platform";

export type HotkeyKind = "text" | "video" | "automation";

export interface HotkeyOwner {
  id: string;
  title: string;
  hotkey: string;
  kind: HotkeyKind;
}

export type HotkeyStatus =
  | { state: "empty"; message: string }
  | { state: "invalid"; message: string }
  | { state: "conflict"; message: string; conflict: HotkeyOwner }
  | { state: "available"; message: string };

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

const MODIFIER_NAMES = new Set(["CmdOrControl", "Control", "Ctrl", "Command", "Cmd", "Meta", "Shift", "Alt", "Option"]);

export function formatKeyCombo(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CmdOrControl");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");

  const { code } = event;
  if (!MODIFIER_CODES.has(code)) {
    if (code.startsWith("Digit")) {
      parts.push(code.slice(5));
    } else if (code.startsWith("Key")) {
      parts.push(code.slice(3));
    } else if (code.startsWith("Numpad")) {
      parts.push(`num${code.slice(6)}`);
    } else {
      parts.push(code);
    }
  }

  return parts.join("+");
}

export function normalizeHotkey(hotkey: string): string {
  return hotkey.trim().toLowerCase();
}

export function displayHotkey(hotkey: string): string {
  const macPlatform = isMacPlatform();
  const primaryModifier = macPlatform ? "Command" : "Ctrl";
  return hotkey
    .split("+")
    .map((part) => {
      const trimmed = part.trim();
      const normalized = trimmed.toLowerCase();
      if (normalized === "cmdorcontrol" || normalized === "commandorcontrol") {
        return primaryModifier;
      }
      if (macPlatform && normalized === "alt") {
        return "Option";
      }
      return trimmed;
    })
    .filter(Boolean)
    .join("+");
}

export function validateHotkey(
  hotkey: string,
  owners: HotkeyOwner[],
  currentId?: string,
): HotkeyStatus {
  const normalized = normalizeHotkey(hotkey);
  if (!normalized) {
    return { state: "empty", message: "Capture a hotkey before saving." };
  }

  const parts = hotkey.split("+").map((part) => part.trim()).filter(Boolean);
  const hasModifier = parts.some((part) => MODIFIER_NAMES.has(part));
  const hasKey = parts.some((part) => !MODIFIER_NAMES.has(part));
  if (!hasModifier || !hasKey) {
    return { state: "invalid", message: `Use at least one modifier plus one key, like ${displayHotkey("CmdOrControl+Shift+1")}.` };
  }

  const conflict = owners.find((owner) => owner.id !== currentId && normalizeHotkey(owner.hotkey) === normalized);
  if (conflict) {
    return {
      state: "conflict",
      message: `Already used by ${conflict.title}.`,
      conflict,
    };
  }

  return { state: "available", message: "Available in this project." };
}

export function collectHotkeyOwners(
  textSnippets: Array<{ id: string; title: string; hotkey: string }>,
  videoSnippets: Array<{ id: string; title: string; hotkey: string }>,
  automations: Array<{ id: string; title: string; hotkey?: string }>,
): HotkeyOwner[] {
  return [
    ...textSnippets.map((snippet) => ({
      id: snippet.id,
      title: snippet.title,
      hotkey: snippet.hotkey,
      kind: "text" as const,
    })),
    ...videoSnippets.map((snippet) => ({
      id: snippet.id,
      title: snippet.title,
      hotkey: snippet.hotkey,
      kind: "video" as const,
    })),
    ...automations
      .filter((automation) => Boolean(automation.hotkey))
      .map((automation) => ({
        id: automation.id,
        title: automation.title,
        hotkey: automation.hotkey ?? "",
        kind: "automation" as const,
      })),
  ];
}
