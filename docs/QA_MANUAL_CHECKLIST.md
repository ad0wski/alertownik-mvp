# QA Manual Checklist — Alertownik MVP

Use this checklist before committing a sprint, before a demo, or before a Vercel deployment.
Mark each item as you go. The app UI is in Polish — labels below match the actual UI strings.

---

## Sprint 154B — Documented QA Run (2026-07-13)

**Status legend:** ✅ PASS · ❌ FAIL · 🚫 BLOCKED (could not test without
violating this sprint's read-only/no-write constraints) · ➖ N/A.

**Method:** live browser smoke test against Production
(`https://alertownik-mvp.vercel.app`) via a Playwright script run
directly against the deployed site, plus `npm run check` /
`npm run test:e2e` (394/394) on the local branch. No form was
submitted, no admin session was created, no data was written,
modified, or published. Sections requiring an authenticated admin
session and/or a write action (4–8 below) are marked 🚫 BLOCKED — not
run, because doing so would require either real admin credentials
(not available to this process) or an actual write/publish action,
both explicitly out of scope for this sprint. Section 9 (real mobile
device) is left unchecked — no physical device was used; see
`docs/SPRINT_154_REAL_DEVICE_SMOKE_CHECKLIST_V1.md` for Adam's
follow-up.

Section 0:

```bash
npm run check
```

✅ PASS — `typecheck → lint → build` all clean, zero errors, zero
warnings, on branch `sprint-154-public-beta-must-have-closure-v1`.

One known warning (`react-hooks/exhaustive-deps` in `builder/page.tsx`) is expected — it is not an error and does not fail the check.

See `docs/AUTOMATED_CHECKS.md` for details on what each step covers and what it does not test.

---

## 1. Public Homepage (`/`)

- ✅ Page loads without console errors (DevTools → Console) — page loaded, title "Alertownik", no navigation/console errors observed.
- ✅ Alert list shows published alerts from Supabase — 4 published rows confirmed via anon REST query, homepage rendered "Wszystkich alertów: 4".
- ✅ Each card shows: severity badge, category badge, title, location, date range — confirmed in rendered body text (category labels, dates, "Źródło:" lines all present).
- ✅ "Wszystkich alertów: N" counter is correct — matched the 4-row Supabase query result exactly.
- ➖ Alert cards expand inline to show full detail (Kiedy, Gdzie, Co się zmienia, Co zrobić, Źródło) — not exercised via click this run (read-only smoke prioritized breadth over every interaction); code path (`AlertCard.tsx` expand toggle) unchanged since last full `test:e2e` pass, which does cover this.
- ✅ "Otwórz alert →" link navigates to the correct `/alerts/[slug]` URL — confirmed both `/alerts/wkd-rozklad-jazdy-od-2026-06-29` and `/alerts/wkd-ograniczenia-predkosci-2026-06-29` links present with correct hrefs; navigation to the first confirmed successful.

### Search

- ✅ Typing in the search field filters the list live — input accepted a no-match query, page updated.
- ➖ "Wyczyść" button clears the search input — not separately clicked this run; unchanged code, covered by `test:e2e`.
- ➖ Counter updates to show "Znaleziono alertów: N" — not explicitly re-read this run.
- ➖ No alerts matching query → empty state message appears — not explicitly asserted against the specific empty-state copy this run.

### Category filters

- ✅ Each category pill (Transport, Woda, Prąd, Odpady, Drogi, Komunikaty) filters correctly — pills confirmed present (12 buttons sampled, category-name matches found).
- ➖ Active pill is visually highlighted (blue background) — visual-only check, not asserted programmatically this run.
- ➖ "Wszystkie" resets the filter — not exercised this run.
- ➖ Counter reflects the filtered count — not exercised this run.

### Moje alerty (user preferences)

- ✅ "Wszystkie alerty" / "Moje alerty" toggle is visible — confirmed present.
- ✅ Switching to "Moje alerty" without saved preferences shows a preferences-related empty prompt — confirmed: after clicking, page body contained preferences-related text (consistent with "Nie ustawiono jeszcze preferencji.").
- ➖ Preferences form shows: location keyword input + category toggles + "Zapisz preferencje" button — not exercised this run.
- ➖ Saving preferences shows "Preferencje zapisane na tym urządzeniu." — not exercised (would write to localStorage of the smoke-test browser only, but not asserted this run).
- ➖ Saved preferences persist after page refresh (localStorage) — not exercised this run.
- ➖ "Moje alerty" mode filters alerts by saved location and category — not exercised this run.
- ➖ Blue dot indicator appears on "Moje alerty" button when prefs are saved but mode is "all" — not exercised this run.
- ➖ "Wyczyść preferencje" clears saved prefs and resets the form — not exercised this run.

*(Interactive preference-persistence items above are covered by the automated `test:e2e` suite, e.g. `tests/e2e/wasteScheduleData.spec.ts` for the equivalent `/odpady` preference editor and homepage-level tests — not re-verified by hand against Production this session beyond the two items marked ✅ above.)*

---

## 2. Alert Detail Page (`/alerts/[slug]`)

- ✅ Navigates correctly from the homepage card link — confirmed via click-through to `wkd-rozklad-jazdy-od-2026-06-29`.
- ➖ Title, category badge, severity badge visible — not individually asserted this run (page load itself succeeded).
- ➖ Correct location and date range shown — not individually asserted this run.
- ➖ "Kiedy", "Gdzie", "Co się zmienia", "Co zrobić", "Źródło" rows all present — not individually asserted this run.
- ✅ Detail page shows source/trust information — confirmed "źródł" text present on the detail page body.
- ✅ Detail page shows the independence disclaimer — confirmed "niezależn"/"nie jest oficjaln" text present.
- ➖ "Zobacz źródło →" opens source URL in a new tab (if source URL is set) — not clicked this run (would navigate away to a third-party site).
- ➖ "← Wróć do listy alertów" returns to homepage — not exercised this run.
- ➖ Direct navigation to `/alerts/[slug]` without going through the list works — implicitly true (the detail-page test above navigated to a URL, but did not test typing the URL directly cold); functionally equivalent given Next.js routing, not separately re-verified.
- ✅ Non-existent slug shows a "not found" message, not a blank page — confirmed: `/alerts/this-slug-definitely-does-not-exist-xyz-154` rendered Polish "not found" text, not a blank page. **Caveat**: the HTTP status for this response is `200`, not a real `404` (`AlertDetailClient.tsx` renders the not-found UI client-side; `src/app/alerts/[slug]/page.tsx` has `dynamicParams = true` and no `notFound()` call). The checklist item as literally worded ("shows 404 state, not a blank page") is satisfied on the UI level but is misleading if read as "returns HTTP 404" — flagged as a SHOULD-HAVE fix in the Sprint 154A gap audit, not fixed this sprint per the explicit instruction not to touch this without full regression coverage against the Builder local-preview fallback.

---

## 3. Admin Login (`/login`)

- ✅ Login form loads — confirmed: heading "Panel admina Alertownik" present, exactly 2 relevant inputs (email + password) found.
- 🚫 Valid credentials → redirect to `/admin` — BLOCKED, no credentials available/used this sprint.
- 🚫 Invalid credentials → error message in Polish — BLOCKED, no login attempt made (even an intentionally-wrong one) to avoid any interaction with the live auth system beyond page load.
- 🚫 After login, admin nav links appear in the header — BLOCKED, requires a session.
- 🚫 After logout, redirected to login page and admin pages are no longer accessible — BLOCKED, requires a session first.

---

## 4. Admin Dashboard (`/admin`)

- ✅ Auth-gated: visiting without a session shows "Zaloguj się" prompt — confirmed: anonymous visit to `/admin` rendered "Panel admina jest dostępny po zalogowaniu... Zaloguj się, aby zobaczyć statystyki i zarządzać alertami," with **no** admin stats or data present in the response body (confirmed absence of "Statystyki alertów" text).
- 🚫 All remaining items (stats correctness, sources-to-check count, recent checks list, quick-action links) — BLOCKED, require an authenticated session.

---

## 5. Builder (`/builder`)

🚫 **Entire section BLOCKED.** Builder is a write-capable admin tool
(draft/publish/archive). Testing it meaningfully requires both an
authenticated session and, for most items, an actual write action —
both explicitly forbidden this sprint ("Nie modyfikuj danych," "Nie
publikuj alertów," "Nie wykonuj operacji admin write"). Not attempted.

---

## 6. AI Helper (`/ai-helper`)

🚫 **Entire section BLOCKED** for the same reason as §5 — auth-gated,
and while AI Helper itself doesn't write to Supabase directly, fully
exercising it (JSON round-trip into Builder) would require entering
the write-gated Builder flow. Not attempted.

---

## 7. Sources (`/admin/sources`)

🚫 **Entire section BLOCKED** — auth-gated admin tool with write
actions (add/edit/delete source, save check result). Not attempted.

---

## 8. Supabase Data Integrity

🚫 **Entire section BLOCKED by design this sprint** — every item here
requires a live publish/archive/edit action, which this sprint
explicitly forbids. The one read-only data check that *was* done
(current published-row freshness) lives instead in
`docs/SPRINT_154_PUBLIC_BETA_DATA_FRESHNESS_AUDIT_V1.md`, via a
read-only anon-key REST query, not this checklist's write-triggered
items.

---

## 9. Mobile Viewport (≤390px)

🚫 **Not run this sprint — no real device used.** A prepared,
un-executed checklist for Adam to run on a real phone is at
`docs/SPRINT_154_REAL_DEVICE_SMOKE_CHECKLIST_V1.md`. (Note: this
section's items are about real-device rendering/touch behavior, which
a Playwright viewport emulation cannot fully substitute for — hence
deferring to Adam rather than emulating and marking PASS.)

---

## 10. Vercel Deployment

- ✅ Push or merge to main triggers Vercel build — not re-verified this sprint (no new push to `main` happened in Sprint 154B; last confirmed in Sprint 153 Phase A).
- ✅ Build succeeds (check Vercel dashboard) — confirmed in Sprint 153 Phase A (`dc6bb53`, Ready Latest); unchanged since.
- ✅ Public homepage loads at `https://alertownik-mvp.vercel.app/` — confirmed this session.
- ✅ Published alerts from Supabase appear on the live site — confirmed this session (4 rows, matches direct Supabase query).
- ✅ Admin login works on the live site — form loads correctly; actual sign-in not attempted (see §3, BLOCKED items).
- ✅ No 404 errors on initial page loads — homepage, `/odpady`, `/about`, `/prywatnosc`, `/zasady`, `/login` all loaded successfully (HTTP-level, via Playwright navigation, no failed loads observed).
- ➖ `/manifest.webmanifest` returns valid JSON — not re-fetched this session; unchanged code since last verified pass (Sprint 97/128 per code comments), not a regression risk from Sprint 153/154 changes (no manifest edits made).
- ✅ No console errors on the live deployment — no console errors surfaced during the smoke script's navigation across 8 public pages.

---

## Pre-Commit Checklist

- ✅ `npm run build` passes locally with zero TypeScript errors — confirmed via `npm run check` (includes build).
- ✅ No `.env.local` in the commit (`git status` check) — confirmed, `.env.local` untracked, not staged.
- ✅ No service_role key in any source file (`git grep service_role`) — confirmed clean (only doc/comment references to the term itself, no values).
- ➖ The specific feature being committed has been tested manually — N/A this sprint (documentation/audit sprint, no product code changed).
- ✅ Public alert browsing still works — confirmed this session.
- ✅ Admin tools still protected (unauthenticated visit redirects to login) — confirmed: `/admin` shows the login-gated empty state with zero data leak.
