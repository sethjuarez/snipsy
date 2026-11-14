import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenSiteContribution, Script } from "../types";
import ScriptForm from "./ScriptForm";

afterEach(cleanup);

const automation: Script = {
  id: "automation-1",
  title: "Prep",
  description: "Opens sites",
  hotkey: "CmdOrControl+Shift+7",
  contributionGroups: [
    {
      id: "group-1",
      title: "Setup",
      contributions: [{ id: "site-1", kind: "openSite", title: "Docs", url: "https://snipsy.dev" }],
    },
  ],
  streamDeckIcon: { kind: "emoji", value: "🎯", background: "#101010", foreground: "#fafafa" },
};

describe("ScriptForm", () => {
  it("saves every field it was given unchanged", async () => {
    const onSave = vi.fn();
    render(<ScriptForm script={automation} onSave={onSave} />);
    fireEvent.submit(screen.getByTestId("automation-form"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(automation);
  });

  it("edits and saves the Stream Deck icon", async () => {
    const onSave = vi.fn();
    render(<ScriptForm script={{ ...automation, streamDeckIcon: undefined }} onSave={onSave} />);
    expect(screen.getByTestId("automation-streamdeck-icon-preview")).toBeTruthy();
    fireEvent.change(screen.getByTestId("automation-streamdeck-icon-kind"), { target: { value: "emoji" } });
    fireEvent.submit(screen.getByTestId("automation-form"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].streamDeckIcon).toEqual(expect.objectContaining({ kind: "emoji", value: "🚀" }));
  });

  it("defaults new automations to the rocket preset", async () => {
    const onSave = vi.fn();
    render(<ScriptForm onSave={onSave} />);
    fireEvent.change(screen.getByTestId("automation-title"), { target: { value: "New" } });
    fireEvent.submit(screen.getByTestId("automation-form"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].streamDeckIcon).toEqual(expect.objectContaining({ kind: "preset", value: "rocket" }));
  });

  describe("reordering actions", () => {
    // idempotencyKey stands in for metadata the editor doesn't render; it must survive reorders untouched.
    const siteA = { id: "a", kind: "openSite", title: "A", url: "https://a.test", idempotencyKey: "key-a" } as OpenSiteContribution;
    const siteB = { id: "b", kind: "openSite", title: "B", url: "https://b.test" } as OpenSiteContribution;
    const siteC = { id: "c", kind: "openSite", title: "C", url: "https://c.test" } as OpenSiteContribution;
    const other = { id: "z", kind: "openSite", title: "Z", url: "https://z.test" } as OpenSiteContribution;
    const ordered: Script = {
      ...automation,
      contributionGroups: [
        { id: "g1", title: "First", contributions: [siteA, siteB, siteC] },
        { id: "g2", title: "Second", contributions: [other] },
      ],
    };

    const savedGroups = async (onSave: ReturnType<typeof vi.fn>) => {
      fireEvent.submit(screen.getByTestId("automation-form"));
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      return (onSave.mock.calls[0][0] as Script).contributionGroups!;
    };

    it("moves actions within a step and saves whole objects in the new order", async () => {
      const onSave = vi.fn();
      render(<ScriptForm script={ordered} onSave={onSave} />);
      fireEvent.click(screen.getByTestId("move-contribution-down-0-0"));
      fireEvent.click(screen.getByTestId("move-contribution-up-0-2"));
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByTestId("contribution-number-0-0").textContent).toBe("1.1");

      const groups = await savedGroups(onSave);
      expect(groups[0].contributions).toEqual([siteB, siteC, siteA]);
      expect(groups[0].contributions[2]).toBe(siteA);
      expect(groups[1]).toBe(ordered.contributionGroups![1]);
    });

    it("disables moves past the edges and keeps focus on the moved action", () => {
      render(<ScriptForm script={ordered} onSave={vi.fn()} />);
      expect((screen.getByTestId("move-contribution-up-0-0") as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByTestId("move-contribution-down-0-2") as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByTestId("move-contribution-down-0-1") as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(screen.getByTestId("move-contribution-down-0-0"));
      expect(document.activeElement).toBe(screen.getByTestId("move-contribution-down-0-1"));
      fireEvent.click(screen.getByTestId("move-contribution-down-0-1"));
      // Down is now disabled, so focus moves to the same row's up button.
      expect(document.activeElement).toBe(screen.getByTestId("move-contribution-up-0-2"));
    });

    it("inserts below any action, including the last, and focuses the new URL", async () => {
      const onSave = vi.fn();
      render(<ScriptForm script={ordered} onSave={onSave} />);
      fireEvent.click(screen.getByTestId("insert-contribution-below-0-0"));
      expect(document.activeElement).toBe(screen.getByTestId("contribution-url-0-1"));
      fireEvent.click(screen.getByTestId("insert-contribution-below-0-3"));
      expect(document.activeElement).toBe(screen.getByTestId("contribution-url-0-4"));
      expect(onSave).not.toHaveBeenCalled();

      const groups = await savedGroups(onSave);
      const ids = groups[0].contributions.map((c) => c.id);
      expect(ids).toHaveLength(5);
      expect([ids[0], ids[2], ids[3]]).toEqual(["a", "b", "c"]);
      expect(groups[0].contributions[1]).toEqual(expect.objectContaining({ kind: "openSite", url: "https://" }));
      expect(new Set(ids).size).toBe(5);
      expect(groups[1]).toBe(ordered.contributionGroups![1]);
    });

    it("tracks reorders as unsaved changes and clears them when reverted", () => {
      const onSaveStateChange = vi.fn();
      render(<ScriptForm script={ordered} onSave={vi.fn()} onSaveStateChange={onSaveStateChange} />);
      const lastState = () => onSaveStateChange.mock.lastCall![0];
      expect(lastState().hasUnsavedChanges).toBe(false);
      fireEvent.click(screen.getByTestId("move-contribution-down-0-0"));
      expect(lastState().hasUnsavedChanges).toBe(true);
      fireEvent.click(screen.getByTestId("move-contribution-up-0-1"));
      expect(lastState().hasUnsavedChanges).toBe(false);
    });

    describe("drag handle", () => {
      // jsdom has no layout; give each action row a stacked rect so dnd-kit can measure droppables.
      let restoreRects: () => void;
      beforeEach(() => {
        const original = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function (this: Element) {
          const rows = Array.from(document.querySelectorAll("[data-contribution-id]"));
          const row = this.closest("[data-contribution-id]");
          const index = row ? rows.indexOf(row) : -1;
          const top = index * 40;
          return { x: 0, y: top, top, left: 0, width: 300, height: index < 0 ? 0 : 30, right: 300, bottom: top + 30, toJSON: () => ({}) } as DOMRect;
        };
        restoreRects = () => { Element.prototype.getBoundingClientRect = original; };
      });
      afterEach(() => restoreRects());

      const keyboardDrag = async (handle: HTMLElement, steps: string[]) => {
        handle.focus();
        fireEvent.keyDown(handle, { code: "Space", key: " " });
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
        for (const code of steps) {
          fireEvent.keyDown(handle, { code, key: code });
          await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
        }
        fireEvent.keyDown(handle, { code: "Space", key: " " });
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      };

      it("reorders within a step from the keyboard and keeps other steps untouched", async () => {
        const onSave = vi.fn();
        render(<ScriptForm script={ordered} onSave={onSave} />);
        await keyboardDrag(screen.getByTestId("drag-contribution-0-0"), ["ArrowDown", "ArrowDown"]);
        expect(onSave).not.toHaveBeenCalled();

        const groups = await savedGroups(onSave);
        expect(groups[0].contributions).toEqual([siteB, siteC, siteA]);
        expect(groups[0].contributions[2]).toBe(siteA);
        expect(groups[1]).toBe(ordered.contributionGroups![1]);
      });

      it("is a labeled non-submitting button and leaves inputs out of the drag activator", () => {
        const onSave = vi.fn();
        render(<ScriptForm script={ordered} onSave={onSave} />);
        const handle = screen.getByTestId("drag-contribution-0-1");
        expect(handle.getAttribute("type")).toBe("button");
        expect(handle.getAttribute("aria-label")).toBe("Drag to reorder B");
        expect(handle.contains(screen.getByTestId("contribution-title-0-1"))).toBe(false);
        expect(screen.getByTestId("contribution-title-0-1").getAttribute("aria-roledescription")).toBeNull();

        fireEvent.click(handle);
        fireEvent.keyDown(screen.getByTestId("contribution-title-0-1"), { code: "Space", key: " " });
        fireEvent.change(screen.getByTestId("contribution-title-0-1"), { target: { value: "B edited" } });
        expect(onSave).not.toHaveBeenCalled();
        expect((screen.getByTestId("contribution-title-0-1") as HTMLInputElement).value).toBe("B edited");
        expect(screen.getByTestId("contribution-0-0").getAttribute("data-contribution-id")).toBe("a");
      });
    });
  });
});
