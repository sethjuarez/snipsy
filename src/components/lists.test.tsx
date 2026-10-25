import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Script, TextSnippet, VideoSnippet } from "../types";
import { collectHotkeyOwners } from "../utils/hotkeys";
import TextSnippetList from "./TextSnippetList";
import VideoSnippetList from "./VideoSnippetList";
import ScriptList from "./ScriptList";

afterEach(cleanup);

const text = (id: string, hotkey: string): TextSnippet => ({ id, title: `Text ${id}`, description: "", text: "x", hotkey, delivery: "paste" });
const clip = (id: string, hotkey: string, videoFile = "videos/a.mp4"): VideoSnippet => ({
  id, title: `Clip ${id}`, description: "", videoFile, startTime: 0, endTime: 1, hotkey, speed: 1,
});

describe("TextSnippetList", () => {
  it("flags conflicting and missing hotkeys", () => {
    const snippets = [text("a", "CmdOrControl+1"), text("b", "Ctrl+1"), text("c", ""), text("d", "CmdOrControl+2")];
    render(
      <TextSnippetList snippets={snippets} onEdit={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} hotkeyOwners={collectHotkeyOwners(snippets, [], [])} />,
    );
    expect(screen.getByTestId("snippet-status-a").textContent).toBe("Hotkey conflict: Already used by Text b.");
    expect(screen.getByTestId("snippet-status-b").textContent).toMatch(/^Hotkey conflict/);
    expect(screen.getByTestId("snippet-status-c").textContent).toMatch(/^No hotkey/);
    expect(screen.queryByTestId("snippet-status-d")).toBeNull();
  });

  it("duplicates from the row menu", () => {
    const onDuplicate = vi.fn();
    const snippet = text("a", "CmdOrControl+1");
    render(<TextSnippetList snippets={[snippet]} onEdit={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} onDuplicate={onDuplicate} />);
    fireEvent.click(screen.getByTestId("snippet-a-more"));
    fireEvent.click(screen.getByTestId("snippet-a-menu-duplicate"));
    expect(onDuplicate).toHaveBeenCalledWith(snippet);
  });

  it("offers an add action when empty", () => {
    const onAdd = vi.fn();
    render(<TextSnippetList snippets={[]} onEdit={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId("empty-add-snippet"));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});

describe("VideoSnippetList", () => {
  it("flags clips whose source video is missing and disables preview", () => {
    const onPlay = vi.fn();
    render(
      <VideoSnippetList
        snippets={[clip("a", "CmdOrControl+1"), clip("b", "CmdOrControl+2", "videos/gone.mp4")]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onPlay={onPlay}
        availableVideoFiles={new Set(["videos/a.mp4"])}
      />,
    );
    expect(screen.queryByTestId("video-missing-a")).toBeNull();
    expect(screen.getByTestId("video-missing-b")).toBeTruthy();
    expect((screen.getByTestId("video-preview-b") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("video-preview-a"));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("does not flag missing videos before the list is known", () => {
    render(<VideoSnippetList snippets={[clip("a", "CmdOrControl+1")]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByTestId("video-missing-a")).toBeNull();
  });
});

describe("ScriptList", () => {
  const script = (id: string, hotkey?: string, urls: string[] = []): Script => ({
    id, title: `Auto ${id}`, description: "", hotkey,
    contributionGroups: [{ id: "g", title: "G", contributions: urls.map((url, i) => ({ id: `c${i}`, kind: "openSite" as const, url })) }],
  });

  it("shows action counts, a failed last run, and no badge for an optional empty hotkey", () => {
    const automations = [script("a", undefined, ["https://a", "https://b"]), script("b")];
    render(
      <ScriptList
        automations={automations}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        hotkeyOwners={collectHotkeyOwners([], [], automations)}
        runHistory={[{ scriptId: "b", title: "Auto b", status: "error", message: "boom", completedAt: new Date().toISOString() }]}
      />,
    );
    expect(screen.getByTestId("automation-count-a").textContent).toBe("2 actions");
    expect(screen.getByTestId("automation-count-b").textContent).toBe("No actions");
    expect(screen.getByTestId("automation-failed-b")).toBeTruthy();
    expect(screen.queryByTestId("automation-status-a")).toBeNull();
  });

  it("runs from the row menu", () => {
    const onRun = vi.fn();
    render(<ScriptList automations={[script("a")]} onEdit={vi.fn()} onDelete={vi.fn()} onRun={onRun} />);
    fireEvent.contextMenu(screen.getByTestId("automation-a"));
    fireEvent.click(screen.getByTestId("automation-a-menu-run"));
    expect(onRun).toHaveBeenCalledWith("a");
  });
});

describe("list filters", () => {
  const filter = (value: string) => fireEvent.change(screen.getByTestId("list-filter"), { target: { value } });

  it("filters text snippets by title, body, or hotkey and disables reordering", () => {
    const snippets = [
      { ...text("a", "CmdOrControl+1"), title: "Greeting", text: "hello there" },
      { ...text("b", "CmdOrControl+Shift+7"), title: "Code" },
    ];
    render(<TextSnippetList snippets={snippets} onEdit={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} />);
    expect(screen.getByTestId("drag-handle-a")).toBeTruthy();

    filter("hello");
    expect(screen.getByTestId("snippet-a")).toBeTruthy();
    expect(screen.queryByTestId("snippet-b")).toBeNull();
    expect(screen.queryByTestId("drag-handle-a")).toBeNull();
    expect(screen.getByTestId("list-filter-count").textContent).toBe("1 of 2");

    filter("shift+7");
    expect(screen.getByTestId("snippet-b")).toBeTruthy();
    expect(screen.queryByTestId("snippet-a")).toBeNull();
  });

  it("clears with Escape and offers a clear action when nothing matches", () => {
    render(<VideoSnippetList snippets={[clip("a", "CmdOrControl+1"), clip("b", "CmdOrControl+2", "videos/keynote.mp4")]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    filter("keynote");
    expect(screen.queryByTestId("video-snippet-a")).toBeNull();
    expect(screen.getByTestId("video-snippet-b")).toBeTruthy();

    fireEvent.keyDown(screen.getByTestId("list-filter"), { key: "Escape" });
    expect(screen.getByTestId("video-snippet-a")).toBeTruthy();

    filter("zzzz");
    expect(screen.getByTestId("list-no-matches")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear filter"));
    expect(screen.queryByTestId("list-no-matches")).toBeNull();
    expect((screen.getByTestId("list-filter") as HTMLInputElement).value).toBe("");
  });

  it("matches automations by their site URLs", () => {
    const automations: Script[] = [
      { id: "a", title: "Docs", description: "", contributionGroups: [{ id: "g", title: "G", contributions: [{ id: "c", kind: "openSite", url: "https://learn.microsoft.com" }] }] },
      { id: "b", title: "Other", description: "" },
    ];
    render(<ScriptList automations={automations} onEdit={vi.fn()} onDelete={vi.fn()} />);
    filter("microsoft");
    expect(screen.getByTestId("automation-a")).toBeTruthy();
    expect(screen.queryByTestId("automation-b")).toBeNull();
  });
});