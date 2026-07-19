// Sprint 162 — theme system (light / dark / system).
//
// Kept as pure functions so the resolution logic can be unit-tested without
// a DOM, and so the exact same logic can be duplicated (as plain JS, not
// imported — see the inline script note below) inside the pre-hydration
// bootstrap script and inside public/offline.html.

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

// Separate, clearly-named key — never reused for anything else, never sent
// to Supabase or any server. Distinct from the existing
// `alertownik-user-preferences` / `alertownik-alert-mode` keys so this
// sprint never touches the location/category preference model.
export const THEME_STORAGE_KEY = "alertownik-theme-preference";

const VALID_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (VALID_PREFERENCES as string[]).includes(value);
}

// Reads and validates the stored preference. Any missing key, corrupt
// value, storage exception (private-browsing quota, disabled storage, etc.)
// safely falls back to "system" — never throws.
export function readStoredThemePreference(storage: Pick<Storage, "getItem">): ThemePreference {
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function writeStoredThemePreference(
  storage: Pick<Storage, "setItem">,
  preference: ThemePreference
): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage unavailable/full/blocked — the in-memory theme still applies
    // for this session, it just won't persist. Never throw.
  }
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}

export const THEME_COLOR_LIGHT = "#f8fafc";
export const THEME_COLOR_DARK = "#0b1220";
