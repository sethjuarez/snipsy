import { describe, expect, it } from "vitest";
import type { ToastMessage } from "../components/ToastViewport";
import { upsertToast } from "./toasts";

const toast = (id: string, sticky = false): ToastMessage => ({ id, title: id, tone: "info", sticky });
const ids = (toasts: ToastMessage[]) => toasts.map((item) => item.id);

describe("upsertToast", () => {
  it("keeps the newest four transient toasts", () => {
    const result = ["a", "b", "c", "d", "e"].reduce((acc, id) => upsertToast(acc, toast(id)), [] as ToastMessage[]);
    expect(ids(result)).toEqual(["b", "c", "d", "e"]);
  });

  it("never evicts sticky toasts", () => {
    let result = upsertToast([], toast("sticky", true));
    for (const id of ["a", "b", "c", "d", "e"]) result = upsertToast(result, toast(id));
    expect(ids(result)).toEqual(["sticky", "b", "c", "d", "e"]);
  });

  it("replaces a toast with the same id in place", () => {
    const first = upsertToast(upsertToast([], toast("warn", true)), toast("a"));
    const result = upsertToast(first, { ...toast("warn", true), title: "updated" });
    expect(ids(result)).toEqual(["warn", "a"]);
    expect(result[0].title).toBe("updated");
  });
});
