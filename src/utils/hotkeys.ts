import type { HotkeyIssue } from "../services/backendService";
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

// Lowercase modifier names accepted by the backend parser (case-insensitive).
const MODIFIER_NAMES = new Set([
  "cmdorcontrol",
  "commandorcontrol",
  "cmdorctrl",
  "commandorctrl",
  "control",
  "ctrl",
  "command",
  "cmd",
  "meta",
  "super",
  "shift",
  "alt",
  "option",
]);
const isModifierName = (part: string) => MODIFIER_NAMES.has(part.toLowerCase());

export function formatKeyCombo(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (isMacPlatform()) {
    // On macOS, Command and the physical Control key are different modifiers.
    if (event.metaKey) parts.push("CmdOrControl");
    if (event.ctrlKey) parts.push("Control");
  } else if (event.ctrlKey || event.metaKey) {
    parts.push("CmdOrControl");
  }
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

const MODIFIER_ORDER = ["ctrl", "cmd", "alt", "shift"];

function canonicalPart(part: string, macPlatform: boolean): string {
  switch (part) {
    case "cmdorcontrol":
    case "commandorcontrol":
    case "cmdorctrl":
    case "commandorctrl":
      return macPlatform ? "cmd" : "ctrl";
    case "control":
      return "ctrl";
    case "command":
    case "meta":
    case "super":
      return "cmd";
    case "option":
      return "alt";
    default:
      return canonicalKey(part);
  }
}

// Mirrors the key aliases accepted by the backend's global-hotkey parser.
const KEY_ALIASES: Record<string, string> = {
  "`": "backquote",
  "\\": "backslash",
  "[": "bracketleft",
  "]": "bracketright",
  ",": "comma",
  "=": "equal",
  "-": "minus",
  ".": "period",
  "'": "quote",
  ";": "semicolon",
  "/": "slash",
  pausebreak: "pause",
  esc: "escape",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  up: "arrowup",
  numplus: "numadd",
  numpadplus: "numadd",
  volumedown: "audiovolumedown",
  volumeup: "audiovolumeup",
  volumemute: "audiovolumemute",
  mediatrackprev: "mediatrackprevious",
};

function canonicalKey(key: string): string {
  if (/^digit\d$/.test(key)) return key.slice(5);
  if (/^key[a-z]$/.test(key)) return key.slice(3);
  const aliased = KEY_ALIASES[key] ?? key;
  if (aliased.startsWith("numpad")) return KEY_ALIASES[`num${aliased.slice(6)}`] ?? `num${aliased.slice(6)}`;
  return aliased;
}

/** Canonical form so aliases (Ctrl vs CmdOrControl) and modifier order compare equal. */
export function normalizeHotkey(hotkey: string): string {
  const macPlatform = isMacPlatform();
  const parts = hotkey
    .split("+")
    .map((part) => canonicalPart(part.trim().toLowerCase(), macPlatform))
    .filter(Boolean);
  const modifiers = MODIFIER_ORDER.filter((modifier) => parts.includes(modifier));
  const keys = parts.filter((part) => !MODIFIER_ORDER.includes(part));
  return [...modifiers, ...keys].join("+");
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
  const hasModifier = parts.some(isModifierName);
  const keyCount = parts.filter((part) => !isModifierName(part)).length;
  if (!hasModifier || keyCount !== 1) {
    return { state: "invalid", message: `Use at least one modifier plus exactly one key, like ${displayHotkey("CmdOrControl+Shift+1")}.` };
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

export interface HotkeyProblem {
  tone: "warning" | "danger";
  label: string;
  detail: string;
}

/** Problem worth flagging on a list row, or null when the hotkey is fine (or optional and unset). */
export function hotkeyProblem(
  hotkey: string | undefined,
  owners: HotkeyOwner[],
  ownerId: string,
  optional = false,
): HotkeyProblem | null {
  const status = validateHotkey(hotkey ?? "", owners, ownerId);
  switch (status.state) {
    case "available":
      return null;
    case "empty":
      return optional ? null : { tone: "warning", label: "No hotkey", detail: "Assign a hotkey so this works in demo mode." };
    case "invalid":
      return { tone: "danger", label: "Invalid hotkey", detail: status.message };
    case "conflict":
      return { tone: "danger", label: "Hotkey conflict", detail: status.message };
  }
}

/** One line per hotkey demo mode could not arm, using snippet titles where known. */
export function describeHotkeyIssues(issues: HotkeyIssue[], owners: HotkeyOwner[]): string {
  const title = (id: string) => owners.find((owner) => owner.id === id)?.title ?? "Unknown snippet";
  return issues
    .map((issue) =>
      issue.kind === "duplicate"
        ? `${displayHotkey(issue.hotkey)}: ${title(issue.snippetId)} skipped (also used by ${title(issue.detail)})`
        : `${displayHotkey(issue.hotkey)}: ${title(issue.snippetId)} could not be registered (${issue.detail})`,
    )
    .join("\n");
}

export type HotkeyAssignmentState = "armed" | "duplicate" | "invalid" | "unassigned" | "failed";

export interface HotkeyAssignment {
  owner: HotkeyOwner;
  state: HotkeyAssignmentState;
  /** Owner that keeps the hotkey when this one is a duplicate. */
  keptBy?: HotkeyOwner;
  detail?: string;
}

/**
 * What demo mode does with each owner, in the order the store sends hotkeys
 * to the backend: the first owner of a hotkey is armed and later ones are
 * skipped. Pass the last demo's issues to mark hotkeys the OS refused.
 */
export function assignHotkeys(owners: HotkeyOwner[], issues: ReadonlyArray<HotkeyIssue> = []): HotkeyAssignment[] {
  // Key by owner and hotkey so a stale failure doesn't follow a changed hotkey.
  const failed = new Map(
    issues.filter((issue) => issue.kind === "failed").map((issue) => [`${issue.snippetId}\n${normalizeHotkey(issue.hotkey)}`, issue.detail]),
  );
  const keptBy = new Map<string, HotkeyOwner>();
  return owners.map((owner) => {
    const status = validateHotkey(owner.hotkey, []);
    if (status.state === "empty") return { owner, state: "unassigned" };
    if (status.state !== "available") return { owner, state: "invalid", detail: status.message };
    const key = normalizeHotkey(owner.hotkey);
    const kept = keptBy.get(key);
    if (kept) return { owner, state: "duplicate", keptBy: kept, detail: `Also used by ${kept.title}, which wins.` };
    keptBy.set(key, owner);
    const failure = failed.get(`${owner.id}\n${key}`);
    return failure !== undefined ? { owner, state: "failed", detail: failure } : { owner, state: "armed" };
  });
}