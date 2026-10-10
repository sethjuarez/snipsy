import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSaveTracking } from "./useSaveTracking";

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

  it("markSaved makes the current snapshot the new baseline", () => {
    const { result, rerender } = renderHook(({ value }) => useSaveTracking({ value }), { initialProps: { value: "a" } });
    rerender({ value: "b" });
    act(() => result.current.markSaved());
    expect(result.current.saveStatus).toBe("saved");
    expect(result.current.hasUnsavedChanges).toBe(false);

    rerender({ value: "a" });
    expect(result.current.saveStatus).toBe("unsaved");
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
