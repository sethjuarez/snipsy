import type { ToastMessage } from "../components/ToastViewport";

const MAX_TRANSIENT_TOASTS = 4;

/** Adds a toast, replacing one with the same id in place, and trims only transient toasts. */
export function upsertToast(current: ToastMessage[], toast: ToastMessage): ToastMessage[] {
  const exists = current.some((item) => item.id === toast.id);
  const next = exists ? current.map((item) => (item.id === toast.id ? toast : item)) : [...current, toast];
  let excess = next.filter((item) => !item.sticky).length - MAX_TRANSIENT_TOASTS;
  return next.filter((item) => item.sticky || excess-- <= 0);
}
