import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { saveBlockerText, useSaveTracking } from "./useSaveTracking";

describe("useSaveTracking", () => {
  it("is idle until the snapshot changes, and clears when reverted", () => {
    const { result, rerender } = renderHook(({ value }) => useSaveTracking({ value }), { initialProps: { value: "a" } });
    expect(result.current.saveStatus).toBe("idle");
    expect(result.current.hasUnsavedChanges).toBe(false);

    rerender({ value: "b" });
    expect(result.current.saveStatus).toBe("unsaved");

    rerender({ value: "a" });
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it("shows saving until the save resolves, then makes the snapshot the new baseline", async () => {
    const { result, rerender } = renderHook(({ value }) => useSaveTracking({ value }), { initialProps: { value: "a" } });
    rerender({ value: "b" });

    let finish!: () => void;
    let saved: Promise<boolean>;
    act(() => {
      saved = result.current.runSave(() => new Promise<void>((resolve) => { finish = resolve; }));
    });
    expect(result.current.saveStatus).toBe("saving");

    await act(async () => {
      finish();
      expect(await saved).toBe(true);
    });
    expect(result.current.saveStatus).toBe("saved");
    expect(result.current.hasUnsavedChanges).toBe(false);

    rerender({ value: "a" });
    expect(result.current.saveStatus).toBe("unsaved");
  });

  it("keeps changes unsaved and reports an error when the save fails", async () => {
    const { result, rerender } = renderHook(({ value }) => useSaveTracking({ value }), { initialProps: { value: "a" } });
    rerender({ value: "b" });

    await act(async () => {
      expect(await result.current.runSave(() => Promise.reject(new Error("disk full")))).toBe(false);
    });
    expect(result.current.saveStatus).toBe("error");
    expect(result.current.hasUnsavedChanges).toBe(true);

    await act(async () => {
      await result.current.runSave(() => Promise.resolve());
    });
    expect(result.current.saveStatus).toBe("saved");
  });

  it("keeps edits made during a save unsaved", async () => {
    const { result, rerender } = renderHook(({ value }) => useSaveTracking({ value }), { initialProps: { value: "a" } });
    rerender({ value: "b" });

    let finish!: () => void;
    let saved: Promise<boolean>;
    act(() => {
      saved = result.current.runSave(() => new Promise<void>((resolve) => { finish = resolve; }));
    });
    rerender({ value: "c" });
    await act(async () => {
      finish();
      await saved;
    });
    expect(result.current.saveStatus).toBe("unsaved");
  });

  it("ignores a second save while one is in flight", async () => {
    const { result } = renderHook(() => useSaveTracking({ value: "a" }));
    let finish!: () => void;
    let first: Promise<boolean>;
    act(() => {
      first = result.current.runSave(() => new Promise<void>((resolve) => { finish = resolve; }));
    });
    let second = true;
    await act(async () => {
      second = await result.current.runSave(() => Promise.resolve());
    });
    expect(second).toBe(false);
    await act(async () => {
      finish();
      await first;
    });
  });

  it("waits for ready before capturing the baseline", () => {
    const { result, rerender } = renderHook(({ value, ready }) => useSaveTracking({ value }, ready), {
      initialProps: { value: "loading", ready: false },
    });
    expect(result.current.hasUnsavedChanges).toBe(false);

    rerender({ value: "loaded", ready: true });
    expect(result.current.hasUnsavedChanges).toBe(false);

    rerender({ value: "edited", ready: true });
    expect(result.current.hasUnsavedChanges).toBe(true);
  });
});

describe("saveBlockerText", () => {
  const state = (canSave: boolean) => ({
    canSave,
    readinessText: canSave ? "Ready" : "Needs Title",
    saveStatus: "unsaved" as const,
    hasUnsavedChanges: true,
  });

  it("only explains why Save is disabled", () => {
    expect(saveBlockerText(state(false))).toBe("Needs Title");
    expect(saveBlockerText(state(true))).toBeUndefined();
  });
});