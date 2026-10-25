import { afterEach, describe, expect, it } from "vitest";
import { KEEP_AWAKE_KEY, readKeepAwake, writeKeepAwake } from "./keepAwake";

describe("keepAwake preference", () => {
  afterEach(() => localStorage.removeItem(KEEP_AWAKE_KEY));

  it("defaults to on", () => {
    expect(readKeepAwake()).toBe(true);
  });

  it("round-trips the stored choice", () => {
    writeKeepAwake(false);
    expect(readKeepAwake()).toBe(false);
    writeKeepAwake(true);
    expect(readKeepAwake()).toBe(true);
  });
});