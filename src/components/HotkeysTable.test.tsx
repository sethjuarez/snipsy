import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HotkeysTable from "./HotkeysTable";
import type { Script, TextSnippet, VideoSnippet } from "../types";

const text = (id: string, hotkey: string): TextSnippet => ({ id, title: `Text ${id}`, description: "", text: "hi", hotkey, delivery: "paste" });
const clip = (id: string, hotkey: string): VideoSnippet => ({
  id, title: `Clip ${id}`, description: "", videoFile: "videos/a.mp4", startTime: 0, endTime: 1, hotkey, speed: 1,
});
const automation = (id: string, hotkey?: string): Script => ({ id, title: `Auto ${id}`, description: "", hotkey });

function setup(overrides: Partial<Parameters<typeof HotkeysTable>[0]> = {}) {
  const onChangeHotkey = vi.fn().mockResolvedValue(undefined);
  const onOpen = vi.fn();
  render(
    <HotkeysTable
      textSnippets={[text("a", "CmdOrControl+Shift+1"), text("b", "Ctrl+Shift+1"), text("c", "")]}
      videoSnippets={[clip("v", "CmdOrControl+Shift+2"), clip("bad", "A")]}
      automations={[automation("x", "CmdOrControl+Shift+3"), automation("y")]}
      demoMode={false}
      onChangeHotkey={onChangeHotkey}
      onOpen={onOpen}
      {...overrides}
    />,
  );
  return { onChangeHotkey, onOpen };
}

const status = (id: string) => screen.getByTestId(`hotkey-status-${id}`).textContent?.split(":")[0];

afterEach(cleanup);

describe("HotkeysTable", () => {
  it("shows every owner with its demo status", () => {
    setup();
    expect(status("a")).toBe("Ready");
    expect(status("b")).toBe("Duplicate");
    expect(screen.getByTestId("hotkey-status-b").getAttribute("title")).toContain("Text a");
    expect(status("c")).toBe("No hotkey");
    expect(status("v")).toBe("Ready");
    expect(status("bad")).toBe("Invalid");
    expect(status("x")).toBe("Ready");
    expect(status("y")).toBe("Optional");
    expect(screen.getByTestId("hotkeys-armed-count").textContent).toBe("3 ready");
    expect(screen.getByTestId("hotkeys-problem-count").textContent).toBe("3 problems");
  });

  it("filters to problems only", () => {
    setup();
    fireEvent.click(screen.getByTestId("hotkeys-problems-only"));
    expect(screen.getByTestId("hotkeys-problems-only").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("hotkey-row-a")).toBeNull();
    expect(screen.queryByTestId("hotkey-row-y")).toBeNull();
    expect(screen.getByTestId("hotkey-row-b")).toBeTruthy();
    expect(screen.getByTestId("hotkey-row-c")).toBeTruthy();
    expect(screen.getByTestId("hotkey-row-bad")).toBeTruthy();
  });

  it("marks hotkeys the OS refused during a live demo", () => {
    setup({ demoMode: true, issues: [{ snippetId: "v", hotkey: "CmdOrControl+Shift+2", kind: "failed", detail: "in use" }] });
    expect(status("a")).toBe("Armed");
    expect(status("v")).toBe("Not registered");
    expect(screen.getByTestId("hotkeys-armed-count").textContent).toBe("2 armed");
  });

  it("ignores stale issues outside demo mode", () => {
    setup({ issues: [{ snippetId: "v", hotkey: "CmdOrControl+Shift+2", kind: "failed", detail: "in use" }] });
    expect(status("v")).toBe("Ready");
  });

  it("captures and saves a new hotkey", async () => {
    const { onChangeHotkey } = setup();
    fireEvent.click(screen.getByTestId("hotkey-change-c"));
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("hotkey-capture-c"), { key: "4", code: "Digit4", ctrlKey: true, shiftKey: true });
    });
    expect(onChangeHotkey).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }), expect.stringContaining("4"));
    expect(screen.queryByTestId("hotkey-capture-c")).toBeNull();
  });

  it("rejects a combo another item already uses", () => {
    const { onChangeHotkey } = setup();
    fireEvent.click(screen.getByTestId("hotkey-change-c"));
    fireEvent.keyDown(screen.getByTestId("hotkey-capture-c"), { key: "2", code: "Digit2", ctrlKey: true, shiftKey: true });
    expect(onChangeHotkey).not.toHaveBeenCalled();
    expect(screen.getByTestId("hotkey-error-c").textContent).toContain("Clip v");
  });

  it("cancels capture on Escape", () => {
    setup();
    fireEvent.click(screen.getByTestId("hotkey-change-c"));
    fireEvent.keyDown(screen.getByTestId("hotkey-capture-c"), { key: "Escape" });
    expect(screen.queryByTestId("hotkey-capture-c")).toBeNull();
  });

  it("shows a save error and keeps capture open", async () => {
    const { onChangeHotkey } = setup();
    onChangeHotkey.mockRejectedValueOnce("disk full");
    fireEvent.click(screen.getByTestId("hotkey-change-c"));
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("hotkey-capture-c"), { key: "4", code: "Digit4", ctrlKey: true, shiftKey: true });
    });
    expect(screen.getByTestId("hotkey-error-c").textContent).toContain("disk full");
  });

  it("removes an automation hotkey and opens owners", async () => {
    const { onChangeHotkey, onOpen } = setup();
    expect(screen.queryByTestId("hotkey-clear-y")).toBeNull();
    expect(screen.queryByTestId("hotkey-clear-a")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("hotkey-clear-x"));
    });
    expect(onChangeHotkey).toHaveBeenCalledWith(expect.objectContaining({ id: "x", kind: "automation" }), "");
    fireEvent.click(screen.getByTestId("hotkey-goto-v"));
    fireEvent.click(screen.getByTestId("hotkey-open-a"));
    expect(onOpen.mock.calls.map(([owner]) => owner.id)).toEqual(["v", "a"]);
  });

  it("shows an error when removing fails", async () => {
    const { onChangeHotkey } = setup();
    onChangeHotkey.mockRejectedValueOnce("locked");
    await act(async () => {
      fireEvent.click(screen.getByTestId("hotkey-clear-x"));
    });
    expect(screen.getByTestId("hotkey-error-x").textContent).toContain("locked");
  });

  it("warns when live demo hotkeys could not be refreshed", () => {
    setup({ demoMode: true, syncError: "boom" });
    expect(screen.getByTestId("hotkeys-sync-error").textContent).toContain("boom");
    cleanup();
    setup({ syncError: "boom" });
    expect(screen.queryByTestId("hotkeys-sync-error")).toBeNull();
  });

  it("shows an empty state with no items", () => {
    setup({ textSnippets: [], videoSnippets: [], automations: [] });
    expect(screen.getByTestId("hotkeys-empty-state")).toBeTruthy();
  });
});
