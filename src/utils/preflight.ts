import type { Script, TextSnippet, VideoSnippet } from "../types";
import { assignHotkeys, collectHotkeyOwners } from "./hotkeys";
import { imageRefProblems } from "./snippetText";

export type PreflightState = "pass" | "warn" | "fail";

export interface PreflightCheck {
  id: "hotkeys" | "problems" | "unassigned" | "sources" | "images" | "elevation";
  state: PreflightState;
  label: string;
  detail?: string;
}

export interface Preflight {
  checks: PreflightCheck[];
  /** Hotkeys demo mode will register (valid and not conflicting). */
  armedCount: number;
  /** Owner ids behind armedCount. */
  armedIds: string[];
  state: PreflightState;
}

export interface PreflightInput {
  textSnippets: TextSnippet[];
  videoSnippets: VideoSnippet[];
  automations: Script[];
  /** Project-relative video files on disk; null when not loaded yet. */
  availableVideoFiles?: ReadonlySet<string> | null;
  /** Keys of the project's images; null when not loaded yet. */
  availableImageKeys?: ReadonlySet<string> | null;
  /** Null when unknown. */
  elevated?: boolean | null;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Checks to show before and during demo mode. Only "no hotkeys" is a failure. */
export function computePreflight(input: PreflightInput): Preflight {
  const assignments = assignHotkeys(collectHotkeyOwners(input.textSnippets, input.videoSnippets, input.automations));
  const armedIds = assignments.filter((item) => item.state === "armed").map((item) => item.owner.id);
  const problemCount = assignments.filter((item) => item.state === "duplicate" || item.state === "invalid").length;
  const unassignedCount = assignments.filter((item) => item.state === "unassigned").length;
  const armedCount = armedIds.length;

  const checks: PreflightCheck[] = [
    armedCount > 0
      ? { id: "hotkeys", state: "pass", label: `${plural(armedCount, "hotkey")} ready to arm` }
      : { id: "hotkeys", state: "fail", label: "No hotkeys to arm", detail: "Add a snippet, clip, or automation with a hotkey." },
  ];

  if (problemCount > 0) {
    checks.push({
      id: "problems",
      state: "warn",
      label: `${plural(problemCount, "duplicate or invalid hotkey")} will be skipped`,
      detail: "The first item using a hotkey wins. Fix the rest on the Text, Clips, or Automations lists.",
    });
  }
  if (unassignedCount > 0) {
    checks.push({
      id: "unassigned",
      state: "warn",
      label: `${plural(unassignedCount, "snippet or clip", "snippets or clips")} without a hotkey`,
      detail: "They still work from Stream Deck, but not from the keyboard.",
    });
  }

  if (input.availableVideoFiles && input.videoSnippets.length > 0) {
    const missing = input.videoSnippets.filter((clip) => !input.availableVideoFiles?.has(clip.videoFile)).length;
    checks.push(missing > 0
      ? { id: "sources", state: "warn", label: `${plural(missing, "clip")} missing a source video`, detail: "Re-import the video or pick another source." }
      : { id: "sources", state: "pass", label: "All clip source videos found" });
  }

  if (input.availableImageKeys) {
    const available = input.availableImageKeys;
    const broken = input.textSnippets.filter((snippet) => imageRefProblems(snippet.text, snippet.delivery, available) !== null);
    if (broken.length > 0) {
      checks.push({
        id: "images",
        state: "warn",
        label: `${plural(broken.length, "snippet")} with image problems`,
        detail: `Fix the images in: ${broken.map((snippet) => snippet.title).join(", ")}.`,
      });
    }
  }

  if (input.elevated === false) {
    checks.push({
      id: "elevation",
      state: "warn",
      label: "Not running as administrator",
      detail: "Input protection needs admin rights. Use the shield in the title bar to restart as administrator.",
    });
  }

  const state: PreflightState = checks.some((check) => check.state === "fail")
    ? "fail"
    : checks.some((check) => check.state === "warn") ? "warn" : "pass";
  return { checks, armedCount, armedIds, state };
}

export const DEMO_INTRO_SEEN_KEY = "snipsy.demoIntroSeen";

/** Ask before starting the first time, and whenever nothing would be armed. */
export function shouldConfirmDemoStart(preflight: Preflight, storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): boolean {
  if (preflight.state === "fail") return true;
  try {
    return storage?.getItem(DEMO_INTRO_SEEN_KEY) !== "true";
  } catch {
    return true;
  }
}

/** Hotkeys actually registered: predicted ones minus those the OS rejected. */
export function liveArmedCount(preflight: Preflight, issues: ReadonlyArray<{ snippetId: string; kind: string }>): number {
  const failed = new Set(issues.filter((issue) => issue.kind === "failed").map((issue) => issue.snippetId));
  return preflight.armedIds.filter((id) => !failed.has(id)).length;
}
