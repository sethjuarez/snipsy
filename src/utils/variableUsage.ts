import type { ProjectVariable, Script, TextSnippet } from "../types";
import { fieldTokenProblems, fieldVariables, referencedVariables } from "./snippetText";

/** Titles of the snippets and automations that use one variable. */
export interface VariableUsage {
  snippets: string[];
  automations: string[];
}

/** The URL and title of every Open site action, the fields that accept tokens. */
export function automationFields(script: Script): string[] {
  return (script.contributionGroups ?? []).flatMap((group) =>
    group.contributions.flatMap((contribution) => [contribution.title ?? "", contribution.url]),
  );
}

/** Variables referenced by an automation, in first-use order. */
export function automationVariables(script: Script): string[] {
  return [...new Set(automationFields(script).flatMap(fieldVariables))];
}

/** First token problem in an automation's fields; null when it would resolve. */
export function automationTokenProblem(script: Script, variables: ReadonlySet<string> | null): string | null {
  for (const field of automationFields(script)) {
    const problem = fieldTokenProblems(field, variables);
    if (problem) return problem;
  }
  return null;
}

/** Who uses each variable name. Each snippet or automation counts once, however often it repeats a name. */
export function variableUsage(textSnippets: readonly TextSnippet[], automations: readonly Script[]): Map<string, VariableUsage> {
  const usage = new Map<string, VariableUsage>();
  const entry = (name: string) => {
    let found = usage.get(name);
    if (!found) usage.set(name, (found = { snippets: [], automations: [] }));
    return found;
  };
  for (const snippet of textSnippets) {
    for (const name of referencedVariables(snippet.text, snippet.raw)) entry(name).snippets.push(snippet.title);
  }
  for (const script of automations) {
    for (const name of automationVariables(script)) entry(name).automations.push(script.title);
  }
  return usage;
}

export const usageCount = (usage: VariableUsage | undefined) => (usage ? usage.snippets.length + usage.automations.length : 0);

/** Names something references that the project doesn't define, sorted. */
export function missingVariables(usage: ReadonlyMap<string, VariableUsage>, variables: readonly ProjectVariable[]): string[] {
  const defined = new Set(variables.map((variable) => variable.name));
  return [...usage.keys()].filter((name) => !defined.has(name)).sort();
}
