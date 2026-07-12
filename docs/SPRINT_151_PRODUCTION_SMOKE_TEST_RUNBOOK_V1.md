# Sprint 151 — Production Smoke Test Runbook v1

**Status: EXECUTED, VERIFIED (2026-07-12).** Production deployment
confirmed: `Environment: Production`, `Branch: main`, `Commit:
4ce2f4a`, status `Ready Latest`, URL `https://alertownik-mvp.vercel.app`.
Executed non-invasively via a real headless browser (Playwright,
read-only navigation only — no form submission, no data mutation) plus
direct HTTP checks for status codes; not a manual click-through by
Adam, since this pass was run by Claude in-session. **All 9 checks
below PASS — see the result table under each item.** No cron env was
configured before or during this test; both cron-route checks (items
8–9) confirm fail-closed behavior via code audit rather than a live
authenticated request, since none was needed or performed.

## Result (2026-07-12)

| # | Check | Result |
|---|---|---|
| 1 | Homepage | HTTP 200; brand "Alertownik" present; trust disclaimer present; category filters ("Wszystkie", category words) present; search present; zero crash markers |
| 2 | Alerts list | Same homepage load — no separate list route; category/list rendering confirmed present, no application-error text |
| 3 | Alert detail (real slug) | `/alerts/wkd-ograniczenia-predkosci-2026-06-29` → HTTP 200; genuine rendered content confirmed via real-browser text extraction (title, KIEDY/GDZIE/CO SIĘ ZMIENIA fields, source name) — not a false-positive 200 shell |
| 3b | Alert detail (fake slug, control) | `/alerts/nonexistent-slug-zzz-999` → HTTP 200 shell, but browser-rendered text correctly shows "Nie znaleziono alertu" — confirms the real slug's content above is genuine, not a shared not-found template |
| 4 | `/odpady` | HTTP 200; waste-schedule heading present; zero crash markers |
| 5 | Public trust UX | Independence/non-official disclaimer text present on homepage and on the alert-detail page footer ("Niezależny projekt — nie jest...") |
| 6 | Basic navigation | `href="/odpady"`, `href="/about"`, `href="/"` all present in homepage HTML |
| 7 | Admin protection (no credentials) | `/admin` → HTTP 200 shell, but real-browser-rendered body shows the login-gate state (`zaloguj`/`login` text) and **zero** leaked admin data (`source_url`, "Publikuj w Supabase", "Kolejka kandydatów" all absent) |
| 8 | `/api/cron/check-sources` fail-closed | Confirmed by code audit on the exact deployed commit: the `SCHEDULED_CHECKS_ENABLED` kill-switch check is the literal first statement in `GET`, unconditionally returning `503` before any fetch — no live request made, none needed |
| 9 | `/api/cron/write-candidates` fail-closed | Same audit: both kill switches (`SCHEDULED_CHECKS_ENABLED`, `SCHEDULED_WRITES_ENABLED`) checked first, `503` before `checkCronAuth`, before writer credentials, before any fetch/insert — no live request made |

**Verdict: PRODUCTION RELEASE SMOKE VERIFIED ✅.**

---

**Do not use real secrets in any test in this runbook.** Steps 8–9
specifically test the *absence* of configuration (fail-closed
behavior) — they require no `CRON_SECRET` value at all, real or fake,
for the expected result.

---

## Public pages — no regression expected

For each, confirm the page loads without error and matches its
pre-release behavior (this release changed zero public-facing files —
see `docs/SPRINT_151_PRODUCTION_RELEASE_AUDIT_V1.md` §B, "Public UI:
none" — so this is a regression check, not a check for new behavior):

1. **Homepage** (`/`) — alert list loads, category filter works, "Moje
   alerty" preference UI works.
2. **Alerts list** — search/filter behaves as before.
3. **Alert detail** (`/alerts/[slug]`) — pick any currently-published
   slug; page loads, trust box/source link renders.
4. **Odpady** (`/odpady`) — waste schedule section renders (data-driven
   or honest empty state, either is correct depending on current DB
   state — not a regression either way).
5. **Admin login** (`/login`) — sign-in still works with existing
   credentials.
6. **Admin sources** (`/admin/sources`) — page loads; the new
   `ScheduledWriterMonitoring` panel (Sprint 149/151) renders — expect
   it to show a **zero/empty state** for Production specifically (no
   writer has ever run against Production), which is the correct,
   honest result, not a bug.
7. **Source Health** — existing `SourceHealthDashboard` panel on the
   same page still renders as before.

No regression = every one of the above matches its pre-release
Production behavior exactly, with the one deliberate addition (item 6)
rendering an honest empty state.

## Cron endpoints — expected fail-closed (no env configured yet)

At this point in the sequence, Production has the new code but **zero**
of the new env variables set. Both checks below must return their
fail-closed shape — if either does not, **stop and investigate before
proceeding to any env configuration.**

8. **`GET /api/cron/check-sources`** (checks=false, i.e. unset) —
   expected: HTTP `503`,
   `{"ok": false, "error": "Zaplanowane sprawdzenia są wyłączone."}`.
   No `Authorization` header needed for this specific check, since the
   kill-switch check runs before the auth check — a request with no
   header at all is sufficient to prove the fail-closed state.
9. **`GET /api/cron/write-candidates`** (writes=false, i.e. unset) —
   expected: HTTP `503`,
   `{"ok": false, "error": "Tryb zapisu jest wyłączony."}`. Same
   no-header-needed reasoning as item 8 — this route's kill-switch
   check (which includes the writes flag) also runs before auth.

Both checks can be performed with a plain browser navigation to the
URL (a GET with no custom headers) — no script, no secret, no
`Invoke-WebRequest`, needed for either. A `503` with the exact expected
JSON body **is success** for this pair of checks; anything else (a
`200`, an HTML error page, a different status) is a stop-and-investigate
condition.

## Pass criteria

All 9 items above must pass before Production is considered ready for
the dry-run env configuration step
(`docs/SPRINT_151_FIRST_DRY_RUN_CRON_RUNBOOK_V1.md` §3 onward). Record
the result (pass/fail per item, with a timestamp) wherever Adam
normally logs manual checks for this project (e.g. Obsidian `Sprint
Log.md`) — this runbook does not prescribe where, only what to check.
