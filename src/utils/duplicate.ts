import type { Script, TextSnippet, VideoSnippet } from "../types";

// Copies drop the hotkey: two owners of one hotkey would conflict in demo mode.

export function copyTitle(title: string): string {
  return `${title} (copy)`;
}

export function duplicateTextSnippet(snippet: TextSnippet): TextSnippet {
  return { ...snippet, id: crypto.randomUUID(), title: copyTitle(snippet.title), hotkey: "" };
}

export function duplicateVideoSnippet(snippet: VideoSnippet): VideoSnippet {
  return {
    ...snippet,
    id: crypto.randomUUID(),
    title: copyTitle(snippet.title),
    hotkey: "",
    pauseStops: snippet.pauseStops?.map((stop) => structuredClone(stop)),
    transitionActions: snippet.transitionActions?.map((action) => ({ ...action })),
  };
}

export function duplicateAutomation(script: Script): Script {
  const copy: Script = {
    ...script,
    id: crypto.randomUUID(),
    title: copyTitle(script.title),
    contributionGroups: script.contributionGroups?.map((group) => ({
      ...group,
      id: crypto.randomUUID(),
      contributions: group.contributions.map((contribution) => ({ ...contribution, id: crypto.randomUUID() })),
    })),
  };
  delete copy.hotkey;
  return copy;
}
