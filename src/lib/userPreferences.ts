import type { AlertCategory } from "@/types/alert";

export const PREFS_KEY = "alertownik-user-preferences";
const MODE_KEY = "alertownik-alert-mode";

export interface UserPreferences {
  locationKeywords: string;        // comma-separated, e.g. "Komorów, Pruszków"
  categories: AlertCategory[];     // [] means "all categories"
}

export const emptyPreferences: UserPreferences = {
  locationKeywords: "",
  categories: [],
};

export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return emptyPreferences;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      locationKeywords:
        typeof parsed.locationKeywords === "string" ? parsed.locationKeywords : "",
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    };
  } catch {
    return emptyPreferences;
  }
}

export function savePreferences(prefs: UserPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function clearPreferences(): void {
  localStorage.removeItem(PREFS_KEY);
}

export function hasPreferences(prefs: UserPreferences): boolean {
  return prefs.locationKeywords.trim().length > 0 || prefs.categories.length > 0;
}

export function loadMode(): "all" | "my" {
  try {
    return localStorage.getItem(MODE_KEY) === "my" ? "my" : "all";
  } catch {
    return "all";
  }
}

export function saveMode(mode: "all" | "my"): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // localStorage unavailable
  }
}
