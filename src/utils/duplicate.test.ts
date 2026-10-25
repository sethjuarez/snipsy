import { describe, expect, it } from "vitest";
import type { Script, TextSnippet, VideoSnippet } from "../types";
import { duplicateAutomation, duplicateTextSnippet, duplicateVideoSnippet } from "./duplicate";

describe("duplicate helpers", () => {
  it("copies a text snippet with a new id and no hotkey", () => {
    const source: TextSnippet = { id: "a", title: "Intro", description: "", text: "hi", hotkey: "CmdOrControl+1", delivery: "paste" };
    const copy = duplicateTextSnippet(source);
    expect(copy.id).not.toBe("a");
    expect(copy.title).toBe("Intro (copy)");
    expect(copy.hotkey).toBe("");
    expect(copy.text).toBe("hi");
  });

  it("deep-copies clip moments so edits don't leak into the original", () => {
    const source: VideoSnippet = {
      id: "v", title: "Clip", description: "", videoFile: "videos/a.mp4", startTime: 0, endTime: 5,
      hotkey: "CmdOrControl+2", speed: 1, pauseStops: [{ time: 1, zoom: { x: 10, y: 10, scale: 2 } }],
    };
    const copy = duplicateVideoSnippet(source);
    copy.pauseStops![0].zoom!.scale = 4;
    expect(source.pauseStops![0].zoom!.scale).toBe(2);
    expect(copy.hotkey).toBe("");
  });

  it("gives automation steps fresh ids and drops the hotkey", () => {
    const source: Script = {
      id: "s", title: "Setup", description: "", hotkey: "CmdOrControl+3",
      contributionGroups: [{ id: "g", title: "Tabs", contributions: [{ id: "c", kind: "openSite", url: "https://example.com" }] }],
    };
    const copy = duplicateAutomation(source);
    expect("hotkey" in copy).toBe(false);
    expect(copy.contributionGroups![0].id).not.toBe("g");
    expect(copy.contributionGroups![0].contributions[0].id).not.toBe("c");
    expect(copy.contributionGroups![0].contributions[0].url).toBe("https://example.com");
  });
});
