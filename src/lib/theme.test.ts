import { describe, expect, it } from "vitest";
import { isThemePreference, nextThemePreference, resolveTheme } from "@/lib/theme";

describe("thème", () => {
  it("suit le système seulement en « system »", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("fait défiler système, clair, sombre", () => {
    expect(nextThemePreference("system")).toBe("light");
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
  });

  it("ne lit qu'une préférence connue", () => {
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("bleu")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});
