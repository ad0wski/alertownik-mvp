# Sprint 173 — Controlled Activation Checkpoint (read-only, documentation only)

**Status: planning document only. No activation step below has been
performed. No Environment Variable was changed. No cron was invoked. No
manual source check was run against Production.**

This document is the answer to "prepare the exact plan for the first
controlled scheduled-check run" — every item is a plan, not an action.
Each numbered step in §5 requires Adam's own separate, explicit approval
before being carried out; none are implied by this document existing.

---

## 1. Pre-existing state discovered during this session's Production check (important — read first)

While confirming safety flags for the Sprint 173 merge, a direct
unauthenticated `GET` against Production's cron endpoints revealed:

| Endpoint | Response | What it proves |
|---|---|---|
| `/api/cron/check-sources` | `401 Unauthorized` | `SCHEDULED_CHECKS_ENABLED` is **already `"true"`** on Production (a 503 "wyłączone" would show if it weren't) — this is a Sprint 152 resting-state artifact, documented at the time as "Adam's pending manual reset step," apparently never completed. **Not changed by this session — zero env var writes were made.** |
| `/api/cron/check-michalowice` | `401 Unauthorized` | Same as above |
| `/api/cron/write-candidates` | `503 "Tryb zapisu jest wyłączony."` | `SCHEDULED_WRITES_ENABLED` is confirmed **not** `"true"` — writing remains fully disabled |

**Practical impact: none.** `check-sources`/`check-michalowice` are
architecturally zero-write (no Supabase import at all, enforced by their
own static-import test) — even if Vercel's real daily cron
(`0 5 * * *` → `check-michalowice`) has been firing with the real
`CRON_SECRET` since Sprint 152, it cannot have written anything. This is
directly confirmed by this session's own before/after counter comparison
(§ merge report): every table is byte-identical.

**Recommendation for Adam, not acted on:** decide whether to finally
complete the Sprint 152 resting-state reset (`SCHEDULED_CHECKS_ENABLED`
back to unset/false) as a hygiene step, or leave it as-is since it's
provably inert without write mode. Either choice is safe; this document
takes no position beyond flagging it honestly.

## 2. Required Environment Variables for the first controlled write run

| Variable | Current state (Production) | Needed for controlled run? |
|---|---|---|
| `CRON_SECRET` | Configured (proven — 401 not 503 above) | Already set, no change needed |
| `SCHEDULED_CHECKS_ENABLED` | **Already `"true"`** | Already set (see §1) |
| `SCHEDULED_WRITES_ENABLED` | Not `"true"` | **Must be set to `"true"`** — the actual gate for this activation |
| `SUPABASE_SCHEDULED_WRITER_EMAIL` / `_PASSWORD` | Configured (per Sprint 166L-D) | Re-verify, don't assume — see checkpoint 1 in §7 |
| `SUPABASE_ENVIRONMENT_TAG` | Per Sprint 165B — state not re-checked this session | **Must verify this matches the running Vercel environment** — this is layer 0, checked first, cheapest, and blocks everything if mismatched |
| `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` | Not set (defaults to Michałowice only) | Only if widening beyond Michałowice — see §3 |

**Net new variable to actually change: `SCHEDULED_WRITES_ENABLED`.**
Everything else is either already configured or optional.

## 3. Which sources the first run should cover

**Recommendation: start with exactly one source — Michałowice
komunikaty — not all four**, even though this sprint's REST-API fix now
makes all four technically correct. Rationale: every previous controlled
write test in this project's history (Sprint 148's first live write,
Sprint 152's Production dry run) started with exactly one, already-proven
source before widening. `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` already
defaults to Michałowice-only — **no Environment Variable change is
needed for the FIRST run** if this recommendation is accepted; widening
to all 4 (`["michalowice-komunikaty","wkd-aktualnosci","wodociagi-michalowice","pruszkow-aktualnosci"]`)
would be a deliberate, separate second step, only after the first run is
reviewed and trusted.

If Adam instead wants all 4 sources covered from the first run, that
requires setting `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` to the JSON array
above — a decision to make explicitly, not a default this document
assumes.

## 4. Existing cron entry — does it need to change?

**No code or `vercel.json` change is required to prepare.** The existing
entry (`/api/cron/check-michalowice`, daily `0 5 * * *`) points at a
**dry-run** endpoint, not `write-candidates`. For a real controlled
*write* run, Adam has two options, to choose between at activation time
(not decided by this document):

- **Manual trigger first (recommended):** call `write-candidates`
  directly with the real `CRON_SECRET` (e.g. via `curl`, exactly like
  Sprint 152's Production dry-run precedent) — no `vercel.json` change at
  all, full manual control over timing, one single controlled invocation.
- **Real cron wiring (later, separate decision):** change `vercel.json`'s
  path from `check-michalowice` to `write-candidates` — this makes the
  write path fire automatically and unattended, and should only happen
  *after* at least one manually-triggered run has been reviewed and
  trusted, per the same step-by-step widening precedent as §3.

## 5. Plan for the first controlled run (manual-trigger option, per §4)

Every step below requires Adam's own separate, explicit approval:

1. Re-verify `SUPABASE_SCHEDULED_WRITER_EMAIL`/`_PASSWORD` are still
   valid and that account is still an `automation_identities` member
   (checkpoint 1, §7) — read-only, before touching any flag.
2. Re-verify `SUPABASE_ENVIRONMENT_TAG` correctly pairs with the running
   Vercel environment (layer 0) — read-only.
3. Set `SCHEDULED_WRITES_ENABLED=true` in Production's Environment
   Variables (Vercel dashboard).
4. Wait for the variable to propagate (Vercel functions read
   `process.env` fresh per invocation — typically near-instant, but worth
   a short pause and a confirming dry-run-endpoint check first).
5. Trigger exactly one manual `GET /api/cron/write-candidates` request
   with the real `Authorization: Bearer <CRON_SECRET>` header — no
   `?sourceKey=` filter needed (the server-side allowlist already
   restricts to Michałowice-only by default, per §3).
6. Read the JSON response directly — it already reports
   `checkedSources`, `successfulSources`, `failedSources`,
   `candidatesInserted`, `duplicatesSkipped`, `published: false` inline,
   no extra query needed for a first read.
7. Run checkpoint 2 (§7) — the read-only Supabase verification.
8. Set `SCHEDULED_WRITES_ENABLED` back to off (or leave on only if Adam
   explicitly wants standing manual-trigger capability going forward —
   a separate decision, not implied here).

## 6. Expected counter changes for exactly one controlled run

Assuming the recommended single-source (Michałowice) scope and that the
source currently has no new content (plausible — checked recently per
the dashboard: "dawno nie sprawdzane (>7 dni), Ostatni check: 12 lip
2026… znaleziono komunikat"):

| Table | Expected change |
|---|---|
| `scheduled_writer_runs` | **+1** (opened, then closed; `trigger: "manual"`; `outcome` likely `"success"` even with zero new candidates — "no new content" is a successful check, not a failure) |
| `source_checks` | **+1** (one `no_changes` or `found_notice` row for Michałowice, written by the writer identity) |
| `source_notice_candidates` | **+0 to +1** (capped by `getMaxCandidatesPerInvocation()`, defaults to 1) — 0 if nothing new was actually found, 1 if it was, always `status: pending` |
| `alerts` | **+0, always** — no code path in this system can write here |
| `operational_notification_events` | **+0** — `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` is not set |

**Anything outside these ranges is a discrepancy** — stop and diagnose,
don't proceed to a second run.

## 7. The two required manual checkpoints

Per the brief's own explicit ask ("jakie dwa ręczne checkpointy są
konieczne") — these are the two points where a human must look before
proceeding, not automatable away:

1. **Before enabling `SCHEDULED_WRITES_ENABLED`:** confirm the writer's
   credentials and environment-tag pairing are still exactly as expected
   — a read-only Supabase check (`SELECT` against `automation_identities`
   for the writer's `user_id`) plus a visual confirmation of
   `SUPABASE_ENVIRONMENT_TAG`'s configured value against which Vercel
   environment is actually running. Skipping this and just flipping the
   flag risks discovering a credential/pairing problem only after the
   first real write attempt, rather than before.
2. **Immediately after the one controlled run, before any second run or
   before wiring real cron:** read `scheduled_writer_runs` (the new row's
   `outcome`, `sources_checked`, `sources_failed`), `source_checks` (the
   new row's `result`), and `source_notice_candidates` (any new row's
   `status` — must be `pending`, never anything else) directly via
   read-only SQL, and cross-check against §6's expected ranges. This is
   the "did it actually behave exactly as designed" checkpoint — the
   route's own JSON response is a good first signal but the database
   state is the authoritative one.

## 8. Recognizing partial vs. total failure

Already fully designed and tested (Sprint 149/166C) — nothing new to
build, only to *read* when it happens:

- **Partial failure:** JSON response has `failedSources > 0` but
  `failedSources < checkedSources`; `scheduled_writer_runs.outcome =
  'partial_failure'`. With only Michałowice in scope, "partial" isn't
  reachable (there's only one source) — this becomes relevant only once
  scope widens beyond one source.
- **Total failure:** `failedSources === checkedSources`;
  `scheduled_writer_runs.outcome = 'total_failure'`;
  `error_summary` reads `"N/N sources failed"` — a plain count, never a
  raw error message. The lock is still released (run still closed) even
  on total failure — confirmed by existing tests
  (`scheduledWriterRouteHistoryLock.spec.ts`).
- **Genuinely unexpected top-level error** (should not normally happen):
  route still returns `{ ok: false, error: "Nieoczekiwany błąd." }` with
  HTTP 500, still closes the run as `total_failure`, never leaks
  exception detail.

## 9. Confirming no alert was published and no email was sent

- **No alert:** query `select count(*) from public.alerts` before and
  after — must be identical (this system has no code path to write
  there, but verifying the count is the honest, non-assumed way to know).
  The route's own JSON response also always includes `published: false`
  and the fixed Polish sentence confirming only pending candidates and
  check history were written.
- **No email:** confirm `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` is not
  `"true"` (it isn't, and this document doesn't propose changing it) —
  if it stays unset, `runOperationalNotification()` returns immediately
  without constructing a ledger or notification adapter at all. If it
  were ever enabled in a future sprint, `operational_notification_events`
  row count before/after would be the authoritative read-only check —
  not in scope for this activation.

## 10. Rollback

**No schema/RLS change is proposed by this activation plan** — §2–§9
only ever discuss Environment Variables and one manual HTTP request, so
"rollback" here means "undo the flag/request," not "run a SQL rollback
file":

- **Immediate stop, any time:** set `SCHEDULED_WRITES_ENABLED` to
  anything other than `"true"` (or delete it) — the very next invocation
  of `write-candidates` returns 503 instantly. Setting
  `SCHEDULED_CHECKS_ENABLED` off does the same for both endpoints at once
  (heavier — also stops the existing dry-run cron).
- **If the one controlled run inserted a candidate that turns out to be
  wrong/unwanted:** it's `status: pending` — reject it through the
  existing, already-built admin queue UI (`/admin/queue`), exactly the
  same manual action as rejecting any admin-found candidate. No special
  "scheduled-writer rollback" exists or is needed — pending candidates
  are inert until a human acts on them either way.
- **If the one controlled run's `source_checks` row is simply wrong/
  confusing:** the admin already has full `UPDATE`/`DELETE` rights on
  `source_checks` (existing RLS policy, unrelated to this sprint) — same
  manual correction path as any other check-history mistake.
- **Nothing in this plan touches the schema**, so
  `ROLLBACK_SPRINT_172_...` (unrelated, already-applied migration) stays
  untouched and irrelevant here.

## 11. What this document does NOT do

No Environment Variable was changed. `SCHEDULED_WRITES_ENABLED` remains
off. `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` remains unset. `CRON_SECRET`
was not rotated. `vercel.json` was not modified. No cron endpoint was
invoked with a valid secret. No manual source check was run on
Production. No SQL was written or executed. This is a plan only, awaiting
Adam's own decision on when (or whether) to begin §5.

## 12. Branch / location

This document lives in `docs/` on `main` (committed as part of Sprint
173's merge or a small follow-up commit — see the session's own commit
history for the exact hash). It is documentation only — no application
code accompanies it.
