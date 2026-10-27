import { describe, expect, it } from "vitest";
import cases from "../../tests/fixtures/image-tokens.json";
import slugCases from "../../tests/fixtures/image-slugs.json";
import { imageRefProblems, imageToken, isImageKey, parseSnippetText, referencedImages } from "./snippetText";

describe("parseSnippetText", () => {
  it.each(cases)("matches the shared fixture for %j", (testCase) => {
    const result = parseSnippetText(testCase.text);
    if ("segments" in testCase && testCase.segments) {
      expect(result).toEqual({ ok: true, segments: testCase.segments });
    } else {
      expect(result).toEqual({ ok: false, error: (testCase as { error: string }).error });
    }
  });

  it("accepts every key the importer generates", () => {
    for (const slugCase of slugCases) {
      expect(isImageKey(`${slugCase.slug}.png`)).toBe(true);
    }
  });

  it("round-trips a token", () => {
    expect(parseSnippetText(imageToken("logo.png"))).toEqual({ ok: true, segments: [{ kind: "image", value: "logo.png" }] });
  });
});

describe("image reference checks", () => {
  const available = new Set(["a.png"]);

  it("lists each key once", () => {
    expect(referencedImages("{{image:b.png}} {{image:a.png}} {{image:b.png}}")).toEqual(["b.png", "a.png"]);
  });

  it("reports parse errors, paste delivery, and missing images", () => {
    expect(imageRefProblems("plain", "paste", available)).toBeNull();
    expect(imageRefProblems("{{image:a.png}}", "fast-type", available)).toBeNull();
    expect(imageRefProblems("{{image:", "fast-type", available)).toMatch(/^Unclosed/);
    expect(imageRefProblems("{{image:a.png}}", "paste", available)).toBe("Images only work with Fast-type delivery.");
    expect(imageRefProblems("{{image:b.png}}", "fast-type", available)).toBe("Missing image: b.png");
    expect(imageRefProblems("{{image:b.png}}", "fast-type", null)).toBeNull();
  });
});
