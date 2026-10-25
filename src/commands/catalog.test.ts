import { describe, expect, it, vi } from "vitest";
import { ALL_SHORTCUTS, buildCommands, matchesShortcut, NAV_SHORTCUTS, type CommandContext } from "./catalog";
import { NAV_SECTIONS } from "../components/Sidebar";
import type { Script, TextSnippet, VideoSnippet } from "../types";

const text: TextSnippet = { id: "t1", title: "Greeting", description: "hello", text: "Hi", hotkey: "CmdOrControl+Shift+1", delivery: "paste" };
const clip: VideoSnippet = { id: "v1", title: "Intro", description: "", videoFile: "intro.mp4", startTime: 0, endTime: 5, hotkey: "", speed: 1 };
const script: Script = { id: "s1", title: "Open docs", description: "" };

function makeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    demoMode: false,
    textSnippets: [text],
    videoSnippets: [clip],
    automations: [script],
    runningAutomationId: null,
    navigate: vi.fn(),
    newTextSnippet: vi.fn(),
    newClip: vi.fn(),
    newAutomation: vi.fn(),
    toggleDemo: vi.fn(),
    closeProject: vi.fn(),
    exportProject: vi.fn(),
    renameProject: vi.fn(),
    showShortcuts: vi.fn(),
    openSettings: vi.fn(),
    toggleSidebar: vi.fn(),
    editText: vi.fn(),
    editClip: vi.fn(),
    playClip: vi.fn(),
    editAutomation: vi.fn(),
    runAutomation: vi.fn(),
    ...overrides,
  };
}

const find = (ctx: CommandContext, id: string) => {
  const command = buildCommands(ctx).find((candidate) => candidate.id === id);
  if (!command) throw new Error(`missing ${id}`);
  return command;
};

describe("NAV_SHORTCUTS", () => {
  it("numbers every nav item in sidebar order", () => {
    const ids = NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.id));
    expect(ids.map((id) => NAV_SHORTCUTS[id])).toEqual(ids.map((_, index) => `CmdOrControl+${index + 1}`));
  });

  it("lists unique shortcuts in ALL_SHORTCUTS", () => {
    const keys = ALL_SHORTCUTS.map((item) => item.shortcut);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("buildCommands", () => {
  it("has unique ids", () => {
    const ids = buildCommands(makeContext()).map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exports the project from the palette", () => {
    const ctx = makeContext();
    const command = find(ctx, "project.export");
    expect(command.group).toBe("Project");
    expect(command.keywords).toContain("zip");
    command.run();
    expect(ctx.exportProject).toHaveBeenCalled();
  });

  it("wires navigation and create commands", () => {
    const ctx = makeContext();
    find(ctx, "nav.automations").run();
    expect(ctx.navigate).toHaveBeenCalledWith("automations");
    find(ctx, "create.clip").run();
    expect(ctx.newClip).toHaveBeenCalled();
  });

  it("reaches the Source videos tab from the palette without a number shortcut", () => {
    const ctx = makeContext();
    const command = find(ctx, "nav.videos");
    expect(command.title).toBe("Go to Source videos");
    expect(command.shortcut).toBeUndefined();
    expect(command.keywords).toEqual(["Content", "Clips"]);
    command.run();
    expect(ctx.navigate).toHaveBeenCalledWith("videos");
  });

  it("labels the demo toggle by state", () => {
    expect(find(makeContext(), "demo.toggle").title).toBe("Start demo");
    expect(find(makeContext({ demoMode: true }), "demo.toggle").title).toBe("Stop demo");
  });

  it("adds item commands that pass the item through", () => {
    const ctx = makeContext();
    const edit = find(ctx, "text.edit.t1");
    expect(edit.title).toBe("Edit Greeting");
    expect(edit.detail).not.toBe("CmdOrControl+Shift+1");
    edit.run();
    expect(ctx.editText).toHaveBeenCalledWith(text);

    expect(find(ctx, "clip.play.v1").detail).toBe("No hotkey");
    find(ctx, "clip.play.v1").run();
    expect(ctx.playClip).toHaveBeenCalledWith(clip);
    find(ctx, "automation.edit.s1").run();
    expect(ctx.editAutomation).toHaveBeenCalledWith(script);
  });

  it("opens settings from the palette and lists its shortcut", () => {
    const ctx = makeContext();
    const settings = find(ctx, "app.settings");
    expect(settings.shortcut).toBe("CmdOrControl+,");
    settings.run();
    expect(ctx.openSettings).toHaveBeenCalled();
    expect(ALL_SHORTCUTS.some((item) => item.shortcut === "CmdOrControl+,")).toBe(true);
  });

  it("disables run commands while an automation is running", () => {
    expect(find(makeContext(), "automation.run.s1").disabledReason).toBeUndefined();
    expect(find(makeContext({ runningAutomationId: "other" }), "automation.run.s1").disabledReason).toBe("Another automation is running");
  });
});

describe("matchesShortcut", () => {
  const key = (init: Partial<KeyboardEvent>) => ({ key: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...init });

  it("accepts ctrl or meta for CmdOrControl", () => {
    expect(matchesShortcut(key({ key: "k", ctrlKey: true }), "CmdOrControl+K")).toBe(true);
    expect(matchesShortcut(key({ key: "K", metaKey: true }), "CmdOrControl+K")).toBe(true);
  });

  it("requires exact modifiers", () => {
    expect(matchesShortcut(key({ key: "k" }), "CmdOrControl+K")).toBe(false);
    expect(matchesShortcut(key({ key: "k", ctrlKey: true, shiftKey: true }), "CmdOrControl+K")).toBe(false);
    expect(matchesShortcut(key({ key: "1", ctrlKey: true, altKey: true }), "CmdOrControl+1")).toBe(false);
    expect(matchesShortcut(key({ key: "Escape" }), "Escape")).toBe(true);
    expect(matchesShortcut(key({ key: ",", ctrlKey: true }), "CmdOrControl+,")).toBe(true);
  });
});
