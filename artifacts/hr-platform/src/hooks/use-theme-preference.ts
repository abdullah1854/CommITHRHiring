import { useCallback, useEffect, useState } from "react";

import {
  getNextThemePreference,
  getStoredThemePreference,
  resolveThemePreference,
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme-preference";

export type { ResolvedTheme, ThemePreference } from "@/lib/theme-preference";

function getInitialPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  return getStoredThemePreference(window.localStorage);
}

function getSystemPrefersDark() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(THEME_MEDIA_QUERY).matches ?? false;
}

function applyTheme(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function useThemePreference() {
  const [theme, setThemeState] = useState<ThemePreference>(getInitialPreference);
  const [prefersDark, setPrefersDark] = useState(getSystemPrefersDark);
  const resolvedTheme = resolveThemePreference(theme, prefersDark);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia?.(THEME_MEDIA_QUERY);
    if (!mediaQuery) return;

    setPrefersDark(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = getNextThemePreference(current);
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, resolvedTheme, setTheme, toggleTheme };
}
