import { getBackend } from "../services";
import { useProjectStore } from "../stores/projectStore";
import type { Script, TextSnippet } from "../types";

export const SAMPLE_PROJECT_NAME = "Snipsy Sample";
export const SAMPLE_PROJECT_DESCRIPTION = "A tour of text snippets and automations. Edit or delete anything.";

export function sampleTextSnippets(): TextSnippet[] {
  return [
    {
      id: crypto.randomUUID(),
      title: "Say hello",
      description: "Pastes a greeting instantly.",
      text: "Hello from Snipsy! 👋",
      hotkey: "CmdOrControl+Shift+7",
      delivery: "paste",
    },
    {
      id: crypto.randomUUID(),
      title: "Type some code",
      description: "Types code character by character so the audience can follow.",
      text: "function greet(name) {\n  return `Hello, ${name}!`;\n}",
      hotkey: "CmdOrControl+Shift+8",
      delivery: "fast-type",
      typeDelay: 30,
    },
  ];
}

export function sampleAutomation(): Script {
  return {
    id: crypto.randomUUID(),
    title: "Open the docs",
    description: "Opens the Snipsy docs in your browser.",
    hotkey: "CmdOrControl+Shift+9",
    contributionGroups: [
      {
        id: crypto.randomUUID(),
        title: "Browser",
        contributions: [
          { id: crypto.randomUUID(), kind: "openSite", title: "Snipsy docs", url: "https://snipsy.dev" },
        ],
      },
    ],
  };
}

/**
 * Writes a sample project to `path`, then opens it. Files are written before
 * the project becomes active so a failure leaves the user on the welcome screen.
 */
export async function createSampleProject(path: string): Promise<void> {
  const backend = getBackend();
  await backend.createProject(path, SAMPLE_PROJECT_NAME, SAMPLE_PROJECT_DESCRIPTION);
  await backend.saveTextSnippets(path, sampleTextSnippets());
  await backend.saveAutomation(path, sampleAutomation());
  await useProjectStore.getState().openProject(path);
}
