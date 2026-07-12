# Sprint 150D — Fingerprint Preview Activation Runbook v1

**Status: PLAN PREPARED, NOT EXECUTED.** No Vercel environment variable
has been set or changed for this. No flag is on. No live write has been
made beyond the one already verified in Sprint 148. This document exists
so that, WHEN Adam decides to activate the fingerprint in Preview, every
step is already reviewed, ordered, and reversible — not so that it
happens automatically.

---

## 1. Current state (2026-07-12)

- Race-condition migration: **APPLIED AND VERIFIED** — see
  `docs/SPRINT_150_RACE_CONDITION_DEPLOYMENT_RUNBOOK_V1.md`.
  `source_notice_candidates.content_fingerprint` (nullable `text`) exists;
  the partial unique index
  `source_notice_candidates_writer_fingerprint_uniq` exists, confirmed
  genuinely `UNIQUE` and genuinely partial.
- `SCHEDULED_WRITER_FINGERPRINT_ENABLED` — **not set anywhere** (defaults
  to OFF; `isContentFingerprintEnabled()` in `src/lib/scheduledWriter.ts`
  requires the literal string `"true"`).
- `SCHEDULED_WRITES_ENABLED` — **`false`/unset in Preview** (turned off
  at the close of the Sprint 148 controlled test, per that runbook's Step
  9 checklist).
- `SCHEDULED_CHECKS_ENABLED` — status not re-verified this session; check
  the Vercel dashboard before assuming either value.
- No Vercel Cron, no `vercel.json` schedule, no external scheduler
  pointed at either cron route — confirmed by repo audit (no such file
  exists).
- Production: untouched by any Sprint 147–150 work.

## 2. Target branch for this activation

```
sprint-150-race-condition-closure-package-v1
```

## 3. ⚠️ Critical warning — do not assume env vars carry over

The Sprint 148 controlled-write-test environment variables (email,
password, `CRON_SECRET`, `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS`, the two
kill switches) were configured in Vercel **scoped to the
`sprint-148-controlled-writer-preview` branch's Preview deployments**
(per `docs/SPRINT_148_VERCEL_PREVIEW_ENV_BLOCK_V1.md` Step 5–6 and the
runbook's own env table). Vercel Preview environment variables can be
scoped either to "all Preview deployments" or to specific branches,
depending on how each variable was originally added.

**Do not assume any of the Sprint 148 variables are visible to Preview
deployments of `sprint-150-race-condition-closure-package-v1`.** Adam
must check the Vercel dashboard directly (Project Settings →
Environment Variables → filter by branch) and either:
- confirm the existing variables already apply to "All Preview" scope, or
- re-add each one, explicitly scoped to (or including) this branch.

Do not proceed to Phase A below until this has been confirmed in the
Vercel UI — a missing variable fails closed (the route returns a generic
503, per `src/app/api/cron/write-candidates/route.ts`), so the failure
mode is safe, but it will look like "the flag doesn't work" if this step
is skipped.

## 4. Full list of environment variables the code actually reads

(Confirmed by reading `src/lib/scheduledWriter.ts`,
`src/lib/cronCheckSources.ts`, and
`src/app/api/cron/write-candidates/route.ts` directly — not guessed.)

| Variable | Required? | Purpose | Safe default if unset |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (existing) | Supabase project URL, used by `signInScheduledWriter` | N/A — already set in every environment |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes (existing) | Supabase anon key, used by `signInScheduledWriter` | N/A — already set in every environment |
| `SUPABASE_SCHEDULED_WRITER_EMAIL` | Yes | Technical writer account email | Missing → route returns 503, no sign-in attempted |
| `SUPABASE_SCHEDULED_WRITER_PASSWORD` | Yes | Technical writer account password | Missing → route returns 503 |
| `CRON_SECRET` | Yes | Bearer-token auth for both cron routes (`checkCronAuth`) | Missing → route returns 503 ("not_configured") |
| `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` | Recommended | JSON map `sourceKey → alert_sources.id`, used to log `source_checks` rows and widen dedup matching | Missing → `getRegistrySourceId` returns null; candidate insert still works (its own `source_id` is nullable), but no `source_checks` row is logged |
| `SCHEDULED_CHECKS_ENABLED` | Yes (kill switch 1) | Must be literal `"true"` | Anything else → route returns 503 |
| `SCHEDULED_WRITES_ENABLED` | Yes (kill switch 2) | Must be literal `"true"` | Anything else → route returns 503 |
| `SCHEDULED_WRITER_FINGERPRINT_ENABLED` | **New, this activation** | Must be literal `"true"` for `content_fingerprint` to be computed and sent on insert | Anything else (including unset) → column is never sent, identical to pre-Sprint-150 behavior |
| `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` | Optional | JSON array narrowing which sources the WRITE route may touch | Unset → defaults to `["michalowice-komunikaty"]` only, **never** WKD |
| `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN` | Optional | Caps candidates inserted per invocation | Unset → defaults to `1` |

No value here is a secret except `SUPABASE_SCHEDULED_WRITER_PASSWORD` and
`CRON_SECRET` — this table names the variables, never their values. No
value is ever set for these in Production by this runbook.

**Also required, but not an application env var:** a Vercel **Protection
Bypass for Automation** secret, sent as the `x-vercel-protection-bypass`
header, distinct from `CRON_SECRET` — required because Preview
deployments are authenticated by default (discovered during the Sprint
148 controlled test, see `docs/SPRINT_148_CONTROLLED_WRITE_TEST_RUNBOOK_V1.md`).

## 5. Safe activation plan

### FAZA A — configure, deploy, inspect only (no write)

1. In Vercel, confirm/re-add all variables from §4 for Preview
   deployments of `sprint-150-race-condition-closure-package-v1`
   (per the §3 warning).
2. Set `SCHEDULED_WRITER_FINGERPRINT_ENABLED=true`.
3. Set (or confirm) `SCHEDULED_WRITES_ENABLED=false` — **writes stay off
   in this phase**; only the flag and the migration's presence are being
   validated.
4. Trigger a new Preview deployment so the env changes take effect.
5. Verify the deployment is Ready in the Vercel dashboard.
6. No request is made in this phase. This phase exists purely to let the
   flag and migration coexist in a live deployment before any write is
   attempted — confirms the deployment builds and starts cleanly with
   the new variable present.

### FAZA B — one controlled write, Michałowice only

1. Only after Phase A's deployment is confirmed Ready, set
   `SCHEDULED_WRITES_ENABLED=true`.
2. Trigger another Preview deployment.
3. Make **exactly one** manual HTTP request to
   `/api/cron/write-candidates?sourceKey=michalowice-komunikaty` — never
   a bare call (would also attempt WKD), never looped, never scheduled.
   Use `scripts/invoke-sprint-150-fingerprint-preview-test.ps1` (§6
   below) — it hardcodes the source key and refuses any other value.
4. Expected honest outcomes: `candidatesInserted` 0 or 1 (0 is valid —
   see §7's note on deduplication), `published: false` always.
5. `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` is not set for this test, so the
   code-level default (`["michalowice-komunikaty"]`) already excludes
   WKD independently of the query parameter — belt-and-suspenders,
   confirmed in `src/lib/scheduledWriter.ts`.

### FAZA C — verify, then return to the safer resting state

1. Run `docs/sql/VERIFY_SPRINT_150_FINGERPRINT_CONTROLLED_TEST_SINGLE_RESULT_READ_ONLY_V1.sql`
   (SELECT-only) in the Supabase SQL Editor.
2. Set `SCHEDULED_WRITES_ENABLED=false` again (the safer resting state
   between tests, same principle as Sprint 148's own Step 9).
3. Trigger a final redeploy so the env change takes effect.
4. Remove the temporary Vercel Protection Bypass secret if it was
   created solely for this test (same recommendation Sprint 148 made —
   Adam's call, not a blocker).

## 6. What this runbook does NOT authorize

- Any Production change.
- Any Vercel Cron activation, `vercel.json` schedule, or external
  scheduler.
- Including WKD in any write-mode call.
- Autopublish, draft creation, or any `alerts` table write.
- Leaving `SCHEDULED_WRITES_ENABLED=true` after the one controlled test
  in Phase B.

## 7. Honest limitation of the controlled test

If the Michałowice source has no genuinely new content at test time (or
the in-memory fuzzy classifier or the database's own unique index
correctly rejects a duplicate), the controlled call may legitimately
insert **zero** new candidates. That is not a failure of the route or
the fingerprint mechanism — it confirms the route ran and the dedup path
worked, but it does **not** by itself confirm a fresh row was ever
written with a populated `content_fingerprint` in the expected SHA-256
format. If Adam needs that second, stronger confirmation, a retry at a
later time (when the source has new content) may be required — do not
manufacture a fake candidate to force a green check.

## 8. Related

`docs/SPRINT_150_RACE_CONDITION_DEPLOYMENT_RUNBOOK_V1.md` (schema
migration, already applied) · `docs/SPRINT_148_CONTROLLED_WRITE_TEST_RUNBOOK_V1.md`
(the first live write, same Protection Bypass mechanism) ·
`docs/SPRINT_148_VERCEL_PREVIEW_ENV_BLOCK_V1.md` (original env var table,
different branch scope — see §3 warning above) ·
`docs/SCHEDULED_WRITER_FOUNDATION_V1.md`.
