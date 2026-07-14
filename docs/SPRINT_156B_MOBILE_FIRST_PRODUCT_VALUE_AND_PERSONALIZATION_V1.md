# Sprint 156B — Mobile-First Product Value and Personalization Polish v1

Executed 2026-07-14 on branch `sprint-156-mobile-first-product-polish-v1`,
base commit `a36de69` (Sprint 155 close). No Production, Vercel, env,
Supabase, SQL, RLS, cron, or writer changes — UI/UX polish only.

## 1. Real-device smoke (input to this sprint)

Adam ran the Sprint 154 checklist on **iPhone Safari**.

**Technical result: PASS ✅** — no unwanted horizontal scroll, readable
text, working search/filters/alerts/odpady/feedback mailto,
add-to-home-screen worked, correct app icon.

**First impression: 7/10.** UX problems found on the real device:

1. First viewport dominated by long info text + the "STATUS PILOTAŻU" card.
2. User had to scroll before seeing actual alerts.
3. Product explained itself before showing value.
4. Local personalization wasn't a central/discoverable part of the experience.
5. "Moje alerty" toggle didn't clearly communicate it's an area filter.
6. Category filters scrolled horizontally with no visible affordance
   that more categories existed off-screen.
7. `/odpady` showed too much text before the actual locality/next-pickup/waste-type data.
8. Mobile header's last item looked cramped at narrow widths.

## 2. Homepage changes (value-first)

- **Hero** (`src/app/page.tsx`) shortened to two short sentences. Removed
  the illustrative category-chip row and the "60 seconds" explainer link
  from the hero (category filter buttons already show every category;
  `/about` still has the longer explainer). Kept the covered-area phrase
  ("Komorowa, Pruszkowa i okolic") and the tester-interest link.
- **Status card** (`src/components/BetaStatusCard.tsx`) compacted from a
  5-bullet list to two lines: a one-line status summary linking to
  `/about` (which still documents manual publish, AI-never-auto-publishes,
  and source precedence — nothing removed, just not repeated on first
  paint) plus the independence disclaimer, kept verbatim since it's
  asserted directly on the homepage by an existing test.
- Spacing/padding tightened throughout the homepage's top section
  (hero, status card, mode toggle, locality strip, search, category
  filters) so that at a 390×844 mobile viewport the visitor sees: the
  product name, the short hero sentence, the locality-setting option,
  the active/upcoming alert count, and the top of the first alert card
  — without scrolling. Verified visually via a local Playwright
  screenshot (not committed) at 375×812 and 390×844.

## 3. Personalization (non-blocking)

- Added a compact locality quick-pick (`src/components/AlertList.tsx`):
  "Ustaw swoją okolicę, aby widzieć tylko alerty, które mogą Cię
  dotyczyć." + "Ustaw moją okolicę" button. Clicking reveals
  `PILOT_LOCALITIES` (`src/lib/officialSourceChecklist.ts`) as tappable
  chips — no exact address, no login, no new backend. Selecting a
  locality reuses the existing `savePreferences`/`saveMode` mechanism
  (same `localStorage` keys/shape as before) and switches to "Moja
  okolica" mode. Once set, shows "Twoja okolica: {value}" with a
  "Zmień" link back to the chip picker.
- Skipping this entirely leaves the app exactly as before — the full
  alert list is never hidden behind it.
- Merged this strip and the existing "co sprawdzić teraz" status box
  into one shared card (divided by a hairline) purely to save vertical
  space on mobile — no information removed.
- Renamed the "Moje alerty" toggle button and `PreferencesSection`
  panel heading to **"Moja okolica"**, matching the label already used
  everywhere else in the app for this exact same location filter
  (`AreaPreferenceBar`, `PreferencesSection`'s own field label, the
  `/odpady` locality-filter toggle). Updated every other user-facing
  reference to the old label (`src/app/about/page.tsx`,
  `src/app/odpady/page.tsx`, `src/app/prywatnosc/page.tsx`,
  `src/components/AreaPreferenceBar.tsx`) plus docs
  (`README.md`, `CLAUDE.md`, `docs/LIMITATIONS.md`,
  `docs/PILOT_READINESS_CHECKLIST.md`, `docs/AUTOMATED_CHECKS.md`).
  `docs/QA_MANUAL_CHECKLIST.md`'s historical run record was annotated
  rather than rewritten (it quotes the label as it existed at the time
  that QA pass was run). No internal data model, localStorage key, or
  filter logic changed — this is a label/consistency fix only.

## 4. Category filters

`src/components/AlertList.tsx`: the mobile-only horizontal-scroll
container (which hid categories off-screen with no visible scroll
affordance) was replaced with `flex flex-wrap`, applied at all screen
sizes. All 7 category buttons are now always visible and tappable,
wrapping onto 2 rows at typical mobile widths. Active-state styling,
filtering logic, and desktop keyboard/click behavior are unchanged.

## 5. Waste page (`/odpady`) hierarchy

`src/app/odpady/page.tsx`: the long intro paragraph (4 sentences) was
cut to one short sentence: "Najbliższe terminy odbioru odpadów dla
Twojej okolicy — ręcznie przepisane z oficjalnych harmonogramów, zawsze
z linkiem do źródła." The Komorów/2026-schedule detail that used to be
in that paragraph was relocated (not deleted) into the existing "Jak to
ma działać" bullet list, further down the page. `OdpadyClient`'s
existing order (locality picker → next-collection card → upcoming
terms) was already correct and needed no structural change — it now
follows directly after one short sentence instead of a long paragraph.
All disclaimers, official source links, and the independence statement
are unchanged, just further down the page as intended.

## 6. Mobile header

`src/components/AppHeader.tsx`: added a mobile-only compact link style
(`px-2 py-1.5 text-xs` vs desktop's `px-3 py-1.5 text-sm`) for the three
public nav links, recovering enough width that all three fit at 375px
without a horizontal-scroll fallback. Desktop nav classes/behavior
unchanged.

## 7. Tests

- Updated `tests/e2e/feedbackMailto.spec.ts`/`public.spec.ts` label
  references (from Sprint 155, unaffected here) plus:
- Renamed the "Moje alerty" toggle test to "Moja okolica" (`exact: true`
  to disambiguate from the new "Ustaw moją okolicę" button).
- Added `tests/e2e/public.spec.ts` coverage for: short hero + covered
  area, compact status card (independence line + link to `/about`
  preserved), alert list visible with no blocking modal on first load,
  locality quick-pick CTA visible without login/address, selecting a
  PILOT_LOCALITIES chip saves the preference and switches mode
  (verified via direct `localStorage` read), changing an already-set
  locality, category filters all visible + no horizontal overflow at
  375px, mobile header at 375/390/414px with no page-level horizontal
  scroll, and `/odpady` hierarchy (locality/next-collection appear
  before "Jak to ma działać", one-sentence intro, no info/sources lost).
- No existing test was weakened, skipped, or deleted.

## 8. QA results

- `npm run check` (typecheck + lint + build) — ✅ zero errors, zero warnings.
- `npm run test:e2e` — ✅ **409/409 passed**, 0 failed, 0 skipped, 0 flaky
  (after one iteration: an added waste-hierarchy test initially matched
  the wrong "Moja okolica" element, since that literal text also
  appears in an unrelated `WasteScheduleSection` filter button; fixed by
  anchoring on the unique "Najbliższy odbiór" heading instead).
- `git diff --check` — ✅ no whitespace errors.
- `npm run build` — ✅ succeeds (one transient Google Fonts network
  fetch failure was observed and confirmed unrelated to this sprint's
  changes by reproducing it against the unmodified base commit too).

## 9. Mobile browser QA (375/390/414 + desktop)

Automated via Playwright rather than manual screenshots:

- **375×812, 390×844, 414×896** — mobile header shows all three public
  links with no page-level horizontal scroll (automated test, all 3
  widths pass).
- **375×812** — category filters all visible, no hidden horizontal
  overflow on the filter row (automated test).
- **390×844 and 375×812** — visually verified via local Playwright
  screenshots (not committed to the repo) that the homepage's first
  viewport shows: product name, short hero, locality CTA, alert count,
  and the top edge of the first alert card, without scrolling; and that
  `/odpady`'s first viewport shows title → one-sentence intro → locality
  picker → next-collection card, before any longer info section.
- **Desktop** — the full 409-test suite runs against Playwright's
  default "Desktop Chrome" project (roughly 1280×720), so the entire
  existing regression suite doubles as desktop smoke; zero regressions.

No Production deploy was performed or required for this verification.

## 10. Security

- No new secrets in the diff (checked for `service_role`,
  `CRON_SECRET`, API-key/password-shaped strings — none).
- `.env.local` not tracked; no `.vscode/` staged.
- No Vercel, Supabase, RLS, SQL, cron, or Production changes.
- No live database write performed.

## 11. Documentation updated

- This file (new).
- `docs/SPRINT_154_PUBLIC_BETA_GO_NO_GO_V1.md` — real-device smoke and
  beta-status-prominence items marked resolved; locality-quick-select
  deferred item marked done; verdict section updated with a pointer
  to this sprint.
- `README.md`, `CLAUDE.md`, `docs/LIMITATIONS.md`,
  `docs/PILOT_READINESS_CHECKLIST.md`, `docs/AUTOMATED_CHECKS.md` —
  "Moje alerty" → "Moja okolica" label references updated.
- `docs/QA_MANUAL_CHECKLIST.md` — historical run record annotated
  (not rewritten) to note the rename.
- Obsidian `Sprint Log.md` — new Sprint 156B entry appended in the
  existing format (see that vault for the canonical planning record).

## 12. Honest project map (as of this sprint)

**DONE:** Privacy controller identity (Sprint 155), real-device smoke +
its UX findings (this sprint), homepage value-first restructuring,
non-blocking locality personalization, category-filter discoverability,
waste-page hierarchy, mobile header fit at 375/390/414px.

**REMAINING before public (not recruited-pilot) beta:** full
admin-workflow QA pass with a real/test session, the data-freshness
judgment call on the open-ended WKD alert, final legal wording
verification of `/prywatnosc`, and the Sprint 153 cron observation
window (separate track, not a beta blocker unless it surfaces a
problem).

**Honest rough percentages** (directional, not precise):

- Infrastructure/automation: ~85%
- Core MVP completeness: ~85–90%
- Public-beta readiness: ~70–75% (two of the four Sprint 154 gates now
  closed: privacy identity, real-device check)
- User-facing product readiness: ~70% (mobile-first polish applied;
  content coverage still thin — 2 of 6 advertised categories have live
  data)
- Installable PWA readiness: not reassessed this sprint
- App-store readiness: ~5–10%
- Monetization: ~5–10%

Not claiming public beta is "released" — this sprint closes UX/product
gaps found by real-device testing, it does not perform or approve a
Production deploy.

## 13. Recommended next step

**Sprint 156C — Public Beta Final Operational Gates**: full
admin-workflow QA, open-ended WKD alert review, final legal wording
verification, cron observation closure, final go/no-go. Not started —
requires Adam's separate go-ahead.
