# Sprint 158A — Personalization Clarity and Empty States v1

Prepared 2026-07-16 on branch `sprint-158a-personalization-clarity-empty-states-v1`.
No merge, no deploy, no Production/Vercel/Supabase/schema/RLS/cron change.

## Source of this sprint

Two professional Userbrain UX tests, run by Franklin and Elizabeth (English-speaking
testers using Chrome's automatic translation) against the public homepage.

### Shared finding (both testers)

Both found the "Moja okolica" feature and understood its general purpose, but after
saving preferences were not sure:

- what exactly changed on screen;
- whether the list below was actually filtered by their saved area;
- whether the "Szukaj po miejscowości lub tytule" search box was a second way to set
  the area;
- whether an empty screen meant no alerts, an unsupported area, or a wrong setting;
- why typing "Warszawa" showed no results (Warszawa isn't a pilot locality).

Both testers rated positively: category chips, the Transport category, alert detail
structure, source visibility, date ranges, and ended-alert status. None of that was
touched this sprint.

### Language-testing caveat

Both testers were English-speaking and relied on Chrome's automatic translation,
which distorted Polish locality names. This is not treated as a blocker for the
Polish-language pilot — see the English-support backlog item below.

## What changed

### C — Single settings panel

`PreferencesSection.tsx` is now the only place a resident sets or changes "Moja
okolica": one panel with an explanation line, `PILOT_LOCALITIES` chips, a manual
locality/street-group text field, category toggles, and one "Zapisz preferencje"
action. It replaces two previously separate mechanisms — a compact chip-only picker
in `AlertList.tsx` and a fuller form only shown once `mode === "my"` — that were
visually distinct and, per both Userbrain testers, not obviously the same setting.

Clicking a chip now fills the panel's field rather than instantly saving (the
instant-save-per-chip behavior was itself part of the "two different mechanisms"
confusion — the panel now has exactly one save action for the whole form).

### D — Active scope bar

Directly above the search/filter/list area, one box now has three distinct states:

1. No preferences saved — prompt + "Ustaw moją okolicę" button.
2. Preferences saved **and** `mode === "my"` (actively filtering) — "Pokazujesz
   alerty dla: **[okolica]**" plus "Kategorie: …" plus "Zmień ustawienia".
3. Preferences saved **but** `mode === "all"` (saved, not currently active) —
   "Zapisana okolica: … — nieaktywna w widoku „Wszystkie alerty”" plus links to
   switch mode or change settings.

State 3 is new: previously the box always said "Twoja okolica: X" regardless of
whether that preference was actually filtering anything, which was itself
misleading. The "Co sprawdzić teraz" count and its "w Twojej okolicy" wording were
also changed to only apply when `mode === "my" && prefsSet` (previously `prefsSet`
alone), for the same reason.

### E — Search clarity

Placeholder changed from "Szukaj po miejscowości lub tytule..." to "Szukaj po
tytule lub treści alertu…", with a label above the field ("Szukaj w aktualnym
widoku") and a one-line note ("Przeszukuje tylko alerty pokazane obecnie na liście —
nie zmienia zapisanej okolicy"). The search logic itself (`matchesSearch`) is
unchanged — it still matches place text too — only the copy no longer implies it's
a second way to set the area.

### F — Pilot coverage detection

New `src/lib/pilotCoverage.ts`, `matchPilotLocality()`: classifies a typed
`locationKeywords` value against `PILOT_LOCALITIES` (no new list, generated from
the existing constant) as:

- `matched` — resembles a known pilot locality name.
- `unclear` — looks street/estate-like (starts with "ul.", "ulica", "al.", "aleja",
  "os.", "osiedle") and can't be confidently placed inside or outside the pilot
  area from the name alone.
- `unsupported` — doesn't match any locality and isn't street-like — confidently
  flagged.
- `empty` — no location keywords set.

This is plain string matching, not geocoding — see the new limitation entry in
`docs/LIMITATIONS.md`.

### G — Distinct empty states

`AlertList.tsx` now computes one of six mutually exclusive empty-state kinds
instead of one generic "no matches" message:

| Kind | Trigger | Message | Action |
|---|---|---|---|
| `unsupported-area` | area filter resolves to `unsupported` | "Nie obsługujemy jeszcze tej okolicy." + pilot list | "Wybierz obsługiwaną okolicę" |
| `area-empty` | only the area filter is active | "Dobra wiadomość — obecnie nie mamy aktywnych alertów dla …" (+ cautious note if `unclear`) | "Zmień okolicę" / "Pokaż wszystkie alerty" |
| `category-empty` | only the category filter is active | "Nie ma obecnie aktywnych alertów kategorii X w tym widoku." | "Pokaż wszystkie kategorie" |
| `search-empty` | only the search query is active | "Nie znaleziono alertów pasujących do wpisanej frazy." | "Wyczyść wyszukiwanie" |
| `combined` | 2+ of area/category/search active | lists each active condition with its own clear action | per-condition |
| `none` | no filters active at all | "Brak aktualnych alertów." (unchanged from before) | — |

`unsupported-area` takes priority over all others — an out-of-pilot area is a
coverage gap, not a filter-combination problem.

### H — Trust and source

No change. `AlertCard`'s "Źródło: X" label was **not** relabeled to "Oficjalne
źródło" — the `Alert` type has no reliable per-alert "is this an official source"
flag, and the spec for this sprint explicitly forbids marking unofficial sources as
official. Left as a possible follow-up if/when source records carry that
distinction.

### I — English language (backlog, not implemented)

Recorded in `docs/LIMITATIONS.md` under "No English Language Support Yet
(Backlog)". Not implemented this sprint per explicit instruction — the pilot is
Polish-first, and a partial/toggle translation was explicitly avoided.

## Empty states — how to see each one

- `unsupported-area`: set "Moja okolica" to "Warszawa".
- `area-empty`: set "Moja okolica" to a pilot locality with currently no matching
  alerts (data-dependent).
- `category-empty`: select a category with currently no matching alerts
  (data-dependent).
- `search-empty`: type a nonsense search phrase.
- `combined`: select a category **and** type a nonsense search phrase at once
  (deterministic regardless of live data).

## Tests

Added/updated in `tests/e2e/public.spec.ts`:

- Updated existing tests for the new search placeholder, the new mode-toggle
  behavior (no longer auto-opens the panel), and the chip-then-Save flow
  (previously chip = instant save).
- New `describe("Sprint 158A — personalization clarity and empty states")` block:
  default view with no personalization active; manual (non-chip) locality entry;
  localStorage round-trip after reload; unsupported-area state (Warszawa,
  deterministic); area-empty state (graceful — accepts either real-data outcome,
  but always rejects the wrong "unsupported" copy); search-empty state with clear
  action; category-empty state (graceful); combined state (deterministic via
  category + nonsense search); street-like caution note in the panel; no forced
  onboarding; settings panel usable with no horizontal scroll at 375/390/414px.

No existing test was deleted or weakened; several were updated to assert the new
(intentionally changed) UI text/flow instead of the old one.

## QA results

- `npm run typecheck` — ✅ zero errors.
- `npm run lint` — ✅ zero errors, zero warnings.
- `npm run build` — ✅ succeeds, all 22 routes generated.
- `npm run test:e2e` (`tests/e2e/public.spec.ts`, 72 tests) — ✅ 72/72 passing
  after one fix (a Playwright strict-mode ambiguity between the search box's inline
  clear button and the new empty-state's "Wyczyść wyszukiwanie" button — resolved
  by scoping the locator, not by weakening the assertion).
- Full `npm run test:e2e` suite (all spec files) — see repo test run for this
  sprint; no known regressions introduced outside `public.spec.ts`.

## Mobile UX

Verified at 375×812, 390×844, 414×896 via Playwright: settings panel (including
locality chips and the manual-entry field) renders with no horizontal scroll at all
three widths; category filters continue to wrap (Sprint 156B behavior, unchanged).

## No Production impact

This sprint made zero changes to Supabase schema, RLS, environment variables,
Vercel configuration, or cron. All changes are `src/` (two components rewritten,
one new lib file) and `tests/e2e/public.spec.ts` plus documentation. Nothing here
reaches Production until Adam merges and deploys.

## Backlog carried forward

- **English language support for foreign residents** — see
  `docs/LIMITATIONS.md`. Needs a dedicated i18n audit (copy, routes, metadata, and
  admin-entered alert data), not a partial toggle.
- **Real pilot-coverage geocoding** — current detection is a name-matching
  heuristic (`src/lib/pilotCoverage.ts`), not geocoding. Fine for six known
  localities; would need real geodata if the pilot area grows more fragmented.

## SPRINT 158A-2 COMPLETION

A follow-up verification pass on this sprint's own commit (`9147ede`) found
two remaining gaps against the Alerts First / mobile-hierarchy requirement:

1. Category filters still wrapped into two rows of chips on small screens
   (a deliberate Sprint 156B decision, kept as-is by 158A), instead of one
   compact control.
2. At 390×844, the first alert card's top edge landed at y≈840 — inside
   the viewport, but with only ~3.5px visible before the fold. Not a
   comfortable "first glance," even though it technically crossed the
   viewport boundary.

### Mobile category select (desktop unchanged)

`AlertList.tsx`'s category-filter block now renders two mutually exclusive
controls sharing the same `selected`/`setSelected` state and the same
`categoryFilters` list — never both at once:

- **Desktop** (`sm:` and up): the existing chip row, class `hidden sm:flex`,
  unchanged in behavior, styling, and accessibility.
- **Mobile** (below `sm`): a single native `<select id="category-select">`
  labeled "Kategoria", class `sm:hidden`, with one `<option>` per entry in
  `categoryFilters` (`Wszystkie`, `Transport`, `Woda`, `Prąd`, `Odpady`,
  `Drogi`, `Komunikaty` — no new category list, no duplicated model).

Because both controls read/write the same state, switching the select
filters the list exactly like the desktop chips did; there is exactly one
category-filtering model, not two.

### First-viewport spacing (content preserved, nothing hidden)

Chip→select on mobile alone freed some vertical space, but not enough. The
remaining gap was closed with small, non-destructive spacing trims — no
text shortened, no information removed, no sticky/overlapping elements
introduced:

- `page.tsx`: main container's mobile top padding `py-3` → `py-2`; hero
  subtitle `leading-relaxed` → `leading-snug` on mobile only (`sm:leading-relaxed`
  preserved at desktop widths) — the subtitle wraps to 3–4 lines at 390px,
  so line-height was the single largest lever here.
- `BetaStatusCard.tsx`: card padding `py-1.5` → `py-1`, outer margin
  `mb-2` → `mb-1.5`, disclaimer paragraph `leading-relaxed` → `leading-snug`.
  Same two lines of content, same links, same claims — just tighter line
  spacing.
- `AlertList.tsx`: mode-toggle buttons `py-2` → `py-1.5` and row margin
  `mb-2` → `mb-1.5`; active-scope box padding `py-2` → `py-1.5` and margin
  `mb-2` → `mb-1.5`; alert counter margin `mb-5` → `mb-3`.

Measured live (Playwright, dev server) at 390×844 before/after:

| | articleTop (first `<article>` top, px) |
|---|---|
| Before (two-row chips, original spacing) | 840.5 |
| After (mobile select only) | 816.5 |
| After (select + spacing trims) | **771.5** |

771.5 ≤ 780 (the ≥64px-before-fold threshold used by the new automated
test), with the category badge and the start of the alert title visibly
readable in the same screenshot, not just technically present. Verified
with no layout regression at 375×812 and 414×896 (same 771.5, since none of
the trimmed elements vary by these three widths). No horizontal scroll at
any of the three widths.

### New automated test

`tests/e2e/public.spec.ts`, `describe("Sprint 158A-2 — mobile category
control and first viewport")`:

- Mobile select end-to-end at 375/390/414px: visible, default `all`,
  desktop chips absent, selecting `Transport` updates the list/counter,
  reverting to `Wszystkie` works, no horizontal scroll.
- Desktop: chip row visible and functional, mobile select present in the
  DOM but hidden (CSS-only, not conditionally rendered), active chip class
  correct.
- First-viewport: at 390×844, if any alert card exists, its `boundingBox().y`
  must be `<= 780`; gracefully returns (no failure) when no alerts are
  published, matching the file's existing pattern for data-dependent
  assertions.

The pre-existing "category filters wrap … narrow mobile viewport" test
(Sprint 156B) was updated, not deleted — it now asserts the mobile select
is what's visible (with all seven options present) and that the desktop
chip buttons have zero count at that viewport, since asserting chip
visibility on mobile would directly contradict the behavior this follow-up
intentionally changed.

### QA results

- `npm run check` — ✅ zero errors, zero warnings, build succeeds (22 routes).
- `npm run test:e2e` — ✅ **429/429 passing**, 0 failed, 0 flaky (up from
  424 total before this follow-up: +5 new tests, 1 existing test updated
  in place). No known regressions.
- `git diff --check` — clean, no whitespace errors.

### No Production impact

Same as the parent sprint: zero changes to Supabase schema, RLS, env vars,
Vercel config, or cron. All changes are in `src/app/page.tsx`,
`src/components/AlertList.tsx`, `src/components/BetaStatusCard.tsx`,
`tests/e2e/public.spec.ts`, and this doc. No new dependencies.

## Recommended next step

**Sprint 158B — Installable PWA Foundation.** Not started; awaiting Adam's
decision.
