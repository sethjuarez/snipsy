import { describe, expect, it } from "vitest";
import type { Script, TextSnippet } from "../types";
import { automationTokenProblem, missingVariables, usageCount, variableUsage } from "./variableUsage";

const snippet = (title: string, text: string, raw?: boolean): TextSnippet => ({
  id: title, title, description: "", text, hotkey: "", delivery: "fast-type", raw,
});

const automation = (title: string, sites: { title?: string; url: string }[]): Script => ({
  id: title, title, description: "",
  contributionGroups: [{ id: "g", title: "Step", contributions: sites.map((site, i) => ({ id: `${title}-${i}`, kind: "openSite", ...site })) }],
});

describe("variableUsage", () => {
  it("counts each snippet or automation once and skips raw snippets", () => {
    const usage = variableUsage(
      [snippet("intro", "{{var:host}} {{var:host}}"), snippet("raw", "{{var:host}}", true), snippet("plain", "hi")],
      [automation("portal", [{ title: "Open {{var:host}}", url: "https://{{var:host}}/{{var:path}}" }])],
    );
    expect(usage.get("host")).toEqual({ snippets: ["intro"], automations: ["portal"] });
    expect(usageCount(usage.get("host"))).toBe(2);
    expect(usageCount(usage.get("nope"))).toBe(0);
    expect(missingVariables(usage, [{ name: "host", value: "x" }])).toEqual(["path"]);
  });

  it("ignores automation fields that use snippet-only tokens", () => {
    const script = automation("bad", [{ url: "https://{{var:host}}/{{cursor}}" }]);
    expect(variableUsage([], [script]).size).toBe(0);
    expect(automationTokenProblem(script, new Set(["host"]))).toBe("{{cursor}} only works in snippet text.");
    expect(automationTokenProblem(automation("ok", [{ url: "https://{{var:host}}" }]), new Set(["host"]))).toBeNull();
  });
});
