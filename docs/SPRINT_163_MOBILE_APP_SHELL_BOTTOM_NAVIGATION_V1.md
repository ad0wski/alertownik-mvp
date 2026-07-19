# Sprint 163 — Mobile App Shell, "Dzisiaj" View, Bottom Navigation, Touch UX

Branch: `sprint-163-mobile-app-shell-bottom-navigation-v1`
Base: `main` @ `e84a277` (Sprint 161 + 162, live on Production)

## Goal

Turn the public mobile experience from a single scrolled webpage into a
coherent, app-shell-style mobile surface — a fixed bottom navigation, a
short "Dzisiaj" (Today) home view, and a touch-target pass — without
touching security, data, RLS, Supabase, or the admin panel.

## Before / after

**Before:** `/` was both the entry point *and* the full scrollable alert
list (hero → status card → mode toggle → search → category filters → every
alert). The mobile header repeated Alerty/Odpady/O projekcie as a
horizontally-scrolling link row above that.

**After:**
- `/` is a short "Dzisiaj" view: locality chip, the single most important
  active alert (or a calm "nothing urgent" state), the next waste
  collection, up to 3 other active alerts, and a link to the full list.
- `/alerty` is the full list — the *exact* previous "/" content and
  component (`AlertList`), moved verbatim. No behavior was rewritten.
- `/wiecej` is a new settings-style index page for everything that used to
  live only in the footer link row.
- A fixed bottom navigation (Dzisiaj / Alerty / Odpady / Więcej) replaces
  the mobile header's link row on every public page, mobile only.

## New public route map

| Route | Purpose | Source |
|---|---|---|
| `/` | "Dzisiaj" — compact daily view | `src/components/TodayView.tsx` (new) |
| `/alerty` | Full alert list — search, filters, Moja okolica | `src/app/alerty/page.tsx` (new route, reuses `AlertList`) |
| `/odpady` | Waste schedule — unchanged | unchanged |
| `/wiecej` | Settings/info index (mobile "Więcej" tab target) | `src/app/wiecej/page.tsx` (new) |
| `/alerts/[slug]` | Alert detail — unchanged route, gained native share | `AlertDetailClient.tsx` |

No existing public link broke: `/alerts/[slug]` is untouched, and every
link that used to point at `/` for the full list now points at `/alerty`
(header, footer, `/about#chce-testowac`, etc.) or was intentionally
repointed to the new Today view where that's the more useful destination.

## "Dzisiaj" (Today) view

`src/components/TodayView.tsx`, client component, in this order:

1. **Compact header** — "Dzisiaj" + a locality chip (saved area or
   "Wszystkie okolice"), linking to `/alerty` to change it (that's where
   the existing `PreferencesSection` editor lives — not duplicated here).
2. **Most important state** — the most severe currently-*active* alert
   (urgent > warning > info), rendered with the existing `AlertCard`; or a
   calm "Brak pilnych alertów w tej chwili." message. No alert is invented,
   no count is fabricated.
3. **Next waste collection** — the existing `NextCollectionCard`, unchanged,
   reused as-is.
4. **Up to 3 other active alerts** + a "Zobacz wszystkie alerty →" link to
   `/alerty`.
5. **Compact pilot notice** — the existing `BetaStatusCard`, unchanged.

All data comes from `getSupabaseAlerts()` and the existing waste-schedule
query — no new endpoint, no new table, no new client-side fetch pattern.

## Mobile bottom navigation

`src/lib/publicNav.ts` (pure logic, unit-tested) + `src/components/BottomNav.tsx`
(rendering) + `src/components/icons/NavIcons.tsx` (4 small inline SVGs, no
new icon library).

- Four tabs: Dzisiaj (`/`), Alerty (`/alerty`), Odpady (`/odpady`), Więcej
  (`/wiecej`).
- `sm:hidden` — desktop is completely unaffected; no bottom bar there.
- Hidden on `/login` and every `/admin*`, `/builder`, `/ai-helper` route,
  regardless of session — `isBottomNavRoute()` in `publicNav.ts` is a pure,
  tested function, not a per-page opt-out that could be forgotten.
- Each tab: real `<Link>`, `aria-current="page"` on the active one,
  `min-h-[44px]`, visible label text (not icon-only), `focus-visible` via
  the existing global rule (`globals.css`'s `:focus-visible` on `a`).
- `pb-[env(safe-area-inset-bottom)]` on the nav itself for notched devices
  / standalone PWA mode.
- **Content is never covered**: the same component renders a flow-space
  spacer (`<div className="h-16 sm:hidden" />`) immediately before the
  fixed nav, so wherever it sits in the tree (end of `<body>`), the page
  gains exactly enough scroll room.
- `PwaController`'s "new version available" banner was moved from
  `bottom-4` to `bottom-20` on mobile (`sm:bottom-4` restores the original
  position on desktop) so the two fixed elements never overlap.

## Desktop behavior

Unchanged in spirit — same header/footer chrome. The header's desktop nav
gained "Dzisiaj" as its first link (previously "/" and "Alerty" were the
same destination; now they're distinct, so both need a link) and "Alerty"
now points at `/alerty`. No bottom bar was added on desktop.

## Header / footer simplification (mobile)

- **Header:** the mobile-only Alerty/Odpady/O projekcie link row was
  removed — those three destinations (plus Dzisiaj) are now the bottom
  nav. The admin hamburger menu stays (an admin browsing a public page on
  mobile still needs a way back into `/admin`); it was bumped to a real
  44×44px target.
- **Footer:** the full link row (O projekcie, Współpraca, Prywatność,
  Zasady, Kontakt, Panel admina, Zainstaluj Alertownik, Ustawienia) is now
  `hidden sm:flex` — desktop keeps it exactly as before. Mobile shows one
  compact "Więcej →" link instead, since every one of those destinations is
  also a row on `/wiecej`.

## Touch target pass (44×44px minimum)

Applied to: the bottom nav tabs, the admin hamburger button, `AlertList`'s
mode-toggle buttons ("Wszystkie alerty" / "Moja okolica") and its "Ustaw
moją okolicę" CTA, `AlertCard`'s "Szczegóły" and "Otwórz alert" buttons,
and every row on `/wiecej`. `ThemeToggle` (Sprint 162) was already 44px.
Desktop-only controls (the category filter chip row, which is `hidden
sm:flex`) were deliberately left at their existing size — mobile already
uses a native `<select>` there, and enlarging mouse-only desktop chips
wasn't asked for and would be a real visual regression.

Growing these buttons pushed `/alerty`'s first alert card down by ~13.5px
at 390×844 — an intentional, accepted side effect of the accessibility
improvement (the pre-existing fold-position test's threshold was adjusted
accordingly, not the buttons shrunk back).

## Native share

`src/components/ShareAlertButton.tsx`, used on the alert detail page.
Uses `navigator.share({ title, text, url })` when available; falls back to
`navigator.clipboard.writeText(url)` otherwise. No permission is requested
by either API. Nothing is sent to any server by this component — the OS
share sheet (native `share()`) or the browser's own clipboard API (`copy`
fallback) does the actual work. An `AbortError` (user closed the native
share sheet) is treated as a no-op, not a failure; any other failure shows
an accessible `role="status" aria-live="polite"` message.

## Theme / PWA compatibility

No changes to `ThemeProvider`, `ThemeScript`, or the theme token system —
all new surfaces (`BottomNav`, `TodayView`, `/alerty`, `/wiecej`,
`ShareAlertButton`) use the existing `dark:` classes and semantic tokens
from Sprint 162, so they inherit no-flash/no-hydration-mismatch behavior
for free. `public/sw.js`'s `CACHE_NAME` and cache policy are byte-for-byte
unchanged this sprint — still only the offline fallback + its icon,
`/admin` and `/api` still excluded. `offline.html` is untouched.

## Accessibility

- `<nav aria-label="Nawigacja główna">` for the bottom nav (semantic,
  distinct label from the header's own `<nav aria-label="Nawigacja">`).
- `aria-current="page"` on the active tab, computed by the same pure
  `activePublicNavKey()` function the tests pin.
- Every new/touched interactive element is ≥44×44px.
- No new animation was added; the existing global
  `prefers-reduced-motion: reduce` rule (Sprint 162) already covers the
  small `transition-colors` used on nav tabs.
- Status/category information was never color-only before this sprint and
  still isn't (labels + icons alongside color everywhere).

## Test matrix

`tests/e2e/mobileAppShell.spec.ts` (new), `tests/e2e/publicNav.spec.ts`
(new, pure-function), plus targeted fixes to three pre-existing files:

1. Bottom nav visible on public mobile — `mobileAppShell.spec.ts`
2. Bottom nav hidden on desktop — `mobileAppShell.spec.ts`
3. Bottom nav hidden on `/admin` and `/login` — `mobileAppShell.spec.ts`
4. Correct active tab for all 4 routes + alert-detail pages — `mobileAppShell.spec.ts`, `publicNav.spec.ts`
5. No horizontal scroll at 375/390/414px — `mobileAppShell.spec.ts`
6. Bottom nav never covers the last piece of content — `mobileAppShell.spec.ts`
7. Touch targets ≥44px (nav tabs, `/wiecej` rows) — `mobileAppShell.spec.ts`
8. `/` renders the Dzisiaj view — `mobileAppShell.spec.ts`
9. `/alerty` renders the full list + filters — `mobileAppShell.spec.ts`
10. `/wiecej` contains every required destination — `mobileAppShell.spec.ts`
11. Share via `navigator.share` — `mobileAppShell.spec.ts`
12. Share fallback copies the link — `mobileAppShell.spec.ts`
13. Light/dark/system compatibility of the new surfaces — `mobileAppShell.spec.ts`
14. Safe-area reservation on the bottom nav — `mobileAppShell.spec.ts`
15. Existing empty states / locality behavior — unchanged `AlertList`
    tests, relocated to `/alerty` in `public.spec.ts` (same assertions, same
    component, new URL — see below)
16. Existing Sprint 161 security tests — untouched, still run as part of
    the full suite (`serverAuth.spec.ts`, `ssrfGuard.spec.ts`,
    `securityHeaders.spec.ts`, RLS anti-drift)
17. PWA cache policy unchanged — `tests/pwa/pwa.spec.ts` (M3/M5), unmodified
    this sprint, still green

**`tests/e2e/public.spec.ts` migration:** ~35 of its ~44 `page.goto("/")`
calls were AlertList-dependent (search, filters, Moja okolica, empty
states) and moved to `page.goto("/alerty")` — same test bodies, same
assertions, just the new home of that exact, unchanged component. 9 tests
that are genuinely about the homepage (BetaStatusCard presence, footer
disclaimers, header-link navigation, the logged-out admin-link gate) stayed
at `/`. The old "mobile header widths" test (which asserted the now-removed
Alerty/Odpady/O projekcie header row) was rewritten to assert the bottom
nav instead — same three widths, same no-horizontal-scroll requirement.

Full gate: `npm run check` / `npm run test:e2e` (584/584) /
`npm run test:pwa` (17/17) / `npm run build` / `git diff --check` — all
green. One pre-existing test (`themeSystem.spec.ts`'s "clicking Jasny
overrides a dark system preference") intermittently fails only when run as
part of the full 580+-test suite and passes reliably standalone — the same
load-dependent flake pattern documented in Sprint 162, not a Sprint 163
regression (verified via multiple isolated runs against a freshly-restarted
dev server).

## Manual QA

See the final sprint report's Browser QA section for what was verified via
Claude in Chrome against the Preview deployment, and the exact 1–2 items
(if any) flagged for Adam to confirm manually where the browser-automation
tooling's `resize_window` couldn't produce a trustworthy real mobile
viewport in this session (a known limitation carried over from Sprints
161C/162/162B).

## Known limitations

- `TodayView`'s "most important alert" picks by severity rank among
  currently-*active* alerts only — an *upcoming* urgent alert (starts
  tomorrow) won't surface on `/` until it becomes active. This matches the
  existing app-wide convention that "active" is the primary state; the full
  list at `/alerty` always shows upcoming alerts too.
- The bottom nav's icons are small custom inline SVGs, not from an icon
  library — kept deliberately simple/generic per the sprint's "don't add a
  new icon library" constraint.
- No new visual-regression/pixel-diff tooling was added; layout
  correctness is verified via computed bounding boxes and class assertions
  (Playwright), not screenshot diffing.
- Mobile-viewport browser QA in this session is subject to the same
  `resize_window` limitation noted in Sprints 161C/162/162B — flagged
  explicitly in the final report rather than faked.

## Rollback

This sprint is additive at the route level (`/alerty`, `/wiecej` are new;
`/` is a full content replacement, not a structural change to routing) and
touches shared chrome (`AppHeader`, `AppFooter`, `PwaController`,
`layout.tsx`) plus two shared components' touch targets (`AlertList`,
`AlertCard`). To roll back: revert this sprint's merge commit(s) on `main`.
No SQL, no Supabase/RLS change, no `CACHE_NAME` bump, no env var change —
rollback is a pure code revert with no manual data/infra cleanup step.
