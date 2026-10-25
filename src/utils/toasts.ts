import type { ToastMessage, ToastTone } from "../components/ToastViewport";

/** How long a transient toast stays up: quick confirmations fade fast, problems linger. */
export function toastDuration(tone: ToastTone, detail?: string): number {
  if (tone === "error") return 8000;
  if (tone === "warning") return 6000;
  if (tone === "success" && !detail) return 2500;
  return 4000;
}

const MAX_TRANSIENT_TOASTS = 4;

/** Adds a toast, replacing one with the same id in place, and trims only transient toasts. */
export function upsertToast(current: ToastMessage[], toast: ToastMessage): ToastMessage[] {
  const exists = current.some((item) => item.id === toast.id);
  const next = exists ? current.map((item) => (item.id === toast.id ? toast : item)) : [...current, toast];
  let excess = next.filter((item) => !item.sticky).length - MAX_TRANSIENT_TOASTS;
  return next.filter((item) => item.sticky || excess-- <= 0);
}
