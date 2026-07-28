# Sprint 180C — Trusted Source Auto-Publish: Canary Report v1

Status: **built, tested, deployed, canary attempted, one real bug found and fixed, mechanism currently DISABLED (rolled back) pending a future, separately-approved re-canary.**

Date: 2026-07-28.

---

## 1. What this sprint built

A single, scoped, revocable exception to "every alert is published manually by an admin" (CLAUDE.md Security Rule #10, amended this sprint). It lets exactly one allowlisted trusted source (`pruszkow-aktualnosci`) auto-publish a candidate directly to a live, public `alerts` row — but only when every one of a long list of fail-closed conditions holds simultaneously.

### Architecture

- **`src/lib/trustedSourceAutoPublish.ts`** — the only place any decision is made. Deterministic, non-AI: category (keyword match), place (known-locality substring match), start date (Polish month-name regex) are all extracted with plain string logic, never an LLM call. Reuses, never duplicates: `classifyProposalAgainstExisting` (the same cross-table dedup write-candidates already uses), `detectCandidateCategory`, `PILOT_LOCALITIES`, `MONTHS_PL`.
- **`GET /api/cron/auto-publish-trusted-source`** — a route structurally independent from `/api/cron/write-candidates`: separate flag (`SCHEDULED_AUTO_PUBLISH_ENABLED`, never `SCHEDULED_WRITES_ENABLED`), never fetches a source page or creates a candidate, only ever converts a pre-existing `pending` candidate.
- **`docs/sql/PROPOSED_SPRINT_180C_TRUSTED_SOURCE_AUTO_PUBLISH_RLS_V1.sql`** — two new, narrowly-scoped RLS policies (INSERT on `alerts`, UPDATE on `source_notice_candidates`), both `to authenticated` + `automation_identities` membership required. **Applied manually to Production by Adam, verified live** via `pg_policies` (exact match to the proposed migration, no anon/public grant, no other policy touched).
- **`AutomationStatusPanel.tsx` / `automation-status` API** — new "Automatyczna publikacja zaufanych źródeł" section, purely informational (no button), surfaces `enabled`, allowlisted sources, and `maxPerRun` without ever exposing a secret.
- **Public copy** (`/zasady`, `/about`) — updated to honestly disclose the narrow exception instead of the previous unqualified "every alert is always published manually" claim.

### The 9 simultaneous fail-closed conditions (any single failure → candidate stays `pending`, no partial write)

1. `SCHEDULED_AUTO_PUBLISH_ENABLED=true`.
2. Candidate's `source_key` on the dedicated auto-publish allowlist (`pruszkow-aktualnosci` only, code-enforced narrowing via `SAFE_CHECK_SOURCE_IDS`, never caller-widenable).
3. `candidate_url` is a direct, safe, public `http(s)` permalink — never `/wp-json/`, never missing.
4. Candidate is current or upcoming (24h past-grace, not further expired).
5. Every required alert field extractable and complete (title, category, place, date, source URL).
6. Cross-table dedup classifies `new` — never `duplicate`, never `ambiguous`.
7. Candidate still `status = pending` and `converted_alert_id IS NULL` at conversion time.
8. At most one auto-publish per invocation (cap = 1, structurally enforced by the orchestration loop returning after the first success, independent of any env-configured cap value).
9. Idempotent: a re-run against an already-converted candidate cannot publish a second time (exact-URL dedup against the now-published alert catches it).

---

## 2. The canary run

**Candidate:** `758819cc-b532-4b54-af86-d25d28da45b4` ("Zmiana organizacji ruchu na drodze wojewódzkiej nr 719"), pre-approved, classified Stage-B (distinct investment stage, not a duplicate of the existing DW719 alert) in Sprint 180B.

**Pre-flight verification (before the run):** RLS migration confirmed live via `pg_policies`. Candidate re-verified against real Production DB text: still `pending`, `converted_alert_id` null, allowlisted source, safe permalink, and — via a direct run of the real `classifyProposalAgainstExisting` against the real existing DW719 alert row — classified `new`, not duplicate/ambiguous.

**Execution:** exactly one manual GET to `/api/cron/auto-publish-trusted-source`, via a one-shot PowerShell script (`Read-Host -AsSecureString`, zero retries, 30s timeout, secret cleared in `finally`), triggered once by Adam.

**Result:**
```json
{"ok":true,"checkedAt":"2026-07-28T10:00:54.306Z","status":"no_eligible_candidate","published":false,
 "candidateId":null,"alertId":null,
 "skipped":[
   {"candidateId":"72a7ee42-1eea-4a65-8d96-8be80ec3cd82","reason":"duplicate"},
   {"candidateId":"758819cc-b532-4b54-af86-d25d28da45b4","reason":"duplicate"}
 ]}
```
No alert published. No partial write. Fail-closed behaved exactly as designed — but the *reason* given (`duplicate`) was wrong for both candidates.

---

## 3. Root cause: self-comparison bug

`findExistingCandidateTexts(sourceKey, null)` queries every `source_notice_candidates` row sharing `source_key` — but the candidate being evaluated by `trustedSourceAutoPublish.ts` is **itself already such a row**, and was never excluded from its own comparison pool. Every candidate from `pruszkow-aktualnosci` was therefore always compared against itself and trivially matched at ~100% similarity.

Reproduced against the real Production data (read-only) before any fix was written:
- Parking candidate (`72a7ee42`), with self included → `duplicate`; with self excluded → `new`.
- DW719 candidate (`758819cc`), with self included → `duplicate`; with self excluded → **`ambiguous`** — a separate, correct, non-bug finding: it shares enough generic Polish municipal-notice boilerplate ("zostanie wprowadzona czasowa organizacja ruchu...") with an unrelated candidate (ul. Działkowej, same source) to cross the existing conservative `AMBIGUOUS_SIMILARITY_THRESHOLD`. That threshold is intentionally untouched by this sprint — loosening it was explicitly out of scope.

**Fix (commit `1118641`, merged to main, deployed to Production, `npm run check` + 1385 e2e tests green):** `findExistingCandidateTexts` gained an optional `excludeCandidateId`, applied as `.neq("id", excludeCandidateId)` in the real Supabase-backed implementation. `runTrustedSourceAutoPublish` now passes `candidate.id`. `writeCandidatesForSource`'s own regular call site is untouched (it checks a proposal that doesn't exist in the table yet, so it never had this bug). Two regression tests pin the fix and the pre-fix failure mode.

**No second Production run was executed** — per explicit instruction, the fix was verified with a local reproduction and the full test suite only, not a second live canary.

---

## 4. Database verification (read-only, before and after)

| Check | Before canary | After canary + fix + rollback |
|---|---|---|
| `alerts` row count | 8 | 8 (unchanged) |
| `758819cc` status / `converted_alert_id` | `pending` / `null` | `pending` / `null` (unchanged) |
| `72a7ee42` status / `converted_alert_id` | `pending` / `null` | `pending` / `null` (unchanged) |
| `scheduled_writer_runs` (cron-triggered, last 24h) | — | 0 |
| `operational_notification_events` (last 24h) | — | 0 (no email/notification fired) |

No new alert. No duplicate publication. No partial write at any point.

---

## 5. Rollback (final state)

Adam manually, in the Vercel dashboard, Production scope only:
- `SCHEDULED_AUTO_PUBLISH_ENABLED` → `false`.
- `SCHEDULED_AUTO_PUBLISH_SOURCE_IDS` → deleted.
- `SCHEDULED_AUTO_PUBLISH_MAX_PER_RUN` → deleted.
- Preview/Development untouched. One redeploy of `main`.

**Confirmed live** via `GET /api/admin/automation-status`:
```json
{"checksEnabled":true,"writesEnabled":false,"writeAttemptsPossible":false,
 "autoPublish":{"enabled":false,"allowlistedSources":[{"id":"pruszkow-aktualnosci","name":"Miasto Pruszków — aktualności"}],"isSingleSourceAllowlist":true,"maxPerRun":1}}
```
`autoPublish.enabled: false` is the only gate that matters — the route checks this before anything else, so the allowlist/cap shown above (code defaults, since the env vars were deleted rather than left at an empty value) are inert. `checksEnabled`/`writesEnabled` (the pre-existing, unrelated Michałowice dry-run and write-candidates switches) were never touched by this rollback.

The RLS migration itself was **not** reverted — it stays applied (it is purely additive, narrowly scoped, and the CLAUDE.md-documented fast rollback path is the flag, not the migration).

---

## 6. Tests

- Unit/orchestration: `tests/e2e/trustedSourceAutoPublish.spec.ts` (eligibility gate, all fail-closed branches, orchestration, cap=1, idempotency, insert/mark failure handling, plus two new regression tests pinning the self-dedup fix).
- Route: `tests/e2e/autoPublishTrustedSourceRoute.spec.ts` (independent kill switches, auth, credentials, environment guard, static audit).
- Cross-cutting anti-drift: `tests/e2e/databaseEnvironmentGuardIntegration.spec.ts`, `tests/e2e/vercelCronConfig.spec.ts`, `tests/e2e/productionRolloutReadiness.spec.ts`, `tests/e2e/automationStatus.spec.ts` (new autoPublish snapshot/copy tests) — all updated to account for the new route/flag as a second reviewed, fully-guarded writer consumer.
- Full suite: **1385/1385 passed** (`npx playwright test`). `npm run check` (typecheck + lint + build): zero errors, zero warnings.

---

## 7. Was Pruszków's regular (non-auto-publish) automation left running?

Yes, unaffected. `SCHEDULED_CHECKS_ENABLED` and the write-candidates path were never part of this sprint's rollback — only the three auto-publish-specific env vars were touched. The Pruszków source continues to be checked and to produce `pending` candidates for manual review exactly as before this sprint.

---

## 8. Current state / what would be needed to re-canary

The mechanism is fully built, RLS-backed, tested, and currently **off**. To attempt a second canary in a future sprint:
1. Confirm `758819cc`'s real classification against the current candidate pool (it was `ambiguous` post-fix in the last read-only check, not `new` — it may not currently be eligible at all without either a different candidate or a decision about the ambiguous-threshold trade-off, which this sprint deliberately did not touch).
2. Re-enable the three Production env vars.
3. Trigger one controlled run, exactly as this sprint did.

That decision is out of this sprint's scope and requires separate approval.
