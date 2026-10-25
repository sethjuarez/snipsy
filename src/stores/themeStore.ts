import { create } from "zustand";

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

export const THEME_STORAGE_KEY = "snipsy-theme";

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

const resolve = (preference: ThemePreference): Theme => (preference === "system" ? systemTheme() : preference);

function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("dark", theme === "dark");
}

interface ThemeState {
  preference: ThemePreference;
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
  /** Re-reads the OS theme; called when it changes while following the system. */
  syncSystemTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const preference = storedPreference();
  const theme = resolve(preference);
  applyTheme(theme);
  return {
    preference,
    theme,
    setPreference: (next) => {
      try {
        if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
        else localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Storage unavailable; keep the in-memory choice.
      }
      const resolved = resolve(next);
      applyTheme(resolved);
      set({ preference: next, theme: resolved });
    },
    toggleTheme: () => get().setPreference(get().theme === "light" ? "dark" : "light"),
    syncSystemTheme: () => {
      if (get().preference !== "system") return;
      const resolved = systemTheme();
      applyTheme(resolved);
      set({ theme: resolved });
    },
  };
});

if (typeof window !== "undefined" && window.matchMedia) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => useThemeStore.getState().syncSystemTheme();
  query.addEventListener?.("change", onChange);
  import.meta.hot?.dispose(() => query.removeEventListener?.("change", onChange));
}
