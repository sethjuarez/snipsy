import { useThemeStore } from "../stores/themeStore";

export type { Theme, ThemePreference } from "../stores/themeStore";

/** Shared app theme; every caller sees the same preference. */
export function useTheme() {
  const theme = useThemeStore((s) => s.theme);
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  return { theme, preference, setTheme: setPreference, setPreference, toggleTheme };
}
