# Sprint 151 — Production Smoke Test Runbook v1

**Status: PLAN PREPARED, NOT EXECUTED.** No Production test has been
run by this document. This runbook is for Adam to execute by hand,
after the code release (`docs/SPRINT_151_FIRST_DRY_RUN_CRON_RUNBOOK_V1.md`
§1–3) and before any cron env is configured — it is the gate between
those two steps.

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
