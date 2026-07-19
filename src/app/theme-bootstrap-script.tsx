import { THEME_STORAGE_KEY } from "@/lib/theme";

// Sprint 162 — a plain, literal <script> tag (NOT next/script). This
// matters: next/script's "beforeInteractive" strategy still serializes the
// script into Next's RSC flight-data payload and only creates the real DOM
// <script> element once Next's own client runtime processes that payload
// during hydration bootstrap — verified by inspecting the raw server HTML,
// where the script content showed up as JSON inside a
// `self.__next_f.push([...])` call, not as an executable tag. That happens
// too late to prevent a flash: a Playwright check at `domcontentloaded`
// found the `.dark` class still missing.
//
// A raw <script> with no `src`/`async`/`defer`, rendered directly by a
// Server Component, IS emitted as literal HTML and blocks parsing exactly
// where it sits — the browser executes it immediately, before anything
// after it in <body> paints. This is the same technique next-themes and
// shadcn/ui use for this exact problem in the App Router.
//
// Deliberately NOT a TypeScript import of src/lib/theme.ts's resolution
// logic — this runs standalone before any app module has loaded, so the
// system/light/dark resolution + validation rule is duplicated here as
// plain, dependency-free JS. Kept in sync by hand; the same duplication
// exists a third time in public/offline.html for the same reason (that
// page has no app JS bundle at all). THEME_STORAGE_KEY itself IS imported
// (not duplicated) since it's just a string constant inlined at build time.
//
// Safe by construction: wrapped in try/catch so a disabled/exception-prone
// localStorage (private-browsing edge cases, corrupted values, matchMedia
// missing in very old browsers) never breaks page load — it just falls
// back to the light theme silently.
const themeBootstrapScript = `(function () {
  try {
    var KEY = ${JSON.stringify(THEME_STORAGE_KEY)};
    var stored = localStorage.getItem(KEY);
    var pref = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var isDark = pref === "dark" || (pref === "system" && systemDark);
    var root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    root.style.colorScheme = isDark ? "dark" : "light";
  } catch (e) {}
})();`;

export function ThemeScript() {
  return (
    <script
      id="theme-bootstrap"
      // Static, build-time-only string with no user input — not an XSS
      // vector. suppressHydrationWarning: this element is inert after
      // running once; nothing about it should ever be diffed against a
      // client re-render.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
    />
  );
}
