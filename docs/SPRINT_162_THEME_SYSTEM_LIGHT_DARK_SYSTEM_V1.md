# Sprint 162 — Light / Dark / System Theme

Branch: `sprint-162-theme-system-light-dark-system-v1`
Base: `main` @ `63fe953` (Sprint 161, production)

## Goal

Add a complete, accessible, safe light/dark/system theme covering public,
admin, and PWA surfaces, with no flash of the wrong theme on load and no
change to the location/category preference model.

## Architecture

### Token system (`src/app/globals.css`)

A single set of semantic CSS custom properties (`--au-*`), redefined once
under `:root` (light) and once under `.dark` (dark), registered into
Tailwind v4's `@theme` so they're also usable as plain utility classes
(`bg-surface`, `text-primary`, `border-strong`, ...):

`background`, `background-subtle`, `surface`, `surface-elevated`,
`text-primary`, `text-secondary`, `text-muted`, `border`, `border-strong`,
`primary`, `primary-hover`, `primary-foreground`, `focus-ring`, `success`,
`warning`, `danger`, `info`, `overlay` (+ `shadow`, not wired to Tailwind's
`@theme` since box-shadow color isn't a standard Tailwind color token).

`@custom-variant dark (&:where(.dark, .dark *));` makes Tailwind's `dark:`
variant respond to a `.dark` class on `<html>` rather than the
`prefers-color-scheme` media query directly — that's what lets a manual
"Jasny"/"Ciemny" choice override the OS setting, while "Systemowy" is
implemented in JS (see below) by toggling that same class to match the OS.

The light palette was chosen to match the app's existing look as closely as
possible — this ships with no visual regression for light-mode users, who
are the entire current user base.

### Two coexisting styling strategies

New code (`/ustawienia`, `ThemeToggle`) uses the semantic token classes
directly (`bg-surface`, `text-text-primary`, ...) — one class, both themes,
because the underlying CSS variable changes under `.dark`.

The other ~30 existing files (all admin pages, all public pages, most
shared components) predate this sprint and use hardcoded Tailwind palette
classes (`bg-white`, `text-slate-700`, `bg-blue-50 text-blue-700`, etc.)
throughout — hundreds of occurrences across deeply nested conditional
className strings. Rewriting all of them to the token classes in one sprint
was not realistic without a much higher risk of visual regression than the
brief's "no unnecessary regression" goal allows.

Instead, those files were swept with a scripted, purely **additive** pass
(`dark:<companion-class>` inserted right after each matching light class,
nothing removed or reordered) covering the ~35 recurring color patterns
that make up the overwhelming majority of the app's surface color usage:
white/slate backgrounds and text, slate borders, and the blue/amber/red/
emerald semantic-color families used for nav highlighting, badges, and
status pills. ~1,900 companion classes were added this way. The four
highest-traffic shared-chrome files (`AppHeader`, `AppFooter`,
`NetworkStatusBanner`, `PwaController`) were done by hand for extra care
since they appear on every single page.

**Honest gap:** this sweep is pattern-based, not a full manual design pass.
It gives every listed route real, readable, reasonable-contrast dark mode —
verified by the browser QA in this report — but it hasn't had the same
per-component design polish as light mode. See "Known limitations" below.

### Theme selection (`src/lib/theme.ts`, `ThemeProvider`, `ThemeToggle`)

Three preferences: `system` (default), `light`, `dark`. Stored under the
localStorage key **`alertownik-theme-preference`** — a new, clearly-named
key, entirely separate from the existing `alertownik-user-preferences` /
`alertownik-alert-mode` keys used for the "Moja okolica" location/category
model, which this sprint does not touch. Never sent to Supabase or any
server — this is 100% client-side.

`src/lib/theme.ts` holds the pure resolution logic (`resolveTheme`,
`readStoredThemePreference`, `writeStoredThemePreference`,
`isThemePreference`) — safe by construction: any missing key, corrupt
value, or storage exception (private browsing, quota, disabled storage)
falls back to `"system"`, never throws.

`ThemeProvider` (`src/components/ThemeProvider.tsx`) is the live,
post-hydration source of truth: it listens to
`matchMedia("(prefers-color-scheme: dark)")` and reacts to a live OS theme
change while "Systemowy" is selected, with **no page reload**. Manual
selection always takes precedence over the system value.

`ThemeToggle` (`src/components/ThemeToggle.tsx`) is a labeled
`role="radiogroup"` with three `role="radio"` buttons (not a `<select>`) so
every option and the current choice are visible and keyboard/screen-reader
navigable at once. Lives on the new public `/ustawienia` page (linked from
the footer, "Wygląd" section) — the main header was deliberately not
extended, per the sprint brief.

### Hydration and no-flash strategy

The literal first thing rendered inside `<body>` in `src/app/layout.tsx` is
`<ThemeScript />` (`src/app/theme-bootstrap-script.tsx`) — a **raw,
blocking `<script>` tag** (`dangerouslySetInnerHTML`, not `next/script`).

This is a deliberate, verified choice: `next/script`'s `strategy=
"beforeInteractive"` was tried first, but inspecting the raw server HTML
showed the script content serialized into Next's RSC flight-data payload
(`self.__next_f.push([...])`) rather than emitted as a literal executable
tag — it only becomes a real DOM `<script>` once Next's own client runtime
processes that payload during hydration bootstrap, which is *not*
guaranteed to happen before the browser's first paint. A Playwright check
at `domcontentloaded` confirmed the `.dark` class was still missing with
that approach. A plain `<script>` element with no `src`/`async`/`defer`,
rendered by a Server Component, IS emitted as literal HTML and blocks
parsing exactly where it sits — this is the same technique `next-themes`
and `shadcn/ui` use for the same reason.

The script reads `alertownik-theme-preference`, validates it, checks
`matchMedia` for the system preference if needed, and sets `.dark` +
`documentElement.style.colorScheme` before anything else in `<body>`
renders. Wrapped in `try/catch` — any failure (localStorage disabled,
`matchMedia` missing) silently falls back to light, never breaks the page.

`<html suppressHydrationWarning>` acknowledges the resulting (correct,
expected) mismatch between the server-rendered `class`/`style` attributes
on `<html>` and what the script sets client-side — scoped to that one
element's attributes only, not its subtree.

**A second, separate hydration hazard was found and fixed during this
sprint:** `ThemeProvider`'s React state (used for `ThemeToggle`'s
highlighted option and "Aktualnie: ..." text — not for the actual `.dark`
class, which the raw script already owns) must not read `localStorage`
inside a `useState` lazy initializer. That initializer runs for real during
React's client-side hydration render, so if it read `localStorage` there,
the client's first render would disagree with the server's (which always
sees `system`/no-preference, since `window` doesn't exist during SSR) —
producing an actual React hydration-mismatch error, not just a suppressible
one. Fixed by starting both state values at deterministic,
server-matching defaults (`"system"`, `false`) and correcting them inside a
`useEffect` that only runs post-mount. Net effect: zero hydration errors,
and the app's actual colors never flash wrong; only `ThemeToggle`'s own
internal highlight/label may repaint once, near-instantly, right after
mount if the stored preference differs from "system" — the same tradeoff
every SSR-rendered dark-mode implementation makes for this exact reason.

### CSP impact

**None.** `next.config.ts`'s `script-src 'self' 'unsafe-inline'` already
permitted inline scripts before this sprint (required by Next's own RSC
streaming bootstrap scripts, per that file's Sprint 161 comment) — the
theme bootstrap script runs under the same, unmodified directive.
`tests/e2e/securityHeaders.spec.ts` gained a new anti-drift test
(`script-src / connect-src / style-src directive sets are unchanged from
the Sprint 161 baseline`) that pins the exact directive set, so a future
change that widens CSP further (a new external host, `'unsafe-eval'` in
production, etc.) fails loudly instead of silently.

### Metadata / PWA

- `viewport.themeColor` (`layout.tsx`) is now a dual
  `[{media: "(prefers-color-scheme: light)", ...}, {media: "(prefers-color-scheme: dark)", ...}]`
  pair, per Next's documented `Viewport` API.
- `ThemeProvider` additionally updates the actual `<meta name="theme-color">`
  DOM nodes' `content` (clearing `media`) whenever the resolved theme
  changes, so a **manual** override also affects the browser
  chrome/PWA status bar color, not just the OS-driven default the static
  meta pair alone would give.
- `manifest.ts`'s `background_color`/`theme_color` were deliberately left
  as their existing light-mode values — the Web App Manifest spec has no
  dark-mode variant for these fields (unlike the HTML meta pair above), so
  OS install/splash surfaces that read the manifest directly always use the
  light brand color regardless of theme. Documented as a known gap, not an
  oversight.
- `public/sw.js`'s cache-policy logic is unchanged; `CACHE_NAME` was bumped
  `v1 -> v2` purely because `offline.html`'s cached *content* changed (dark
  mode) — without the bump, an already-installed service worker would keep
  serving the old light-only offline page indefinitely.

### `public/offline.html`

Has no app JavaScript dependency by design (SW-cached fallback must work
standalone). Dark mode there is `prefers-color-scheme` media-query driven
by default, plus a tiny (~10 line), dependency-free inline script that
mirrors the same localStorage key/logic to let a manual override win over
the system query too. All selectors key off a class on `<html>`
(`au-dark`/`au-light`) exclusively — an earlier draft duplicated the
class-presence check on `<body>` as well, which never received the class
and always matched `:not(.au-light)`, silently defeating the manual-light
override; caught and fixed by the Playwright test in `tests/pwa/pwa.spec.ts`
before merge.

## Routes covered

`/`, `/alerts/[slug]`, `/odpady`, `/about`, `/zasady`, `/prywatnosc`,
`/partnerzy`, `/instalacja`, `/ustawienia` (new), `/login`, `/admin`,
`/admin/sources`, `/admin/queue`, `/admin/new-alert`, `/admin/waste`,
`/builder`, `/ai-helper` — every route in the sprint brief.

## Accessibility

- Focus ring: `globals.css`'s existing `:focus-visible` rule now reads
  `var(--au-focus-ring)`, which is a brighter blue under `.dark` for
  contrast against dark surfaces.
- `ThemeToggle` is a real `role="radiogroup"` with per-option
  `role="radio"`/`aria-checked`, each button `min-h-[44px]` (accessibility
  requirement), labeled via `aria-label="Wygląd aplikacji"` on the group,
  and a visible "Aktualnie: ciemny/jasny (wg ustawień systemu)" status line
  — current state is never ambiguous.
- `prefers-reduced-motion: reduce` is respected globally (`globals.css`)
  by collapsing all transition/animation durations to near-zero — no new
  animation was added for the theme system itself.
- No color-only status indicators were introduced; existing badge/status
  patterns (which already pair color with text/icons) kept that pairing in
  dark mode via the sweep.

## Test matrix (`tests/e2e/themeSystem.spec.ts`, `themeLogic.spec.ts`, additions to `securityHeaders.spec.ts` and `tests/pwa/pwa.spec.ts`)

1. Default system, system light → light — `themeSystem.spec.ts`
2. Default system, system dark → dark — `themeSystem.spec.ts`
3. Manual light persists/applies regardless of system — `themeSystem.spec.ts`
4. Manual dark persists/applies regardless of system — `themeSystem.spec.ts`
5. Manual "system" explicitly stored behaves like system — `themeSystem.spec.ts`
6. Click-through: Ciemny → dark, persists after reload — `themeSystem.spec.ts`
7. Click-through: Jasny overrides a dark system — `themeSystem.spec.ts`
8. Click-through: Systemowy reverts to following the OS — `themeSystem.spec.ts`
9. Live reaction to an OS `prefers-color-scheme` change, no reload — `themeSystem.spec.ts`
10. No hydration error on a dark-mode load — `themeSystem.spec.ts`
11. No flash of the wrong theme (checked at `domcontentloaded`, before hydration) — `themeSystem.spec.ts`
12. Invalid/corrupt localStorage value falls back safely to system — `themeSystem.spec.ts` (+ pure-function coverage in `themeLogic.spec.ts`)
13. Offline page light/dark, incl. manual override winning over system — `tests/pwa/pwa.spec.ts`
14. Dual `theme-color` meta present + follows a manual override — `themeSystem.spec.ts`
15. Public homepage, alert-detail (not-found state), `/login`, `/ustawienia` render with `.dark` class, zero console errors — `themeSystem.spec.ts`
16. No horizontal scroll at 375/390/414px in dark mode — `themeSystem.spec.ts`
17. Existing PWA cache-exclusion tests (M3/M5) still pass unmodified in behavior — only the hardcoded `alertownik-pwa-v1` string literal was updated to `v2` to match the real cache-name bump, same as fixing a stale fixture, not a policy weakening.

Plus: `themeLogic.spec.ts` unit-tests the pure `src/lib/theme.ts` functions
directly (storage-exception safety, key validation, resolution truth
table), and `securityHeaders.spec.ts` gained the CSP anti-drift pin
described above.

Full gate: `npm run check` / `npm run test:e2e` (544/544) /
`npm run test:pwa` (17/17) / `npm run build` / `git diff --check` — all
green on this branch.

## Manual QA

Browser QA was performed via Claude in Chrome against the Preview
deployment once pushed — see the final sprint report for the exact pages,
viewports, and console/network findings. If browser access wasn't
available at report time, the report lists the exact manual checklist for
Adam instead of claiming QA that didn't happen.

## Known limitations

- The ~30 pre-existing files use an additive `dark:` companion-class sweep
  rather than the semantic token system — real, readable dark mode, but
  not hand-tuned per component the way light mode is. A future sprint could
  migrate these incrementally to `bg-surface`/`text-text-primary`/etc.
  without any behavior change.
- `ThemeToggle`'s highlighted option/label may repaint once, near-instantly,
  right after mount if the stored preference differs from "system" (see
  Hydration section) — the app's actual background/text colors never flash;
  only this one small UI element can.
- The Web App Manifest's `background_color`/`theme_color` stay fixed to the
  light brand color — no dark-mode manifest variant exists in the spec.
- `ring-*` accent colors on a few status badges (e.g. `ring-blue-200` on
  the info badge in `AlertCard`) were left as-is in dark mode — they're
  subtle 1px accents, not a contrast-critical surface, and changing them
  wasn't part of the scripted sweep's pattern set.
- No new automated visual-regression/screenshot-diff tooling was added;
  dark-mode correctness is verified via computed-style/class assertions
  (Playwright) and manual/browser-QA screenshots, not pixel-diffing.
