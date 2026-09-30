/** Préférence d'apparence : suivre le téléphone, ou forcer clair ou sombre. */
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "vantravel-theme";

/** Couleur de la barre d'état (meta `theme-color`) selon le thème : fond de l'app. */
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#0f5a46", dark: "#1c1c1c" };

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

/** Ordre du bouton qui fait défiler les préférences : système, clair, sombre. */
export function nextThemePreference(pref: ThemePreference): ThemePreference {
  return pref === "system" ? "light" : pref === "light" ? "dark" : "system";
}

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "Comme le téléphone",
  light: "Clair",
  dark: "Sombre",
};
