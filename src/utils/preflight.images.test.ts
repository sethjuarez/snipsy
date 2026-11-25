import { describe, expect, it } from "vitest";
import { computePreflight } from "./preflight";
import type { Script, TextSnippet } from "../types";
import { TOKEN_GRAMMAR } from "./snippetText";

const snippet = (id: string, text: string, delivery: TextSnippet["delivery"] = "fast-type"): TextSnippet => ({
  id, title: id, description: "", text, hotkey: "CmdOrControl+Shift+1", delivery,
});

const imageCheck = (textSnippets: TextSnippet[], availableImageKeys: ReadonlySet<string> | null) =>
  computePreflight({ textSnippets, videoSnippets: [], automations: [], availableImageKeys })
    .checks.find((check) => check.id === "images");

const tokenChecks = (textSnippets: TextSnippet[], variableNames: ReadonlySet<string> | null, tokenGrammar: number | null = null) =>
  computePreflight({ textSnippets, videoSnippets: [], automations: [], variableNames, tokenGrammar })
    .checks.filter((check) => check.id === "tokens");

describe("computePreflight images", () => {
  it("is silent until images load and when every reference resolves", () => {
    expect(imageCheck([snippet("a", "{{image:gone.png}}")], null)).toBeUndefined();
    expect(imageCheck([snippet("a", "hi {{image:logo.png}}")], new Set(["logo.png"]))).toBeUndefined();
  });

  it("warns about missing images and paste delivery, leaving malformed tokens to the token check", () => {
    const check = imageCheck([
      snippet("missing", "{{image:gone.png}}"),
      snippet("pasted", "{{image:logo.png}}", "paste"),
      snippet("broken", "{{image:logo.png"),
      snippet("fine", "{{image:logo.png}}"),
    ], new Set(["logo.png"]));
    expect(check?.state).toBe("warn");
    expect(check?.label).toBe("2 snippets with image problems");
    expect(check?.detail).toBe("Fix the images in: missing, pasted.");
  });
});

describe("computePreflight tokens", () => {
  it("warns about malformed tokens and undefined variables, but not raw snippets", () => {
    const checks = tokenChecks([
      snippet("broken", "{{image:logo.png"),
      snippet("undefined", "{{var:host}} and {{var:region}}"),
      { ...snippet("raw", "{{date:nope}}"), raw: true },
      snippet("fine", "{{var:region}} {{cursor}} {{date:iso}}"),
      snippet("literal", "style={{cursor:'pointer'}}"),
    ], new Set(["region"]));
    expect(checks).toHaveLength(1);
    expect(checks[0].label).toBe("2 snippets with token problems");
    expect(checks[0].detail).toContain("broken, undefined.");
  });

  it("checks automation URLs and titles, linking to Variables when one is undefined", () => {
    const site = (title: string, url: string): Script => ({
      id: title, title, description: "",
      contributionGroups: [{ id: "g", title: "Step", contributions: [{ id: `${title}-site`, kind: "openSite", title, url }] }],
    });
    const run = (automations: Script[], textSnippets: TextSnippet[] = []) =>
      computePreflight({ textSnippets, videoSnippets: [], automations, variableNames: new Set(["host"]) })
        .checks.filter((check) => check.id === "tokens");

    expect(run([site("ok", "https://{{var:host}}/{{date:iso}}")])).toEqual([]);
    const [check] = run([site("cursor", "https://x/{{cursor}}")], [snippet("text", "{{var:region}}")]);
    expect(check.label).toBe("1 snippet and 1 automation with token problems");
    expect(check.fix).toEqual({ view: "variables", label: "Open Variables" });
    expect(run([site("cursor", "https://x/{{cursor}}")])[0].fix).toBeUndefined();
  });

  it("skips the variable check until variables are known", () => {
    expect(tokenChecks([snippet("a", "{{var:host}}")], null)).toEqual([]);
  });

  it("warns when a newer Snipsy wrote the project", () => {
    expect(tokenChecks([], null, TOKEN_GRAMMAR)).toEqual([]);
    expect(tokenChecks([], null, TOKEN_GRAMMAR + 1)[0]?.label).toBe("Project made by a newer Snipsy");
  });
});