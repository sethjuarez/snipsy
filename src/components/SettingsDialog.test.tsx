import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_INTRO_SEEN_KEY } from "../utils/preflight";
import { filterSettingsSections } from "../utils/settings";

const updater = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => updater);

const systemDark = vi.hoisted(() => ({ value: false }));
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({ matches: systemDark.value, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
});

const { default: SettingsDialog } = await import("./SettingsDialog");
const { useThemeStore, THEME_STORAGE_KEY } = await import("../stores/themeStore");
const { useUpdateStore } = await import("../stores/updateStore");

function renderDialog(props: Partial<Parameters<typeof SettingsDialog>[0]> = {}) {
  const handlers = { onClose: vi.fn(), onRelaunchAsAdmin: vi.fn(), onShowShortcuts: vi.fn(), onNavigate: vi.fn() };
  render(<SettingsDialog elevated {...handlers} {...props} />);
  return handlers;
}

beforeEach(() => {
  localStorage.clear();
  systemDark.value = false;
  useThemeStore.getState().setPreference("system");
  useUpdateStore.setState({ update: null, checking: false, checkedAt: null, checkError: null, installing: false, installError: null, progress: "" });
  updater.check.mockReset();
});
afterEach(cleanup);

describe("filterSettingsSections", () => {
  it("finds sections by keyword", () => {
    expect(filterSettingsSections("dark").map((section) => section.id)).toEqual(["appearance"]);
    expect(filterSettingsSections("admin").map((section) => section.id)).toContain("permissions");
    expect(filterSettingsSections("zzz")).toEqual([]);
  });
});

describe("themeStore", () => {
  it("persists explicit themes and clears storage for system", () => {
    useThemeStore.getState().setPreference("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    systemDark.value = false;
    useThemeStore.getState().setPreference("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(useThemeStore.getState().theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("follows OS changes only while on system", () => {
    systemDark.value = true;
    useThemeStore.getState().syncSystemTheme();
    expect(useThemeStore.getState().theme).toBe("dark");

    useThemeStore.getState().setPreference("light");
    useThemeStore.getState().syncSystemTheme();
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("toggles away from the resolved theme", () => {
    systemDark.value = true;
    useThemeStore.getState().setPreference("system");
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().preference).toBe("light");
  });
});

describe("SettingsDialog", () => {
  it("opens at the requested section", () => {
    renderDialog({ initialSection: "updates" });
    expect(screen.getByTestId("settings-section-updates")).toBeTruthy();
    expect(screen.queryByTestId("settings-section-appearance")).toBeNull();
    expect(screen.getByTestId("settings-nav-updates").getAttribute("aria-current")).toBe("page");
  });

  it("switches sections from the nav", () => {
    renderDialog();
    fireEvent.click(screen.getByTestId("settings-nav-demo"));
    expect(screen.getByTestId("settings-section-demo")).toBeTruthy();
    expect(screen.queryByTestId("settings-section-appearance")).toBeNull();
  });

  it("sets the theme preference", () => {
    renderDialog();
    expect(screen.getByTestId("settings-theme-system").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByTestId("settings-theme-dark"));
    expect(useThemeStore.getState().preference).toBe("dark");
    expect(screen.getByTestId("settings-theme-dark").getAttribute("aria-checked")).toBe("true");
  });

  it("moves through themes with arrow keys and keeps one tab stop", () => {
    renderDialog();
    const system = screen.getByTestId("settings-theme-system");
    expect(system.tabIndex).toBe(0);
    expect(screen.getByTestId("settings-theme-dark").tabIndex).toBe(-1);
    fireEvent.keyDown(system, { key: "ArrowRight" });
    expect(useThemeStore.getState().preference).toBe("light");
    expect(document.activeElement).toBe(screen.getByTestId("settings-theme-light"));
    fireEvent.keyDown(screen.getByTestId("settings-theme-light"), { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByTestId("settings-theme-system"), { key: "ArrowLeft" });
    expect(useThemeStore.getState().preference).toBe("dark");
  });

  it("shows every matching section while searching", () => {
    renderDialog();
    fireEvent.change(screen.getByTestId("settings-search"), { target: { value: "hotkeys" } });
    expect(screen.getByTestId("settings-section-shortcuts")).toBeTruthy();
    expect(screen.queryByTestId("settings-section-appearance")).toBeNull();

    fireEvent.change(screen.getByTestId("settings-search"), { target: { value: "zzz" } });
    expect(screen.getByTestId("settings-no-results")).toBeTruthy();

    fireEvent.click(screen.getByTestId("settings-nav-updates"));
    expect((screen.getByTestId("settings-search") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("settings-section-updates")).toBeTruthy();
  });

  it("toggles the demo checklist", () => {
    renderDialog({ initialSection: "demo" });
    const box = screen.getByTestId("settings-demo-checklist") as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(localStorage.getItem(DEMO_INTRO_SEEN_KEY)).toBe("true");
    fireEvent.click(box);
    expect(localStorage.getItem(DEMO_INTRO_SEEN_KEY)).toBeNull();
  });

  it("offers a restart when not elevated", () => {
    const { onRelaunchAsAdmin } = renderDialog({ initialSection: "permissions", elevated: false });
    fireEvent.click(screen.getByTestId("settings-relaunch-admin"));
    expect(onRelaunchAsAdmin).toHaveBeenCalled();
  });

  it("shows ready when elevated", () => {
    renderDialog({ initialSection: "permissions" });
    expect(screen.getByTestId("settings-elevation-ok")).toBeTruthy();
    expect(screen.queryByTestId("settings-relaunch-admin")).toBeNull();
  });

  it("checks for updates and reports the result", async () => {
    updater.check.mockResolvedValue(null);
    renderDialog({ initialSection: "updates" });
    expect(screen.getByTestId("settings-version").textContent).toBe("vdev");
    expect(screen.getByTestId("settings-update-status").textContent).toBe("Not checked yet.");
    fireEvent.click(screen.getByTestId("settings-update-check"));
    await waitFor(() => expect(screen.getByTestId("settings-update-status").textContent).toBe("You're up to date."));
  });

  it("reports failed update checks", async () => {
    updater.check.mockRejectedValue(new Error("offline"));
    renderDialog({ initialSection: "updates" });
    fireEvent.click(screen.getByTestId("settings-update-check"));
    await waitFor(() => expect(screen.getByTestId("settings-update-status").textContent).toContain("Couldn't check"));
  });

  it("offers install when an update is available", () => {
    const downloadAndInstall = vi.fn(() => new Promise<void>(() => {}));
    act(() => {
      useUpdateStore.setState({ update: { version: "9.9.9", available: true, downloadAndInstall } as never, checkedAt: Date.now() });
    });
    renderDialog({ initialSection: "updates" });
    expect(screen.getByTestId("settings-update-status").textContent).toBe("Version 9.9.9 is available.");
    fireEvent.click(screen.getByTestId("settings-update-install"));
    expect(downloadAndInstall).toHaveBeenCalled();
    expect(useUpdateStore.getState().installing).toBe(true);
  });

  it("keeps install failures visible until retry", async () => {
    const downloadAndInstall = vi.fn().mockRejectedValue(new Error("disk full"));
    act(() => {
      useUpdateStore.setState({ update: { version: "9.9.9", available: true, downloadAndInstall } as never });
    });
    renderDialog({ initialSection: "updates" });
    fireEvent.click(screen.getByTestId("settings-update-install"));
    await waitFor(() => expect(screen.getByTestId("settings-update-status").textContent).toContain("failed to install"));
    expect(useUpdateStore.getState().installing).toBe(false);
    expect((screen.getByTestId("settings-update-install") as HTMLButtonElement).disabled).toBe(false);
  });

  it("links to shortcuts, hotkeys, and the Stream Deck preview", () => {
    const { onShowShortcuts, onNavigate } = renderDialog({ initialSection: "shortcuts" });
    fireEvent.click(screen.getByTestId("settings-show-shortcuts"));
    expect(onShowShortcuts).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("settings-open-hotkeys"));
    expect(onNavigate).toHaveBeenCalledWith("hotkeys");
    fireEvent.click(screen.getByTestId("settings-nav-stream-deck"));
    fireEvent.click(screen.getByTestId("settings-open-stream-deck"));
    expect(onNavigate).toHaveBeenCalledWith("stream-deck");
  });

  it("hides project links without a project", () => {
    renderDialog({ initialSection: "shortcuts", onNavigate: undefined });
    expect(screen.queryByTestId("settings-open-hotkeys")).toBeNull();
  });
});
