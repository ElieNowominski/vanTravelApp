import { useEffect } from "react";
import { create } from "zustand";
import { THEME_COLORS, THEME_STORAGE_KEY, isThemePreference, resolveTheme, type ResolvedTheme, type ThemePreference } from "@/lib/theme";

type ThemeState = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
};

function readPreference(): ThemePreference {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

function systemDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

/**
 * Préférence d'apparence, en localStorage (petite, lue avant le premier rendu : pas de flash).
 * `useApplyTheme` (une fois, à la racine) pose la classe `dark` sur `<html>` et la couleur de la barre d'état.
 */
export const useThemeStore = create<ThemeState>()((set) => {
  const preference = readPreference();
  return {
    preference,
    resolved: resolveTheme(preference, systemDark()),
    setPreference: (pref) => {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, pref);
      } catch {
        /* navigation privée stricte : la préférence vaut pour la session */
      }
      set({ preference: pref, resolved: resolveTheme(pref, systemDark()) });
    },
  };
});

function apply(theme: ResolvedTheme, printing: boolean): void {
  const root = document.documentElement;
  // À l'impression, toujours clair : un roadbook sombre gâche l'encre et la lisibilité.
  root.classList.toggle("dark", theme === "dark" && !printing);
  root.style.colorScheme = theme === "dark" && !printing ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}

export function useApplyTheme(): void {
  const resolved = useThemeStore((s) => s.resolved);

  useEffect(() => {
    apply(resolved, false);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onSystem = () => {
      const state = useThemeStore.getState();
      useThemeStore.setState({ resolved: resolveTheme(state.preference, media?.matches ?? false) });
    };
    const before = () => apply(useThemeStore.getState().resolved, true);
    const after = () => apply(useThemeStore.getState().resolved, false);
    media?.addEventListener("change", onSystem);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      media?.removeEventListener("change", onSystem);
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [resolved]);
}
