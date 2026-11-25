import type { Script, TextSnippet, VideoSnippet } from "../types";
import { assignHotkeys, collectHotkeyOwners } from "./hotkeys";
import type { AppView } from "../components/Sidebar";
import { snippetTextProblems, TOKEN_GRAMMAR } from "./snippetText";
import { automationTokenProblem, variableUsage } from "./variableUsage";

export type PreflightState = "pass" | "warn" | "fail";

export interface PreflightCheck {
  id: "hotkeys" | "problems" | "unassigned" | "sources" | "images" | "tokens" | "elevation";
  state: PreflightState;
  label: string;
  detail?: string;
  /** Where to go to fix it. */
  fix?: { view: AppView; label: string };
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
  /** Names of the project's variables; null skips the undefined-variable check. */
  variableNames?: ReadonlySet<string> | null;
  /** The project's token grammar version; null for projects made before tokens. */
  tokenGrammar?: number | null;
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

  // Delivery-specific image problems belong to the images check below.
  const tokenProblem = (snippet: TextSnippet) =>
    snippetTextProblems(snippet.text, { delivery: "fast-type", raw: snippet.raw, images: null, variables: input.variableNames ?? null });
  const tokenBroken = input.textSnippets.filter((snippet) => tokenProblem(snippet) !== null);
  const automationsBroken = input.automations.filter(
    (script) => automationTokenProblem(script, input.variableNames ?? null) !== null,
  );
  if (tokenBroken.length > 0 || automationsBroken.length > 0) {
    const counts = [
      tokenBroken.length > 0 ? plural(tokenBroken.length, "snippet") : null,
      automationsBroken.length > 0 ? plural(automationsBroken.length, "automation") : null,
    ].filter(Boolean);
    const defined = input.variableNames;
    const undefinedNames = defined
      ? [...variableUsage(input.textSnippets, input.automations).keys()].filter((name) => !defined.has(name))
      : [];
    checks.push({
      id: "tokens",
      state: "warn",
      label: `${counts.join(" and ")} with token problems`,
      detail: `Fix the {{…}} tokens in: ${[...tokenBroken, ...automationsBroken].map((item) => item.title).join(", ")}. They fail before typing or opening anything.`,
      ...(undefinedNames.length > 0 ? { fix: { view: "variables" as const, label: "Open Variables" } } : {}),
    });
  }
  if ((input.tokenGrammar ?? 0) > TOKEN_GRAMMAR) {
    checks.push({
      id: "tokens",
      state: "warn",
      label: "Project made by a newer Snipsy",
      detail: "Some {{…}} tokens may type literally. Update Snipsy before presenting.",
    });
  }

  if (input.availableImageKeys) {
    const available = input.availableImageKeys;
    const broken = input.textSnippets.filter(
      (snippet) =>
        tokenProblem(snippet) === null &&
        snippetTextProblems(snippet.text, { delivery: snippet.delivery, raw: snippet.raw, images: available, variables: null }) !== null,
    );
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
