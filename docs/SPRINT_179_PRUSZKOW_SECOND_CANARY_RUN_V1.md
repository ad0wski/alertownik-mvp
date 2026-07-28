# Sprint 179 — Second Controlled Canary Run (pruszkow-aktualnosci)

Date: 2026-07-28 (Dzień 11)

## 1. Input state after Day 10

`main` = `origin/main` = `e42157e`, clean working tree. Sprint 178A closed:
writer disabled, `writeAttemptsPossible=false`, default Michałowice-only
allowlist, full suite 1324/1324, typecheck/lint/build clean.

## 2. Preflight

- Git: `main` = `origin/main` = `e42157e`, clean tree (only pre-existing
  `.vscode/` untracked, left untouched).
- Vercel: confirmed project `alertownik-mvp` under "Adam's projects" (Hobby).
- Supabase: confirmed org "ad0wski's Org" has exactly 3 projects
  (`alertownik-mvp`, `alertownik-preview`, `Trade Gamifier` — paused);
  opened `alertownik-mvp` specifically.
- Automation status cross-checked against memory and matched exactly:
  alerts published=5/archived=3, 6 pending/converted candidates including
  "Pilates w wakacje" (`candidate_url: null`, known Michałowice HTML
  limitation), 4 automation_identities-based RLS policies all
  `roles={authenticated}`.

## 3. Read-only live-feed analysis (no writes)

Fetched `pruszkow-aktualnosci`'s real WordPress REST endpoint
(`https://www.pruszkow.pl/wp-json/wp/v2/posts?categories=371&per_page=6`)
directly (read-only, outside the app) to predict the canary run before
touching any kill switch. Found one genuinely new, keyword-matching post
not present in `alerts` (any status) or `source_notice_candidates` (any
status): **"Czasowe utrudnienia we wjeździe na parking P&R przy ul.
Sienkiewicza"** (2026-07-27 15:42), matching `PRUSZKOW_NOTICE_KEYWORDS_RX`
on "utrudni...". Predicted `candidate_url`:
`https://www.pruszkow.pl/mieszkancy/czasowe-utrudnienia-we-wjezdzie-na-parking-pr-przy-ul-sienkiewicza/`.

**GO** — safe new candidate confirmed, no dedup collision.

## 4. Env var flip (Production, temporary)

- Added `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS=["pruszkow-aktualnosci"]`
  (Production only, Sensitive) — narrows the writer to exactly one source,
  preserving `isSingleSourceCanary=true`.
- Edited `SCHEDULED_WRITES_ENABLED` to `true` (Production).
- **Lesson repeated from Sprint 174**: a value typed into a just-opened
  Vercel env-var edit form can silently fail to land in the textarea if
  the page has scrolled/rerendered between click and type — confirmed via
  screenshot immediately after typing, not just after Save, going forward.
  The first `SCHEDULED_WRITES_ENABLED=true` attempt silently failed this
  way (value field stayed empty), verified by an automation-status
  re-check showing `writesEnabled: false`/`writeAttemptsPossible: false`
  post-redeploy, and corrected with a second attempt (screenshot-verified
  before Save).
- Redeployed Production twice (once per env-var correction) — env var
  changes require a fresh deployment to take effect (Sprint 174 hard
  fact, reconfirmed).
- Post-redeploy `/admin/sources` automation panel confirmed: checks
  active, writes active, canary source = "Miasto Pruszków — aktualności",
  cap = 1, `writeAttemptsPossible: tak — wszystkie bramy spełnione`.

## 5. Single request

Adam ran a purpose-built one-shot PowerShell script
(`Alertownik_RunWriteCandidatesOnce_Pruszkow.ps1` — hidden
`Read-Host -AsSecureString` CRON_SECRET prompt, secret never seen by
Claude, no retry, 30s timeout, secret cleared in `finally`) — exactly one
GET to `/api/cron/write-candidates?sourceKey=pruszkow-aktualnosci`.

```json
{
  "ok": true,
  "dryRun": false,
  "checkedAt": "2026-07-28T04:38:05.186Z",
  "checkedSources": 1,
  "successfulSources": 1,
  "failedSources": 0,
  "proposalsFound": 4,
  "candidatesInserted": 1,
  "duplicatesSkipped": 1,
  "ambiguousCandidates": 0,
  "cappedSkipped": 2,
  "sourceChecksInserted": 0,
  "duplicatesPreventedByDatabase": 0,
  "published": false
}
```

## 6. New candidate

ID `72a7ee42-1eea-4a65-8d96-8be80ec3cd82` — "Czasowe utrudnienia we
wjeździe na parking P&R przy ul. Sienkiewicza", status `pending`, source
`pruszkow-aktualnosci`, `candidate_url` populated with the real permalink
(unlike Michałowice's HTML source, Pruszków's WordPress REST parser
yields trusted per-item permalinks) — matches the read-only prediction
exactly. Left untouched: not approved, not rejected, no draft created, no
alert published.

## 7. Deduplication / dedup result

No collision against any of the 8 existing alerts (any status) or the 6
pre-existing candidates (any status). `duplicatesSkipped=1` and
`cappedSkipped=2` in the live response confirm the source had more
matching posts than the cap allowed — cap=1 respected, no other proposal
misclassified as new.

## 8. Counters before/after

`alerts_total=8 (Δ0, published=5/archived=3, both unchanged)`,
`source_notice_candidates=6→7 (Δ+1)`, `scheduled_writer_runs=4→5 (Δ+1,
outcome=success)`. Zero new alerts, zero publications, zero emails.

## 9. Rollback

- `SCHEDULED_WRITES_ENABLED` set back to `false` (Production), redeployed,
  confirmed `writesEnabled=false`, `writeAttemptsPossible=false`.
- `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` deleted entirely (Production),
  restoring the code default (`["michalowice-komunikaty"]`) — confirmed
  via `/admin/sources`: canary source reverted to "Gmina Michałowice —
  komunikaty".
- Single combined redeploy applied both rollback changes.

## 10. Final flags

`checksEnabled=true, writesEnabled=false, writeAttemptsPossible=false,
canarySources=[michalowice-komunikaty], isSingleSourceCanary=true,
maxCandidatesPerRun=1, openRun=null, operationalNotificationRuntimeEnabled=false,
emailAlertConfig.enabled=false`.

## 11. Smoke test + tests

- Public homepage: loads, one published alert visible, no draft/candidate
  data leaked.
- `npm run check`: typecheck/lint/build all clean, 0 errors.
- `npm run test:e2e`: **1323 passed, 1 failed** (not 1324/1324).

## 12. Known issue found (pre-existing, NOT caused by the canary run) — FIXED in Sprint 179B

`tests/e2e/scheduledWriterRlsMigrationHistoricalWarning.spec.ts` — the
"warning references the real corrective fix file that supersedes it"
case failed. Root cause (verified): the historical SQL file
(`docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql`) wraps the
referenced filename across two comment lines, and the test's own
whitespace-normalization regex assumed LF line endings — on this Windows
checkout the file has CRLF line endings, so the stray `\r` survived
normalization and broke the exact-substring match. Environment/line-ending
issue, not a content or security regression — the DO NOT APPLY warning
text itself was always intact and correct, and nothing in the canary-run
session (Sprint 179A) touched that SQL file, the test file, or
line-ending config.

**Fix (Sprint 179B):** normalized every file read by the test's own
`readFile()` helper (`tests/e2e/scheduledWriterRlsMigrationHistoricalWarning.spec.ts`)
from CRLF/CR to LF immediately after reading, via
`.replace(/\r\n?/g, "\n")`. This makes every existing assertion in the
file (all of which already reasoned about `--` comment joins in terms of
`\n`) behave identically regardless of the checkout's line-ending
config, without weakening any assertion, without touching the historical
SQL file's content (still preserved unmodified, DO NOT APPLY warning
intact), and without touching any production code.

Targeted re-run: **6/6 passed**. Full suite re-run after the fix:
**1324/1324 passed**. `npm run check` (typecheck + lint + build): clean,
0 errors.

## 13. Zero side effects confirmed

Exactly one HTTP request sent to `write-candidates`, no retry, during
Sprint 179A. Zero new alerts, zero publications, zero emails, zero
unauthorized writes anywhere across both 179A and 179B. Sprint 179B made
no Production env var changes, no SQL migrations, no writer/cron
invocations, and no Supabase data writes — its only changes were the
test-file fix above and this document, both ordinary code changes on
branch `sprint-179-day-11-closeout-v1`.

## 14. Sprint 179B closeout

- Branch `sprint-179-day-11-closeout-v1` created from `main` at `e42157e`,
  carrying forward this already-existing, uncommitted document.
- Committed the CRLF-normalization test fix + this document together.
- Fast-forward merged to `main`, pushed.
- Confirmed Production auto-redeployed from the new `main` HEAD, `Ready`,
  commit matches.
- Public smoke test after merge: homepage and `/alerty` load, "Utrudnienia
  w ruchu drogowym – DW nr 719, Nowa Wieś" and "Czasowa organizacja ruchu
  na ul. Działkowej w Pruszkowie" each appear exactly once, no HTTP 500s.
- `automation-status` re-confirmed unchanged from the Sprint 179A rollback
  state: `writesEnabled=false`, `writeAttemptsPossible=false`,
  `canarySources=[michalowice-komunikaty]`.
