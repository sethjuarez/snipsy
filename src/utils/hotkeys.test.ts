import { afterEach, describe, expect, it, vi } from "vitest";
import { collectHotkeyOwners, describeHotkeyIssues, displayHotkey, normalizeHotkey, validateHotkey, type HotkeyOwner } from "./hotkeys";

const owner = (id: string, hotkey: string, title = id): HotkeyOwner => ({ id, title, hotkey, kind: "text" });

function setPlatform(platform: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
}

afterEach(() => vi.restoreAllMocks());

describe("normalizeHotkey", () => {
  it.each([
    ["Ctrl+Shift+1", "CmdOrControl+Shift+Digit1"],
    ["Shift+Ctrl+A", "control+shift+KeyA"],
    ["Alt+num1", "Option+Numpad1"],
    ["Ctrl+=", "Ctrl+Equal"],
    ["Ctrl+Esc", "Ctrl+Escape"],
    ["Ctrl+NumpadPlus", "Ctrl+NumAdd"],
    ["Ctrl+Up", "Ctrl+ArrowUp"],
    ["Ctrl+\\", "Ctrl+Backslash"],
    [" ctrl + shift + f8 ", "CmdOrControl+Shift+F8"],
  ])("treats %s and %s as the same combo", (a, b) => {
    setPlatform("Win32");
    expect(normalizeHotkey(a)).toBe(normalizeHotkey(b));
  });

  it("keeps different combos distinct", () => {
    setPlatform("Win32");
    expect(normalizeHotkey("Ctrl+1")).not.toBe(normalizeHotkey("Ctrl+2"));
    expect(normalizeHotkey("Ctrl+1")).not.toBe(normalizeHotkey("Alt+1"));
    expect(normalizeHotkey("Ctrl+Shift+1")).not.toBe(normalizeHotkey("Ctrl+1"));
  });

  it("maps CmdOrControl to Cmd on macOS, not Ctrl", () => {
    setPlatform("MacIntel");
    expect(normalizeHotkey("CmdOrControl+1")).toBe(normalizeHotkey("Command+1"));
    expect(normalizeHotkey("CmdOrControl+1")).toBe(normalizeHotkey("Super+1"));
    expect(normalizeHotkey("CmdOrControl+1")).not.toBe(normalizeHotkey("Ctrl+1"));
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeHotkey("   ")).toBe("");
  });
});

describe("validateHotkey", () => {
  it("flags conflicts across alias spellings", () => {
    setPlatform("Win32");
    const status = validateHotkey("Ctrl+Shift+Digit1", [owner("a", "CmdOrControl+Shift+1", "Intro")]);
    expect(status.state).toBe("conflict");
    expect(status.message).toContain("Intro");
  });

  it("ignores the snippet being edited", () => {
    expect(validateHotkey("Ctrl+1", [owner("a", "Ctrl+1")], "a").state).toBe("available");
  });

  it("rejects empty and modifier-only hotkeys", () => {
    expect(validateHotkey("", []).state).toBe("empty");
    expect(validateHotkey("Ctrl+Shift", []).state).toBe("invalid");
    expect(validateHotkey("A", []).state).toBe("invalid");
  });
});

describe("collectHotkeyOwners", () => {
  it("orders text, video, then automations and skips automations without hotkeys", () => {
    const owners = collectHotkeyOwners(
      [{ id: "t", title: "T", hotkey: "Ctrl+1" }],
      [{ id: "v", title: "V", hotkey: "Ctrl+2" }],
      [{ id: "s", title: "S", hotkey: "Ctrl+3" }, { id: "none", title: "None" }],
    );
    expect(owners.map((o) => [o.id, o.kind])).toEqual([["t", "text"], ["v", "video"], ["s", "automation"]]);
  });
});

describe("describeHotkeyIssues", () => {
  it("names duplicates and failures with snippet titles", () => {
    setPlatform("Win32");
    const owners = [owner("a", "Ctrl+1", "Intro"), owner("b", "Ctrl+1", "Outro"), owner("c", "Ctrl+2", "Demo")];
    const text = describeHotkeyIssues(
      [
        { snippetId: "b", hotkey: "CmdOrControl+1", kind: "duplicate", detail: "a" },
        { snippetId: "c", hotkey: "Ctrl+2", kind: "failed", detail: "in use" },
        { snippetId: "gone", hotkey: "Ctrl+3", kind: "failed", detail: "x" },
      ],
      owners,
    );
    expect(text.split("\n")).toEqual([
      "Ctrl+1: Outro skipped (also used by Intro)",
      "Ctrl+2: Demo could not be registered (in use)",
      "Ctrl+3: Unknown snippet could not be registered (x)",
    ]);
  });
});

describe("displayHotkey", () => {
  it("shows the platform primary modifier", () => {
    setPlatform("Win32");
    expect(displayHotkey("CmdOrControl+Shift+1")).toBe("Ctrl+Shift+1");
    setPlatform("MacIntel");
    expect(displayHotkey("CmdOrControl+Alt+1")).toBe("Command+Option+1");
  });
});
