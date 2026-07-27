# Sprint 174 — Controlled Activation Execution (Day 7)

**Status: executed. One controlled Production write occurred, was verified, and
the write kill switch was returned to its resting (off) state. This document
records what actually happened, not a plan — see
`docs/SPRINT_173_ACTIVATION_CHECKPOINT_V1.md` for the pre-approved plan this
execution followed.**

Branch: `sprint-174-scheduled-checks-activation-planning-v1`. No merge to
`main`, no other branch touched or deleted.

---

## 1. Baseline (start of Day 7)

| Table | Count |
|---|---|
| `alert_sources` | 4 |
| `source_checks` | 2 |
| `source_notice_candidates` | 3 |
| `alerts` | 6 |
| `scheduled_writer_runs` | 1 |
| `operational_notification_events` | 1 |
| `automation_identities` | 2 |

Preflight (Checkpoint 1) confirmed via `/api/admin/automation-status`
(booleans only, never a raw secret value) and read-only Supabase `SELECT`s:
`checksEnabled=true`, `writesEnabled=false`, no open run, no open/claimed
operational event, canary source correctly scoped to `michalowice-komunikaty`.
Verdict: **GO**.

## 2. Activation

1. Adam manually edited `SCHEDULED_WRITES_ENABLED` in Vercel (Production
   scope only) to `true` and clicked Save himself — Claude prepared and
   verified the form value programmatically (length 4, char codes
   `[116,114,117,101]`, no whitespace/quotes/newline) but never clicked Save.
2. One redeploy of the existing `main` commit `f4d1184` (deployment
   `3CSUQSYLPfKWksSu8pbHupg6XqgT`, Ready, Production, no code change) was
   required to make the new value take effect on Vercel Function instances —
   env var changes are **not** picked up by already-warm instances without a
   redeploy, despite an earlier code comment's assumption to the contrary
   (see § 6, lesson learned).
3. Post-redeploy `automation-status`: `checksEnabled=true`,
   `writesEnabled=true`, `writeAttemptsPossible=true`,
   `cronSecretConfigured=true`, `writerCredentialsConfigured=true`, canary =
   `michalowice-komunikaty`, no open run. Supabase counters unchanged from
   baseline — the flag flip and redeploy themselves wrote nothing.

## 3. The one controlled write-candidates request

A one-shot, human-in-the-loop PowerShell script
(`Alertownik_RunWriteCandidatesOnce.ps1`, written to a Temp path, statically
audited before use — see § 5) was used by Adam to send exactly one
`GET /api/cron/write-candidates` request with the real `CRON_SECRET`, which
Claude never read or saw.

**Result (HTTP 200):**

```
ok=true, dryRun=false
checkedAt=2026-07-27T04:34:17.523Z
checkedSources=1, successfulSources=1, failedSources=0
proposalsFound=6, candidatesInserted=1, duplicatesSkipped=3,
ambiguousCandidates=0, cappedSkipped=2, sourceChecksInserted=0
published=false
source: michalowice-komunikaty
```

**Database verification (read-only):**

| Table | Before run | After run | Δ |
|---|---|---|---|
| `alert_sources` | 4 | 4 | 0 |
| `source_checks` | 2 | 2 | 0 |
| `source_notice_candidates` | 3 | 4 | **+1** |
| `alerts` | 6 | 6 | 0 |
| `scheduled_writer_runs` | 1 | 2 | **+1** |
| `operational_notification_events` | 1 | 1 | 0 |
| `automation_identities` | 2 | 2 | 0 |

New `scheduled_writer_runs` row (`335f59e4-ad93-490b-a880-6dbbcb946d28`):
closed (`finished_at` set, 2026-07-27 04:34:17.456 UTC),
`outcome=success`, `trigger=manual`, `environment_tag=production`,
`sources_checked=1`, `sources_failed=0`.

New `source_notice_candidates` row (`72a01ba0-8549-456d-8e72-102bbca1273a`):
`source_key=michalowice-komunikaty`, `status=pending`,
`verification_status=unverified`, `converted_alert_id=NULL`,
`duplicate_of_alert_id=NULL` — **no alert exists or was created from it.**
Its status was never changed by any step in this sprint; it awaits Adam's
manual review in `/admin/queue`.

## 4. Rollback to resting state

1. Adam set `SCHEDULED_WRITES_ENABLED` back to `false` (Production scope
   only) and clicked Save himself — again, Claude only prepared and verified
   the value (length 5, char codes `[102,97,108,115,101]`) beforehand.
2. **Finding:** immediately after Save, `automation-status` still reported
   `writesEnabled: true` (confirmed twice, 5s apart, with a cache-busting
   query param) — the same warm-instance-propagation behavior as § 2, now in
   reverse. Flagged to Adam before taking any further action.
3. With Adam's explicit approval, a second redeploy of the same `main`
   commit `f4d1184` (deployment `58VXPKAKdxcR9B5hY1NsHEQ3iFWv`, Ready,
   Production, no code change) was performed.
4. Post-redeploy `automation-status`: `checksEnabled=true`,
   `writesEnabled=false`, `writeAttemptsPossible=false`, no open run,
   `lastClosedRun` still the same 04:34:17 run (no new run was created by
   either redeploy).
5. Final Supabase counters: unchanged from § 3's "after run" row. Candidate
   `72a01ba0…` still `pending`.

**Resting state confirmed:** `SCHEDULED_WRITES_ENABLED=false` in Production,
both in the Vercel dashboard and via live `automation-status` on the
currently-serving deployment. `SCHEDULED_CHECKS_ENABLED` remains `true`
(pre-existing, unrelated, still only gates the zero-write dry-run endpoints).

## 5. Security audit — one-shot write script

`Alertownik_RunWriteCandidatesOnce.ps1` was statically audited (parsed via
`[System.Management.Automation.Language.Parser]::ParseFile`, never executed
by Claude) before Adam ran it himself in a separate PowerShell window:

- 0 parse errors
- Exactly 1 `Invoke-WebRequest` call, method `GET`, correct URL
- `Authorization` header built from a variable, never a literal token
- No hardcoded secret anywhere in the file
- `-TimeoutSec 30`, no retry logic, no loop constructs (`for`/`while`/`do`/`foreach`)
- Requires typing the exact case-sensitive phrase `RUN ONE PRODUCTION WRITER`
  before doing anything
- Secret entered via `Read-Host -AsSecureString` (masked, not persisted to
  PSReadLine history)
- Secret converted to plaintext only in-memory (`Marshal.SecureStringToBSTR`)
  for the single request, then explicitly zeroed and nulled in a `finally`
  block (`ZeroFreeBSTR`, `SecureString.Dispose()`, variable removal)
- No `Set-Clipboard`/`clip`, no `Out-File`/`Set-Content`/`Export-*`, no
  `Start-Transcript` anywhere in the script — secret and response body never
  touch the clipboard, a file, or a log
- Script terminates immediately after the single response or error; no code
  path sends a second request

Claude never held, read, or logged `CRON_SECRET` at any point.

## 6. Lesson learned (for future activation/deactivation sprints)

Vercel Serverless Function instances that are already warm do **not**
re-read `process.env` per invocation as an earlier in-repo comment assumed —
an Environment Variable change (in either direction) requires a fresh
Production deployment to fully apply across all currently-serving instances.
Both this sprint's activation and rollback needed their own redeploy step;
treat this as a hard requirement, not an optional "near-instant propagation"
convenience, for any future flag flip on this project.

## 7. Outstanding item for Adam

Candidate `72a01ba0-8549-456d-8e72-102bbca1273a`
(`michalowice-komunikaty`, `status=pending`) is waiting for manual review in
`/admin/queue` — approve, reject, or convert to draft. No automated path can
act on it further; `SCHEDULED_WRITES_ENABLED` is off again.

## 8. What this sprint did NOT do

No SQL other than read-only `SELECT`s was executed. No RPC was called. No
schema or RLS change was made. No email or Resend send occurred
(`OPERATIONAL_EMAIL_ALERTS_ENABLED` stayed off throughout). No alert was
created or published. No merge to `main`. No branch deleted. No
`SCHEDULED_CHECKS_ENABLED`, `CRON_SECRET`, or
`SCHEDULER_WRITER_ALLOWED_SOURCE_IDS` change. No second `write-candidates`,
`check-sources`, or manual source-check request was sent.
