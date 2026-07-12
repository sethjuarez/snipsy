export function isMacPlatform() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function traySurfaceName() {
  return isMacPlatform() ? "menu bar" : "system tray";
}
