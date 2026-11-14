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
      // jsdom has no layout; stack steps, action rows, and empty-step drop zones so dnd-kit can measure droppables.
      let restoreRects: () => void;
      beforeEach(() => {
        const original = Element.prototype.getBoundingClientRect;
        const layout = () => {
          const rects = new Map<Element, { top: number; height: number }>();
          let y = 0;
          for (const group of Array.from(document.querySelectorAll("[data-group-id]"))) {
            const groupTop = y;
            y += 40;
            for (const item of Array.from(group.querySelectorAll("[data-contribution-id], [data-testid^='contribution-group-drop-']"))) {
              rects.set(item, { top: y, height: 30 });
              y += 40;
            }
            rects.set(group, { top: groupTop, height: y - groupTop });
            y += 10;
          }
          return rects;
        };
        Element.prototype.getBoundingClientRect = function (this: Element) {
          const rect = layout().get(this);
          const top = rect?.top ?? 0;
          const height = rect?.height ?? 0;
          return { x: 0, y: top, top, left: 0, width: 300, height, right: 300, bottom: top + height, toJSON: () => ({}) } as DOMRect;
        };
        restoreRects = () => { Element.prototype.getBoundingClientRect = original; };
      });
      afterEach(() => restoreRects());

      const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      // Rows remount when they change step, so later keys go wherever focus is, as in a real browser.
      const keyTarget = () => (document.activeElement && document.activeElement.isConnected ? document.activeElement : document.body) as HTMLElement;
      const keyboardDrag = async (handle: HTMLElement, steps: string[], finish = "Space") => {
        handle.focus();
        fireEvent.keyDown(handle, { code: "Space", key: " " });
        await settle();
        for (const code of steps) {
          fireEvent.keyDown(keyTarget(), { code, key: code });
          await settle();
        }
        fireEvent.keyDown(keyTarget(), { code: finish, key: finish === "Space" ? " " : finish });
        await settle();
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

      it("reorders whole steps from the keyboard without touching their actions", async () => {
        const onSave = vi.fn();
        render(<ScriptForm script={ordered} onSave={onSave} />);
        const handle = screen.getByTestId("drag-group-1");
        expect(handle.getAttribute("type")).toBe("button");
        expect(handle.getAttribute("aria-label")).toBe("Drag to reorder Second");
        await keyboardDrag(handle, ["ArrowUp"]);
        expect(onSave).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("Dropped step 2, Second at step position 1.");

        const groups = await savedGroups(onSave);
        expect(groups).toEqual([ordered.contributionGroups![1], ordered.contributionGroups![0]]);
        expect(groups[0]).toBe(ordered.contributionGroups![1]);
        expect(groups[1]).toBe(ordered.contributionGroups![0]);
      });

      it("moves a tall step below a short one from the keyboard", async () => {
        const onSave = vi.fn();
        const many = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, kind: "openSite", title: `T${i}`, url: `https://t${i}.test` }) as OpenSiteContribution);
        const tall: Script = {
          ...automation,
          contributionGroups: [
            { id: "tall", title: "Tall", contributions: many },
            { id: "short", title: "Short", contributions: [other] },
          ],
        };
        render(<ScriptForm script={tall} onSave={onSave} />);
        await keyboardDrag(screen.getByTestId("drag-group-0"), ["ArrowDown"]);

        const groups = await savedGroups(onSave);
        expect(groups.map((group) => group.id)).toEqual(["short", "tall"]);
        expect(groups[1]).toBe(tall.contributionGroups![0]);
      });

      it("drags an action into another step and keeps the whole object", async () => {
        const onSave = vi.fn();
        render(<ScriptForm script={ordered} onSave={onSave} />);
        await keyboardDrag(screen.getByTestId("drag-contribution-1-0"), ["ArrowUp"]);
        expect(screen.getByTestId("contribution-number-0-2").textContent).toBe("1.3");

        const groups = await savedGroups(onSave);
        expect(groups[0].contributions.map((c) => c.id)).toEqual(["a", "b", "z", "c"]);
        expect(groups[0].contributions[2]).toBe(other);
        expect(groups[0].contributions[0]).toBe(siteA);
        expect(groups[1]).toEqual({ id: "g2", title: "Second", contributions: [] });
      });

      it("drops an action into an empty step", async () => {
        const onSave = vi.fn();
        const withEmpty: Script = {
          ...ordered,
          contributionGroups: [
            ordered.contributionGroups![0],
            { id: "g3", title: "Empty", contributions: [] },
          ],
        };
        render(<ScriptForm script={withEmpty} onSave={onSave} />);
        expect(screen.getByTestId("contribution-group-drop-1")).toBeTruthy();
        await keyboardDrag(screen.getByTestId("drag-contribution-0-0"), ["ArrowDown", "ArrowDown", "ArrowDown"]);
        expect(screen.queryByTestId("contribution-group-drop-1")).toBeNull();

        const groups = await savedGroups(onSave);
        expect(groups[0].contributions).toEqual([siteB, siteC]);
        expect(groups[1].contributions).toEqual([siteA]);
        expect(groups[1].contributions[0]).toBe(siteA);
      });

      it("restores the original order when a cross-step drag is cancelled", async () => {
        const onSaveStateChange = vi.fn();
        render(<ScriptForm script={ordered} onSave={vi.fn()} onSaveStateChange={onSaveStateChange} />);
        await keyboardDrag(screen.getByTestId("drag-contribution-1-0"), ["ArrowUp"], "Escape");
        expect(screen.getByTestId("contribution-1-0").getAttribute("data-contribution-id")).toBe("z");
        expect(screen.getByTestId("contribution-0-2").getAttribute("data-contribution-id")).toBe("c");
        expect(onSaveStateChange.mock.lastCall![0].hasUnsavedChanges).toBe(false);
      });
    });

    it("moves whole steps with buttons, keeps focus, and never submits", async () => {
      const onSave = vi.fn();
      render(<ScriptForm script={ordered} onSave={onSave} />);
      expect((screen.getByTestId("move-group-up-0") as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByTestId("move-group-down-1") as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId("move-group-down-0").getAttribute("type")).toBe("button");

      fireEvent.click(screen.getByTestId("move-group-down-0"));
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByTestId("contribution-group-title-0")).toHaveProperty("value", "Second");
      expect(document.activeElement).toBe(screen.getByTestId("move-group-up-1"));
      expect(screen.getByTestId("contribution-number-0-0").textContent).toBe("1.1");
      expect(screen.getByTestId("contribution-number-1-0").textContent).toBe("2.1");

      const groups = await savedGroups(onSave);
      expect(groups[0]).toBe(ordered.contributionGroups![1]);
      expect(groups[1]).toBe(ordered.contributionGroups![0]);
    });
  });
});
