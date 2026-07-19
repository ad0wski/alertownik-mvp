import { test, expect } from "@playwright/test";
import {
  resolveTheme,
  readStoredThemePreference,
  writeStoredThemePreference,
  isThemePreference,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

/**
 * Sprint 162 — pure-function unit tests for the theme resolution logic
 * (no browser/page needed; run directly under Playwright's Node test
 * runner, same pattern as tests/e2e/ssrfGuard.spec.ts).
 */

function fakeStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    _dump: () => store,
  };
}

test.describe("THEME_STORAGE_KEY", () => {
  test("is a distinct, clearly-named key (never the location/category prefs key)", () => {
    expect(THEME_STORAGE_KEY).toBe("alertownik-theme-preference");
    expect(THEME_STORAGE_KEY).not.toBe("alertownik-user-preferences");
    expect(THEME_STORAGE_KEY).not.toBe("alertownik-alert-mode");
  });
});

test.describe("isThemePreference", () => {
  test("accepts exactly system/light/dark", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
  });

  test("rejects anything else, including null/undefined/objects", () => {
    expect(isThemePreference("purple")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
    expect(isThemePreference(42)).toBe(false);
    expect(isThemePreference({})).toBe(false);
  });
});

test.describe("resolveTheme", () => {
  test("light preference always resolves to light, regardless of system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
  });

  test("dark preference always resolves to dark, regardless of system", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("system preference follows the system flag", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

test.describe("readStoredThemePreference", () => {
  test("defaults to system when nothing is stored", () => {
    expect(readStoredThemePreference(fakeStorage())).toBe("system");
  });

  test("returns a validly stored value", () => {
    expect(readStoredThemePreference(fakeStorage({ [THEME_STORAGE_KEY]: "dark" }))).toBe(
      "dark"
    );
  });

  test("falls back to system for a corrupted/invalid stored value", () => {
    expect(
      readStoredThemePreference(fakeStorage({ [THEME_STORAGE_KEY]: "not-a-theme" }))
    ).toBe("system");
  });

  test("falls back to system if storage.getItem throws", () => {
    const throwing = {
      getItem() {
        throw new Error("storage disabled");
      },
    };
    expect(readStoredThemePreference(throwing)).toBe("system");
  });
});

test.describe("writeStoredThemePreference", () => {
  test("writes under THEME_STORAGE_KEY", () => {
    const storage = fakeStorage();
    writeStoredThemePreference(storage, "dark");
    expect(storage._dump()[THEME_STORAGE_KEY]).toBe("dark");
  });

  test("never throws even if storage.setItem throws (e.g. quota/private mode)", () => {
    const throwing = {
      setItem() {
        throw new Error("quota exceeded");
      },
    };
    expect(() => writeStoredThemePreference(throwing, "light")).not.toThrow();
  });
});
