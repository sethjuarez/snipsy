import { describe, expect, it } from "vitest";
import type { PauseSpotlight } from "../types";
import {
  isSpotlightBlurEnabled,
  isSpotlightDimEnabled,
  isSpotlightHaloEnabled,
  spotlightsEqual,
} from "./spotlight";

const base: PauseSpotlight = {
  regions: [{ type: "rectangle", x: 10, y: 10, width: 20, height: 20 }],
};

describe("spotlight effect toggles", () => {
  it("defaults blur, dim, and halo on", () => {
    expect(isSpotlightBlurEnabled(base)).toBe(true);
    expect(isSpotlightDimEnabled(base)).toBe(true);
    expect(isSpotlightHaloEnabled(base)).toBe(true);
  });

  it("treats zero dimOpacity as dim off", () => {
    const off = { ...base, style: { dimOpacity: 0 } };
    expect(isSpotlightDimEnabled(off)).toBe(false);
    expect(isSpotlightBlurEnabled(off)).toBe(true);
  });

  it("supports all effects off", () => {
    const plain = { ...base, style: { blur: 0, dimOpacity: 0, glow: false } };
    expect(isSpotlightBlurEnabled(plain)).toBe(false);
    expect(isSpotlightDimEnabled(plain)).toBe(false);
    expect(isSpotlightHaloEnabled(plain)).toBe(false);
  });

  it("detects dim changes in spotlight equality", () => {
    expect(spotlightsEqual(base, { ...base, style: { dimOpacity: 0 } })).toBe(false);
    expect(spotlightsEqual(base, { ...base, style: { dimOpacity: undefined } })).toBe(true);
  });
});
