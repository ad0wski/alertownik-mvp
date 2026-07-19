# Sprint 164B — Canary Rollback & Kill-Switch Runbook

**Audience:** Adam. Every action below is reversible by removing an environment variable — none requires a code change, a deploy, or SQL, unless explicitly noted.

---

## Immediate kill switch (fastest — seconds, no deploy)

If anything about automatic candidate creation looks wrong, in Vercel's dashboard:

1. Delete (or set to anything other than the literal string `true`) the **`SCHEDULED_WRITES_ENABLED`** environment variable, on whichever environment (Preview/Production) is misbehaving.
2. This alone stops every future invocation of `/api/cron/write-candidates` at Gate 2 (§5 of the main sprint doc) — it 503s before ever fetching a page, signing in, or touching the database. No redeploy is required for a Vercel environment variable change to take effect on the next invocation.
3. If you want to also stop the harmless dry-run routes, additionally clear `SCHEDULED_CHECKS_ENABLED`.

This is the single fastest way to stop everything. It does not undo anything already written (see below for that).

## Slower, more thorough disable

In addition to the immediate kill switch:

- Clear `CRON_SECRET` — every cron route (dry-run and write) starts returning `503 "Endpoint nieskonfigurowany"` regardless of the other switches.
- Clear `SUPABASE_SCHEDULED_WRITER_EMAIL` / `SUPABASE_SCHEDULED_WRITER_PASSWORD` — even if someone else re-enables `SCHEDULED_WRITES_ENABLED`, the writer can never sign in.
- If you want to remove the technical account's *database* privilege (not just the app-level credential), remove its row from `public.automation_identities` — write a short, reviewed `DELETE ... WHERE user_id = '<uuid>'` statement, run it manually yourself (never via an automated tool), and keep the deleted row's value somewhere safe in case you need to re-add it. **This is the only step in this document that touches the database, and it is optional/defense-in-depth, not required for the app-level kill switch to work.**

## Confirming a duplicate was not created

After any canary run (manual or scheduled):

1. Open `/admin/queue`, filter or scan for candidates from `michalowice-komunikaty`.
2. Compare the count and timestamps against the run's own JSON response (`candidatesInserted`) — they must match exactly.
3. If you suspect a duplicate slipped through despite the fuzzy dedup (§2.4 of the main doc — it is deliberately conservative, not a guaranteed-unique constraint), read the two candidates' `raw_text` side by side. The existing "ambiguous" classification band exists specifically so a near-duplicate is never silently auto-inserted — if you see two genuinely identical notices as separate `pending` rows, this is the known, documented gap the Sprint 150 migration (still proposed, not applied — `docs/sql/PROPOSED_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql`) would close. Manually archive the extra one from the queue; this is a normal admin action, not an emergency.

## Confirming no alert was automatically published

1. Check `/admin`'s alert counts (draft/published/archived) before and after any canary run — the automation touches none of them.
2. As a structural guarantee, not just an observation: `tests/e2e/scheduledWriterRoute.spec.ts`'s static-import audit fails the build if `write-candidates/route.ts` or `scheduledWriter.ts` ever comes to import any alert-publishing, Builder/draft, or candidate-approval helper. Re-running `npm run test:e2e` after any future change to those files re-proves this guarantee.
3. If you ever see a new row in `alerts` you did not create yourself through the Kreator, treat this as a serious incident — it would mean the structural guarantee above was somehow bypassed, which is a bug report, not an expected outcome of anything in this sprint.

## Full rollback to "as if this sprint never activated anything"

1. Clear all five environment variables listed in the main sprint doc's §2.6 table, on every environment where you set them.
2. Confirm via the automation status panel (`/admin/sources`) that both switches show **wyłączone** again.
3. Any `pending` candidates already created remain in the queue — they are ordinary rows, review or archive them through the normal flow; rolling back the automation does not need to (and should not) touch them.
4. No code rollback is needed for any of the above — the kill switches are the actual safety mechanism, exactly as designed since Sprint 147.

## If you need to roll back the code itself

Only relevant if a genuine bug is found in the canary code (not a configuration issue, which the kill switches above already handle):

- This branch (`sprint-164b-safe-auto-candidate-canary-v1`) is not merged to `main` as of this sprint's completion — reverting is simply "do not merge it."
- If it has already been merged by the time you read this: `git revert` the merge commit on `main`, same as any other rollback in this codebase (see `docs/MVP_INCIDENT_AND_ROLLBACK_RUNBOOK_V1.md` for the general pattern this project already follows).
