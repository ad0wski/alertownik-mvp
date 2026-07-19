"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  readStoredThemePreference,
  resolveTheme,
  writeStoredThemePreference,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyResolvedTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;

  // The static <meta name="theme-color" media="..."> pair rendered from the
  // `viewport` export (layout.tsx) only ever tracks the OS-level
  // prefers-color-scheme query — it can't see a manual in-app override.
  // Clearing `media` and setting `content` here makes the browser
  // chrome/PWA status bar color follow the resolved theme unconditionally,
  // including when the user picks "Jasny"/"Ciemny" against their OS setting.
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((meta) => {
    meta.removeAttribute("media");
    meta.setAttribute("content", theme === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  });
}

// Sprint 162 — the single source of truth for theme state after hydration.
// ThemeScript (a literal, blocking <script> — see theme-bootstrap-script.tsx)
// already set the correct `.dark` class and `color-scheme` on <html> before
// first paint; this provider takes over from there so the choice can change
// live (toggle click, or an OS theme change while "Systemowy" is selected)
// without a reload.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Deliberately NOT lazy-initialized from localStorage. React's hydration
  // pass compares the server-rendered HTML against what the CLIENT's first
  // render produces — and unlike ThemeScript (a raw <script>, entirely
  // outside React's tree), a `useState(() => window-dependent-value)`
  // initializer runs for real during that first client render. Reading
  // localStorage there would make the client's first render disagree with
  // the server's (which always used "system"/no-preference, since
  // `window` doesn't exist during SSR) — a genuine hydration mismatch, not
  // just a suppressible warning. Starting both at the same deterministic
  // "system" values, then correcting via the effect below (which only runs
  // client-side, after the hydration commit), keeps server and first-paint
  // HTML identical. The `.dark` class itself never flashes wrong — it was
  // already set correctly pre-hydration by ThemeScript; only
  // theme-*dependent UI* (ThemeToggle's highlighted option/label) may
  // repaint once, near-instantly, right after mount if the stored
  // preference differs from "system" — the same tradeoff every SSR
  // dark-mode implementation (e.g. next-themes) makes for this reason.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  useEffect(() => {
    setPreferenceState(readStoredThemePreference(window.localStorage));
    if (window.matchMedia) {
      setSystemPrefersDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
  }, []);

  // React to OS-level theme changes live — only matters while "system" is
  // selected, but the listener stays registered regardless (cheap, and
  // avoids resubscribe churn when the user toggles preferences).
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const resolvedTheme = useMemo(
    () => resolveTheme(preference, systemPrefersDark),
    [preference, systemPrefersDark]
  );

  const isFirstApply = useRef(true);
  useEffect(() => {
    // Skip the very first run: ThemeScript already applied the correct
    // class before paint, and re-applying it here would be a harmless but
    // pointless extra layout/style recalculation on every single page load.
    if (isFirstApply.current) {
      isFirstApply.current = false;
      return;
    }
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeStoredThemePreference(window.localStorage, next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
