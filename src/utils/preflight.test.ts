import { describe, expect, it } from "vitest";
import { computePreflight, DEMO_INTRO_SEEN_KEY, liveArmedCount, shouldConfirmDemoStart } from "./preflight";
import type { Script, TextSnippet, VideoSnippet } from "../types";

const text = (id: string, hotkey: string): TextSnippet => ({ id, title: id, description: "", text: "x", hotkey, delivery: "paste" });
const clip = (id: string, hotkey: string, videoFile = "videos/a.mp4"): VideoSnippet => ({
  id, title: id, description: "", videoFile, startTime: 0, endTime: 1, hotkey, speed: 1,
});
const automation = (id: string, hotkey?: string): Script => ({ id, title: id, description: "", hotkey });

const ids = (preflight: ReturnType<typeof computePreflight>) => preflight.checks.map((check) => `${check.id}:${check.state}`);

describe("computePreflight", () => {
  it("fails when nothing would be armed", () => {
    const preflight = computePreflight({ textSnippets: [], videoSnippets: [], automations: [] });
    expect(preflight.state).toBe("fail");
    expect(preflight.armedCount).toBe(0);
    expect(ids(preflight)).toEqual(["hotkeys:fail"]);
  });

  it("passes with valid hotkeys and found sources", () => {
    const preflight = computePreflight({
      textSnippets: [text("t", "CmdOrControl+Shift+1")],
      videoSnippets: [clip("v", "CmdOrControl+Shift+2")],
      automations: [automation("a", "CmdOrControl+Shift+3"), automation("b")],
      availableVideoFiles: new Set(["videos/a.mp4"]),
      elevated: true,
    });
    expect(preflight.state).toBe("pass");
    expect(preflight.armedCount).toBe(3);
    expect(ids(preflight)).toEqual(["hotkeys:pass", "sources:pass"]);
  });

  it("warns on conflicts, unassigned items, missing sources, and no elevation", () => {
    const preflight = computePreflight({
      textSnippets: [text("t1", "CmdOrControl+Shift+1"), text("t2", "CmdOrControl+Shift+1"), text("t3", ""), text("t4", "Shift")],
      videoSnippets: [clip("v", "CmdOrControl+Shift+2", "videos/missing.mp4")],
      automations: [],
      availableVideoFiles: new Set(["videos/a.mp4"]),
      elevated: false,
    });
    expect(preflight.state).toBe("warn");
    expect(preflight.armedCount).toBe(2);
    expect(preflight.armedIds).toEqual(["t1", "v"]);
    expect(ids(preflight)).toEqual(["hotkeys:pass", "problems:warn", "unassigned:warn", "sources:warn", "elevation:warn"]);
    expect(preflight.checks.find((check) => check.id === "problems")?.label).toMatch(/^2 duplicate or invalid hotkeys/);
  });

  it("arms the first owner of a duplicate, matching backend order", () => {
    const preflight = computePreflight({
      textSnippets: [text("t", "CmdOrControl+Shift+1")],
      videoSnippets: [clip("v", "ctrl+shift+1")],
      automations: [automation("a", "CmdOrControl+Shift+1")],
    });
    expect(preflight.armedIds).toEqual(["t"]);
    expect(preflight.checks.find((check) => check.id === "problems")?.label).toMatch(/^2 /);
  });

  it("skips source and elevation checks when unknown", () => {
    const preflight = computePreflight({
      textSnippets: [],
      videoSnippets: [clip("v", "CmdOrControl+Shift+2")],
      automations: [],
      availableVideoFiles: null,
      elevated: null,
    });
    expect(ids(preflight)).toEqual(["hotkeys:pass"]);
  });
});

describe("liveArmedCount", () => {
  const preflight = computePreflight({
    textSnippets: [text("t1", "CmdOrControl+Shift+1"), text("t2", "CmdOrControl+Shift+2")],
    videoSnippets: [],
    automations: [],
  });

  it("subtracts hotkeys the OS refused", () => {
    expect(liveArmedCount(preflight, [{ snippetId: "t2", kind: "failed" }])).toBe(1);
  });

  it("ignores duplicates already excluded by preflight", () => {
    expect(liveArmedCount(preflight, [{ snippetId: "t3", kind: "duplicate" }])).toBe(2);
  });
});

describe("shouldConfirmDemoStart", () => {
  const ready = computePreflight({ textSnippets: [text("t", "CmdOrControl+Shift+1")], videoSnippets: [], automations: [] });
  const empty = computePreflight({ textSnippets: [], videoSnippets: [], automations: [] });
  const storage = (value: string | null) => ({ getItem: (key: string) => (key === DEMO_INTRO_SEEN_KEY ? value : null) });

  it("asks the first time", () => {
    expect(shouldConfirmDemoStart(ready, storage(null))).toBe(true);
  });

  it("skips once the intro was dismissed", () => {
    expect(shouldConfirmDemoStart(ready, storage("true"))).toBe(false);
  });

  it("always asks when nothing would be armed", () => {
    expect(shouldConfirmDemoStart(empty, storage("true"))).toBe(true);
  });

  it("asks when storage throws", () => {
    expect(shouldConfirmDemoStart(ready, { getItem: () => { throw new Error("blocked"); } })).toBe(true);
  });
});
