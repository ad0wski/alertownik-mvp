# Sprint 180 — First Scheduled Canary Run via Vercel Cron

Date: 2026-07-28 (Dzień 12)

## 1. Input state after Day 11 / Sprint 179B

`main` = `origin/main` = `d1abad7`, clean working tree (only pre-existing
`.vscode/` untracked). Full suite 1324/1324. `writesEnabled=false`,
`writeAttemptsPossible=false`, `canarySources=[michalowice-komunikaty]`,
`alerts=8` (published=5, archived=3, draft=0), `source_notice_candidates=7`,
zero active writer cron, zero automatic publication, zero operational
emails.

## 2. Cron architecture audit (repo + live Vercel panel)

- `vercel.json` already defined **one** real, live Production cron:
  `/api/cron/check-michalowice`, daily `0 5 * * *`, dry-run only (imports
  no Supabase write helper — `checkOneSource` + `buildDryRunSummary`,
  same zero-write contract as `/api/cron/check-sources`). Confirmed via
  the Vercel dashboard's Cron Jobs settings panel: feature Enabled, one
  entry, "1-hour flex window" (Hobby plan).
- No write-capable cron existed. `/api/cron/write-candidates` was fully
  built (Sprint 147+) and battle-tested via two manual runs (Sprint 179A,
  178A) but had never been wired into `vercel.json`.
- `getAllowedWriteSourceIds()` already reads
  `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` server-side and defaults to
  `["michalowice-komunikaty"]` if unset — the route's own source
  restriction is independent of any query string, so a bare cron path
  (no `?sourceKey=`) is sufficient and matches the existing
  `check-michalowice` wrapper's own reasoning about Vercel's undocumented
  cron query-string behavior.
- Atomic open-run lock (`scheduled_writer_runs` + Postgres RPC,
  `openRun`/`closeRun`) already live and proven (Sprint 166C, validated
  live in Sprint 178A) — no code change needed for idempotency/no-overlap
  protection.
- Vercel's Cron Jobs settings panel exposes a native **"Run" button** per
  cron entry — a genuine platform-triggered invocation (Vercel injects
  `CRON_SECRET` itself), distinct from a manually-crafted authenticated
  HTTP request. This was the mechanism used for today's real run (see §5).

## 3. Source selection (read-only, before any code/config change)

Fetched the live `pruszkow-aktualnosci` WordPress REST feed directly
(same 6 posts as Day 11 — no new posts published since). Compared every
keyword-matching post against `source_notice_candidates` (all statuses)
and `alerts` (all statuses):

- Yesterday's candidate ("Czasowe utrudnienia... Sienkiewicza") was now
  a pre-existing `pending` row — correctly expected to be deduped, not
  re-proposed.
- **"Zmiana organizacji ruchu na drodze wojewódzkiej nr 719"**
  (2026-07-23) — distinct title and URL from the already-published DW 719
  / Nowa Wieś alert, not present in any candidate or alert — identified
  as the likely new item, with acknowledged topical-overlap ambiguity
  risk left to the live classifier to resolve (as it correctly did in
  Sprint 178A's own prediction-vs-reality case).

**GO — pruszkow-aktualnosci** (Adam's stated preference), single source,
cap unchanged at 1 (`SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN` not set —
default `1`).

## 4. Branch and code change

Branch `sprint-180-scheduled-canary-cron-v1` (from `main` @ `d1abad7`).
Changed exactly 3 files:

- `vercel.json` — added
  `{"path": "/api/cron/write-candidates", "schedule": "30 5 * * *"}`
  (daily, offset 30 min from the existing dry-run cron, Hobby-plan safe,
  no query string).
- `tests/e2e/vercelCronConfig.spec.ts` — extended the contract from one
  to two cron entries; every existing guarantee (daily-only granularity,
  no secret-shaped values, no hardcoded Production URL, WKD route never
  targeted) preserved, plus new assertions specific to the
  write-candidates entry (no query string, distinct schedule from the
  dry-run cron).
- `tests/e2e/productionRolloutReadiness.spec.ts` — updated the one test
  that previously hardcoded "vercel.json never targets write-candidates"
  to instead assert "only the two known, reviewed cron routes may ever
  appear, and retention/cleanup endpoints remain categorically forbidden"
  — a deliberate architecture change per this sprint's own mandate, not
  a weakened guarantee.

No changes to `src/`, no SQL migrations, no RLS changes.

## 5. Tests before merge

- Targeted: `vercelCronConfig.spec.ts` + `productionRolloutReadiness.spec.ts`
  → 36/36 passed.
- Targeted: `scheduledWriter*.spec.ts`, `sourceCheck.spec.ts`,
  `alertCrossTableDedup.spec.ts`, `candidateUrlHardening.spec.ts`,
  `cronCheckSources*.spec.ts`, `cronCheckMichalowiceRoute.spec.ts` →
  163/163 passed.
- Targeted: `scheduledWriterRouteHistoryLock.spec.ts` +
  `scheduledWriterRunSafety.spec.ts` (open-run/cooldown/cap) → 60/60
  passed.
- `npm run check` (typecheck + lint + build): clean, 0 errors.
- Full `npm run test:e2e`: first run 1316/1326 with 10 failures across
  unrelated auth-guard/public/theme specs (environment flakiness after
  back-to-back full-suite runs — none touched by this sprint's files);
  isolated re-run of exactly those files came back 146/147, with the
  single remaining failure being the same known-flaky
  `themeSystem.spec.ts:98` timing-poll test that had already passed
  21/21 in isolation earlier the same session. Confirmed not a
  regression: nothing in this sprint touches theme, auth, or public-page
  code.

## 6. Preview + merge + Production deployment

- Committed (`0bc1147`), pushed branch, Preview built Ready — smoke
  tested (homepage renders correctly with Preview's own synthetic seed
  data, isolated from Production, no 500).
- Fast-forward merged to `main`, pushed. `main` = `origin/main` =
  `0bc1147`, 0 ahead / 0 behind.
- Production auto-deployed, Ready, commit `0bc1147` — confirmed via
  Vercel dashboard.
- Vercel Cron Jobs panel confirmed both entries registered on Production:
  `/api/cron/check-michalowice` (05:00) and `/api/cron/write-candidates`
  (05:30), each with its own "Run" button.

## 7. Production activation (temporary)

- Added `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS=["pruszkow-aktualnosci"]`
  (Production only, Sensitive).
- Edited `SCHEDULED_WRITES_ENABLED` to `true` (Production).
- Both values screenshot-verified in the form before Save (Day-11 lesson
  applied throughout — no silent-empty-field incident this sprint).
- Redeployed once; `/admin/sources` automation panel confirmed before the
  run: checks active, writes active, canary source = "Miasto Pruszków —
  aktualności", cap = 1, `Zapis możliwy: tak — wszystkie bramy spełnione`.

## 8. The real scheduled run

Triggered via the Vercel Cron Jobs dashboard's native **"Run"** button
for `/api/cron/write-candidates` — not a manual PowerShell/curl request,
and `CRON_SECRET` was never seen, typed, or handled by anyone this
sprint. Baseline immediately before: `alerts=8/published=5,
candidates=7, runs=5`.

Result (read from `scheduled_writer_runs`, the authoritative source of
truth — the route's own hardcoded `trigger: "manual"` DB label is a
pre-existing code constant unrelated to caller origin and does not
distinguish Cron-panel-triggered vs. human-typed calls):

```
started_at:  2026-07-28 06:34:48 UTC
finished_at: 2026-07-28 06:34:51 UTC
sources_checked: 1, candidates_inserted: 1, duplicates_skipped: 2,
ambiguous_candidates: 0, capped_skipped: 1, outcome: success
```

Timing corresponds exactly to the dashboard click — no other action in
this session or by Adam could have produced this row.

## 9. New candidate

ID `758819cc-b532-4b54-af86-d25d28da45b4` — **"Zmiana organizacji ruchu
na drodze wojewódzkiej nr 719"**, status `pending`, source
`pruszkow-aktualnosci`, real permalink `candidate_url`
(`.../zmiana-organizacji-ruchu-na-drodze-wojewodzkiej-nr-719/`), no
`converted_alert_id`, matches the read-only prediction (§3) exactly. Not
approved, not rejected, not published. No collision against any of the 8
alerts or 8 candidates (post-insert).

## 10. Rollback (automatic, immediately after the single confirmed run)

- `SCHEDULED_WRITES_ENABLED` set back to `false` (Production).
- `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` deleted entirely, restoring the
  code default (`["michalowice-komunikaty"]`).
- One redeploy applied both changes.
- Confirmed via `/admin/sources`: `Automatyczne tworzenie kandydatów:
  wyłączone`, `Źródło canary: Gmina Michałowice — komunikaty`, `Zapis
  możliwy: nie — co najmniej jedna brama zamknięta`.
- The cron **job definition itself was deliberately left in place** —
  same reasoning as the pre-existing `check-michalowice` cron: it now
  fires daily at 05:30 UTC but is immediately rejected at the
  `SCHEDULED_WRITES_ENABLED` kill-switch gate (503, zero side effects),
  so leaving the schedule active carries no risk while
  `SCHEDULED_WRITES_ENABLED=false`. Re-enabling writes for a future
  deliberate window remains a separate, explicit decision — establishing
  this durable, fail-closed infrastructure was the sprint's actual goal.

## 11. Final verification

- Public REST `alerts`: HTTP 200. Homepage: HTTP 200. `/alerty`: HTTP
  200. `/admin`: HTTP 200 (login-gated). No 500s anywhere.
- "Utrudnienia w ruchu drogowym – DW nr 719, Nowa Wieś" and "Czasowa
  organizacja ruchu na ul. Działkowej w Pruszkowie" each still appear
  exactly once (published count unchanged at 5 throughout).
- Final counters: `alerts=8` (Δ0, published=5/archived=3/draft=0),
  `source_notice_candidates=7→8` (Δ+1), `scheduled_writer_runs=5→6`
  (Δ+1), `operational_notification_events=1` (Δ0 — unchanged; no new
  email/notification fired, `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`
  stayed false throughout).
- Latest `scheduled_writer_runs` row has `finished_at` set — no open run.

## 12. Final flags

`checksEnabled=true, writesEnabled=false, writeAttemptsPossible=false,
canarySources=[michalowice-komunikaty], isSingleSourceCanary=true,
maxCandidatesPerRun=1, openRun=null, operationalNotificationRuntimeEnabled=false,
emailAlertConfig.enabled=false`. Cron Jobs feature: Enabled, 2 entries
(both fail-closed while `SCHEDULED_WRITES_ENABLED`/`SCHEDULED_CHECKS_ENABLED`
are off for writes; the dry-run cron continues running daily as before,
unaffected).

## 13. Known limitations

- Vercel Hobby plan crons have only a 1-hour flex window and daily-only
  granularity — a genuine "exactly once, right now" scheduled trigger
  isn't native to the platform. The dashboard's manual "Run" button was
  used instead of waiting up to 24h for the natural 05:30 UTC fire,
  since it invokes the same platform execution path (Vercel-managed
  `CRON_SECRET` injection) without a human ever handling the secret.
- The DB's `trigger` column value (`"manual"`) is a hardcoded literal in
  `write-candidates/route.ts`'s `openRun()` call, not derived from the
  actual caller — it cannot distinguish a Cron-panel-triggered call from
  a genuinely manual one. If precise trigger provenance is ever needed
  again, the route would need to pass Vercel's own cron-identifying
  header/context through to `openRun()`.

## 14. Recommended next step

After several more clean canary runs (ideally including at least one
genuinely unattended 05:30 UTC fire, once Adam is comfortable leaving
`SCHEDULED_WRITES_ENABLED=true` for a full daily cycle), consider
widening `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` to a second source, or
formally deciding whether the write-candidates cron should stay
permanently enabled (vs. today's pattern of a temporary activation
window per canary run).
