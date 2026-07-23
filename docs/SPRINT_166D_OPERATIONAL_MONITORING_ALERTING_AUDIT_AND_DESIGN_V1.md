# Sprint 166D-1 — Operational Monitoring & Alerting: Audit and Design

**Status:** Read-only audit + safe, OFF-by-default foundation only. Nothing activated: no Vercel Cron entry, no kill switch changed, no SQL executed, no secret added or read, no email provider configured, no message ever sent, no Preview or Production data touched. Branch `sprint-166d-operational-monitoring-alerting`, not merged to `main`.

**Goal for this sprint (166D-1):** turn Sprint 166C's Stage 4 ("Alerting — 0%, design only") into a reviewed plan plus the parts of it that are unambiguously safe to write today: pure types, a deterministic error classifier, a no-op notification adapter, an unsent email template, and dedup/cooldown logic — all fully unit-testable, all inert until a future sprint explicitly wires and enables them.

---

## A. Audit — what already exists

| Concern | Current state | File |
|---|---|---|
| Fetch failure classification | `classifyFetchFailure()` — `transient` (`http_5xx`, `network_error`, `timeout_10s`) vs `permanent` (`http_4xx`, `non_html_content_type`, `parse_exception`) | `src/lib/scheduledWriterRunSafety.ts` |
| Retry | Bounded, exactly one retry for transient failures, fixed 2s delay, max 2 attempts total per source per invocation — happens synchronously inside one HTTP request/response, not across invocations | `src/lib/scheduledSourceFetch.ts` (`fetchAndParseProposals`), constants in `scheduledWriterRunSafety.ts` (`MAX_FETCH_ATTEMPTS`, `RETRY_DELAY_MS`) |
| Run history | `scheduled_writer_runs` table — **live, migrated to `alertownik-preview`** (Stage 2b, this session's predecessor). Columns include `outcome`, `sources_checked`, `sources_failed`, `error_summary`. Admin has a `SELECT`-only RLS policy (`scheduled_writer_runs_admin_select`); the writer identity has no `SELECT` at all (INSERT/UPDATE only, via two `SECURITY DEFINER` RPCs) | `src/lib/scheduledWriterHistory.ts`, `src/lib/scheduledWriterRunSafety.ts`, `docs/sql/PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql` (already executed) |
| Concurrency lock | Atomic, Postgres-enforced (partial unique index + 2 RPCs) — live, tested with a real two-concurrent-invocations run | same as above |
| Candidate/source models | `SourceNoticeCandidate` (v2 status enum: `pending → needs_review → approved → converted_to_draft → published`, plus `rejected`/`archived`); `source_checks` (`SourceCheckResult`); `alert_sources` registry | `src/types/sourceCandidate.ts`, `src/lib/sourceHealth.ts`, `src/lib/sourceCheck.ts` |
| Admin panel — automation status | `AutomationStatusPanel` (fetches `GET /api/admin/automation-status`, admin-session-gated, read-only: reports kill-switch booleans, credential-presence booleans, canary source names, per-run cap — never a secret value) | `src/components/AutomationStatusPanel.tsx`, `src/app/api/admin/automation-status/route.ts`, `src/lib/automationStatus.ts` |
| Admin panel — writer activity | `ScheduledWriterMonitoring` — derives per-source candidate counts from data the page already loads (`source_notice_candidates`); explicitly documents it **cannot** show per-run counters or run history without a schema change (now partially resolved — see above) | `src/components/ScheduledWriterMonitoring.tsx`, `src/lib/writerCandidateActivity.ts` |
| Admin panel — source health | `SourceHealthDashboard` — per-source staleness (`checked_recently`/`stale`/`never_checked`/`unregistered`) from checklist + registry + checks + candidates already loaded | `src/lib/sourceHealth.ts`, `src/components/SourceHealthDashboard.tsx` |
| Email/notification infrastructure | **None found anywhere in `src/`** — no email library, no notification adapter, no alerting config, no template, no dedup/cooldown mechanism. Confirmed by an exhaustive grep for `nodemailer`/`resend`/`sendgrid`/`smtp`/notification-related identifiers: zero matches outside this sprint's new files | (absence confirmed) |
| Tests | No Jest/Vitest — all tests, including pure-function "unit" tests, live as Playwright spec files under `tests/e2e/*.spec.ts`, run via `npm run test:e2e`. Existing pattern for pure logic: `import { test, expect } from "@playwright/test"` + `test.describe`/`test(...)` blocks, zero browser interaction, zero network | `tests/e2e/scheduledWriterRunSafety.spec.ts`, `scheduledSourceFetchRetry.spec.ts`, `automationStatus.spec.ts`, `writerCandidateActivity.spec.ts`, etc. |
| Docs | Sprint 166C's own design doc already scoped "Stage 4 — Alerting" as 0%→10% (design only), explicitly deferred, requiring a new approval gate before any real provider/webhook/secret is added | `docs/SPRINT_166C_AUTOMATIC_SOURCE_MONITORING_AUDIT_AND_DESIGN_V1.md` §C Stage 4 |

## B. Gaps this sprint addresses (foundation only)

1. No shared vocabulary exists for error severity, category, retry state, or "does an admin need to act" — every route/component that wants to report health has to invent its own ad hoc shape.
2. No deterministic function turns an existing outcome/diagnostic into a severity or "needs admin attention" verdict.
3. No notification concept exists at all — not even a no-op interface a future real adapter could implement against.
4. No email content has ever been drafted — a future sprint wiring a real provider would otherwise draft copy under time pressure, with no prior review.
5. No dedup/cooldown logic exists — without it, a future naive integration would risk one flapping source spamming an inbox.
6. The existing admin panels (`AutomationStatusPanel`, `ScheduledWriterMonitoring`) already read live/dynamic data but were never composed into one simplified "is everything OK" verdict — an admin has to mentally combine three panels today.

## C. Plan for Sprint 166D (full scope — later stages require separate approval)

### 1. Error taxonomy (this session)
- `AutomationErrorCategory`: `"transient_fetch" | "permanent_fetch" | "write_error" | "lock_held" | "environment_guard_blocked" | "credentials_not_configured" | "kill_switch_disabled" | "unexpected_error"` — a superset that maps every outcome/diagnostic value the existing code already produces (`RunOutcome`, `FetchDiagnosticCode`, the route's per-source `outcome` literals) onto one closed vocabulary, never invents a new failure mode.
- `AutomationSeverity`: `"info" | "warning" | "critical"` — `kill_switch_disabled` is `"info"` (expected/normal state today), a single transient failure is `"warning"`, a permanent failure or a stuck lock is `"critical"`.

### 2. Run/source health-state model (this session)
- `RetryState` — `attemptsMade`, `maxAttemptsPerRun` (mirrors `MAX_FETCH_ATTEMPTS`), `willRetryWithinRun` (whether the existing in-request retry already ran or is still eligible), and a separate, honestly-labeled `nextScheduledRunKnown: false` (no cron exists yet — this field exists so the type never has to change shape once Stage 6 cron is eventually added).
- `AdminActionRequired` — `{ required: boolean; reason: "permanent_failure" | "stuck_lock" | "consecutive_failures" | "credentials_missing" | null }`.
- `NotificationStatus` — `"disabled" | "no_adapter_configured" | "suppressed_by_cooldown" | "sent" | "send_failed"` — this sprint's real adapter only ever produces `"disabled"` (feature is off) or `"no_adapter_configured"` (if ever called while off); `"sent"`/`"send_failed"` are specified now so a future real adapter doesn't need a type change.

### 3. Simplified automation status view (this session, NOT wired into the live admin page)
- A pure formatter combining the already-existing `AutomationStatusSnapshot` (from `automationStatus.ts`) and `ScheduledWriterSourceActivity[]` (from `writerCandidateActivity.ts`) into one `OperationalHealthSummary`: a single top-line severity + a short list of per-source verdicts. Built and unit-tested this session as a new presentational component (`OperationalHealthPanel`), but **deliberately not inserted into `/admin/sources/page.tsx` this session** — wiring a new component into the live admin page is integration work best done as its own reviewed step (166D-2), not bundled into a "foundation" sprint whose whole point is zero behavior change to anything already deployed.

### 4. Email alert foundation, default OFF (this session)
- `NotificationAdapter` interface (`send(notification): Promise<{ok: boolean; status: NotificationStatus}>`) plus `createNoopNotificationAdapter()` — the only implementation this sprint provides. It never imports `fetch`, never imports an email SDK (none exists in `package.json` and none is added), and always returns `{ok: true, status: "disabled"}`. Enabling real delivery in the future requires: (a) explicit approval to add an email-provider npm package, (b) a new server-only env var (e.g. `ALERT_EMAIL_NOTIFICATIONS_ENABLED`, `ALERT_EMAIL_...` credentials) that this sprint does **not** define, read, or reference anywhere — the OFF state here is structural (no code path to send), not merely a flag defaulting to false.

### 5. Email content template (this session, never sent)
- `buildAlertEmailContent(input): { subject: string; textBody: string }` — pure function, Polish text, using only the same non-secret fields `AutomationStatusSnapshot`/run-history rows already expose (source name, category, severity, retry state, admin-action-required reason). No provider call, no recipient address, no secret anywhere in this file.

### 6. Deduplication and cooldown (this session)
- `buildAlertFingerprint(sourceKey, category, environmentTag): string` — deterministic, collision-safe-enough string key (not a cryptographic hash requirement — matches the existing project convention of plain deterministic string composition, e.g. `writerCandidateActivity.ts`'s own key style).
- `isWithinCooldown(lastAlertSentAt: string | null, now: Date, cooldownMs: number): boolean` — pure, injectable clock (same testing pattern as `isRunLockHeld`). No storage is implemented this sprint — a future sprint would need a small persisted "last alert sent per fingerprint" table (see §I below), which does not exist yet.

### 7. Retry information surfaced to the admin (this session, formatting only)
- Answers, from already-known/derivable facts only: how many attempts were made this run (1 or 2, from the existing retry wrapper's contract), whether a same-run retry already happened, and — honestly, since no cron exists — that there is no known next scheduled attempt yet. `AdminActionRequired` separately flags when a human should look (permanent failure, stuck lock, credentials missing), independent of whether a retry occurred.

### 8. Temporary source auto-disable (design only this session — NOT implemented)
- Design: after N consecutive `permanent_fetch` or `write_error` outcomes for the same source (tracked via `scheduled_writer_runs` history, once a per-source column or a companion table exists — today's table only tracks aggregate counts per run, not per-source outcomes), the source would be excluded from `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` resolution automatically, with the exclusion itself visible in the admin panel and reversible only by an admin.
- **Explicitly out of scope to implement this session**: it requires either a schema change (a per-source failure-streak column, or a new table) or, at minimum, wiring a live read of `scheduled_writer_runs`/per-source history into a new decision path in the write route — both are live-behavior changes, forbidden by this session's rules. Flagged as a candidate for Sprint 166D-2 or later, contingent on Adam's explicit approval and a proposed (not executed) SQL file.

### 9. Tests (this session)
- New `tests/e2e/*.spec.ts` files (Playwright pure-function style, matching the existing convention exactly) for every module in §1–§7: taxonomy mapping correctness, classifier decision table (every `RunOutcome`/diagnostic combination), no-op adapter never performs I/O and always reports `disabled`, email template contains no secret-shaped strings and pins its Polish copy (anti-drift, matching `sourceHealth.ts`/`automationStatus.ts`'s existing copy-pinning convention), fingerprint determinism (same inputs → same fingerprint; different source/category → different fingerprint), cooldown boundary values (exactly at threshold, just under, just over, `null` last-sent).

## H. Explicitly NOT done this session

- No Vercel Cron entry added or modified.
- No kill switch changed anywhere.
- No SQL executed against any Supabase project, no migration file proposed for the auto-disable feature (design only, §8).
- No npm package added (no email SDK).
- No environment variable added, read, or referenced for alerting (the OFF state is structural, not a flag).
- No component wired into the live `/admin/sources` page — `OperationalHealthPanel` exists and is tested standalone only.
- No message sent, no recipient address ever referenced.
- No Preview or Production data read or written.
- No merge to `main`.

## I. Next manual approval points (for 166D-2 or later, each separate)

1. Wiring `OperationalHealthPanel` into `/admin/sources/page.tsx` (pure UI integration, no new data source — lowest-risk next step).
2. A persisted "last alert sent per fingerprint" store (new table + proposed, not-executed SQL migration) to make cooldown real across invocations rather than only unit-tested in isolation.
3. Choosing and adding an actual email-sending package/provider + new server-only secrets (explicit approval required per project rules — `AGENTS.md`/`CLAUDE.md` "never add npm packages / never add AI or other secrets without confirmation").
4. Per-source consecutive-failure tracking and temporary auto-disable (§8) — needs its own schema design and approval.
5. Any Vercel Cron entry for `write-candidates` (Stage 6 from 166C) — unrelated to alerting but remains the actual prerequisite for any of this mattering in an unattended context; still untouched.

---

## Automation-alerting readiness — before/after this session

| Component | Before 166D-1 | After 166D-1 |
|---|---|---|
| Error taxonomy | 0% (ad hoc literals scattered across routes) | 100% (closed vocabulary, mapped from every existing literal) |
| Health-state model (retry/admin-action/notification-status types) | 0% | 100% (types only — no live wiring) |
| Deterministic classifier | 0% | 100% (pure function, full decision-table tests) |
| Simplified admin status view | 0% (three separate panels, no combined verdict) | 100% built and tested; 0% wired into the live page (deliberately deferred) |
| Notification adapter | 0% | 100% no-op implementation; 0% real delivery (by design) |
| Email template | 0% | 100% drafted, pinned by tests; 0% ever sent |
| Dedup/cooldown logic | 0% | 100% pure logic tested; 0% persisted (no storage yet) |
| Per-source auto-disable | 0% | design only (~15% — documented, not implemented) |

**Overall Sprint 166D scope: foundation stages (1–7, 9) at ~100% design+code; stage 8 design-only; nothing activated, nothing wired into a live route or page.**
