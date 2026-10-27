import { describe, expect, it } from "vitest";
import { computePreflight } from "./preflight";
import type { TextSnippet } from "../types";

const snippet = (id: string, text: string, delivery: TextSnippet["delivery"] = "fast-type"): TextSnippet => ({
  id, title: id, description: "", text, hotkey: "CmdOrControl+Shift+1", delivery,
});

const imageCheck = (textSnippets: TextSnippet[], availableImageKeys: ReadonlySet<string> | null) =>
  computePreflight({ textSnippets, videoSnippets: [], automations: [], availableImageKeys })
    .checks.find((check) => check.id === "images");

describe("computePreflight images", () => {
  it("is silent until images load and when every reference resolves", () => {
    expect(imageCheck([snippet("a", "{{image:gone.png}}")], null)).toBeUndefined();
    expect(imageCheck([snippet("a", "hi {{image:logo.png}}")], new Set(["logo.png"]))).toBeUndefined();
  });

  it("warns about missing images, paste delivery, and malformed references", () => {
    const check = imageCheck([
      snippet("missing", "{{image:gone.png}}"),
      snippet("pasted", "{{image:logo.png}}", "paste"),
      snippet("broken", "{{image:logo.png"),
      snippet("fine", "{{image:logo.png}}"),
    ], new Set(["logo.png"]));
    expect(check?.state).toBe("warn");
    expect(check?.label).toBe("3 snippets with image problems");
    expect(check?.detail).toBe("Fix the images in: missing, pasted, broken.");
  });
});