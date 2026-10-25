export const KEEP_AWAKE_KEY = "snipsy:keepAwake";

/** Whether to keep the computer awake while live. Defaults to on. */
export function readKeepAwake(): boolean {
  try {
    return localStorage.getItem(KEEP_AWAKE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeKeepAwake(value: boolean): void {
  try {
    localStorage.setItem(KEEP_AWAKE_KEY, String(value));
  } catch {
    // Storage unavailable; the choice lasts until reload.
  }
}