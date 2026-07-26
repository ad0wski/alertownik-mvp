# Sprint 166P — Day 10: Production Ledger Canary — Audit, Design, Preflight

**Status: audit and design only. NO activation performed. GO/NO-GO: NO-GO.**
This document is the full read-only audit, code analysis, and prepared
runbook for a future first controlled Production canary of the
`operational_notification_events` ledger mechanism. It also documents a
**hard, schema-level blocker** discovered during this audit that makes
activation impossible today, regardless of any flag or Environment
Variable change. No flag was set, no redeploy was triggered, no request
was sent to `ledger-test`, no RPC was called, no SQL was written.

---

## 1. Branch

Created linearly from `main` (`179386d77c074c2352b1a1ff9c58ab95d8a9fd6d`):

```
git checkout main && git pull --ff-only origin main
git checkout -b sprint-166p-production-ledger-canary-v1
```

## 2. GO/NO-GO — stated up front

**NO-GO.** A live Production canary of `POST /api/admin/operational-notification-ledger-test`
would fail today — not because any flag is off (that's the *intended*
default-safe state), but because the two RPC functions the route's claim/
finish cycle depends on, `claim_operational_notification_event` and
`finish_operational_notification_event`, **do not exist in the Production
database at all**. This was found via direct, read-only introspection
(§3) — not inferred from documentation. Every other precondition checked
in this audit is already satisfied (§3); this is the **only** blocker,
and it is a schema-level one, requiring a migration Adam must explicitly
request and run himself, per this project's own standing security rules
(`CLAUDE.md` §"Never change the Supabase schema... without the user
explicitly requesting it").

The good news: the exact migration needed **already exists**, already
written, already reviewed, and already proven byte-for-byte equivalent to
what's live on Preview — `docs/sql/PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql`.
It was written in an earlier sprint but never executed against Production.
Nothing new needs to be designed; it only needs Adam's explicit go-ahead
to run it.

## 3. Read-only preflight — full results

| Check | Result |
|---|---|
| `main` hash | `179386d77c074c2352b1a1ff9c58ab95d8a9fd6d` |
| `origin/main` hash | identical |
| Working tree | clean (only pre-existing untracked `.vscode/`) |
| Current Production deployment | Ready, commit `179386d`, domain `alertownik-mvp.vercel.app` |
| `POST /api/admin/operational-notification-ledger-test` route exists | ✅ yes (`src/app/api/admin/operational-notification-ledger-test/route.ts`) |
| RPC `claim_operational_notification_event` exists in Production | ❌ **NO** — `information_schema.routines` returns zero rows |
| RPC `finish_operational_notification_event` exists in Production | ❌ **NO** — same query, zero rows |
| RPC `open_scheduled_writer_run` / `close_scheduled_writer_run` exist in Production | ❌ **NO** — also zero rows (confirms the entire Sprint 166H RPC migration was never applied, not just the ledger half) |
| `operational_notification_events` table exists in Production | ✅ yes, with exactly one RLS policy: admin-only `SELECT` — **no write policy of any kind**, consistent with a function-only write design that has no functions yet |
| `scheduled_writer_runs` table exists in Production | ✅ yes, same pattern (admin-only `SELECT`) |
| Dedicated Production admin account | ✅ `admin_profiles` has exactly 1 row — Adam's own real account, confirmed/not banned/not deleted (Production doesn't use a separate synthetic admin the way Preview does — the sole real owner account is the admin) |
| Production writer credentials configured in Vercel | ✅ `SUPABASE_SCHEDULED_WRITER_EMAIL` / `SUPABASE_SCHEDULED_WRITER_PASSWORD`, Production scope, present |
| Production writer record(s) in `automation_identities` | ✅ **2** rows (not 1) — both confirmed/not banned/not deleted. Noted as an observation, not a blocker: `getScheduledWriterCredentials()`/`signInScheduledWriter()` only needs the configured email to sign in successfully and be *a* member of this table, which it is either way. Which of the two is the "intended" one isn't determinable without reading the sensitive email value, and isn't necessary for this audit. |
| `checkDatabaseEnvironmentGuard()` four-signal guard | ✅ passing in practice — `SUPABASE_ENVIRONMENT_TAG` and `SUPABASE_EXPECTED_PROJECT_REF` both present for Production scope in Vercel (the route source's own code comments describe an *earlier* sprint's state where these were unset everywhere; that has since changed — confirmed live via Vercel search, not from the stale comment). This is independently corroborated by the writer's own last real run already succeeding (`runHistory.lastClosedRun.outcome: "success"`, 2026-07-25) — that route uses the identical guard. |
| `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` anywhere | ✅ absent everywhere (Vercel search, zero results) |
| `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` / `OPERATIONAL_EMAIL_ALERTS_ENABLED` in Production | ✅ **absent from Production entirely** (not "set to false" — never created there; both exist only under Preview, branch-pinned to unrelated sprints). Functionally equivalent to false under this codebase's exact-string-match convention, but worth stating precisely. |
| `SCHEDULED_WRITES_ENABLED` / `SCHEDULED_CHECKS_ENABLED` in Production | ✅ present, Production scope (values not re-read here — Adam's own confirmed input for this session states both false) |
| Open/claimed `operational_notification_events` in Production | ✅ zero — `one_total=0, one_open=0` |

## 4. Full baseline — Production counters

| Table | Value |
|---|---|
| `operational_notification_events` — total | 0 |
| `operational_notification_events` — open/claimed (`claimed_at` set, `finished_at` null) | 0 |
| `scheduled_writer_runs` — total | 1 |
| `scheduled_writer_runs` — open | 0 |
| `source_notice_candidates` | 3 |
| `source_checks` | 2 |
| `alerts` | 6 |
| `automation_identities` | 2 |
| `admin_profiles` | 1 |

Most recent timestamps (all predate today, confirming no background
activity): last alert `2026-07-06`, last candidate `2026-07-25`, last
source check `2026-07-12`, last writer run `2026-07-25`.

## 5. Code analysis — exactly what the route does

Read directly from `src/app/api/admin/operational-notification-ledger-test/route.ts`
(unchanged since Sprint 166N-B; this audit did not modify it):

1. `requireAdminSession()` — first line, unconditional. No unauthenticated
   or non-admin caller reaches anything past this.
2. `checkDatabaseEnvironmentGuard()` — Layer 0, the four-signal guard
   (§3). Confirmed passing for Production today.
3. `isOperationalNotificationLedgerTestEnabled(process.env.OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED)` —
   exact-string `"true"` match, own dedicated flag, currently absent
   everywhere → route returns `{ ok: true, status: "disabled" }` and stops
   if ever hit today.
4. `getScheduledWriterCredentials()` + `signInScheduledWriter()` — requires
   both Production writer env vars (present) and a successful sign-in
   against one of the 2 `automation_identities` rows (present).
5. `claimEventForSending()` → **would call the missing RPC** →
   `client.rpc("claim_operational_notification_event", ...)` returns a
   Postgres "function does not exist" error → `createSupabaseOperationalNotificationLedger.claim()`
   throws `Error("operational_notification_claim_failed")` → caught by the
   route's outer `try/catch` → response `{ ok: false, error: "Nieoczekiwany błąd." }`,
   HTTP `503`. **No row is ever written** — the `INSERT` lives entirely
   inside the missing RPC body; there is no fallback direct-table write
   anywhere in this code path (confirmed: `operationalNotificationLedgerSupabase.ts`
   only ever calls `.rpc()`, never `.from(...).insert()`).
6. Even if the RPC existed and claim succeeded: `createConfiguredNotificationAdapter()` →
   `decideNotificationAdapterKind()` checks `isEmailAlertsEnabled(process.env.OPERATIONAL_EMAIL_ALERTS_ENABLED)` —
   absent in Production → **always returns `"noop"`** → `createNoopNotificationAdapter()`
   is used, which the codebase's own tests already prove performs zero I/O
   and always reports `"disabled"`. **No email is ever sent and no HTTP
   request to Resend is ever made** — this is structurally guaranteed by
   the adapter factory's own decision function, not merely by the flag
   being false; even a bug elsewhere in the route could not reach Resend
   without `OPERATIONAL_EMAIL_ALERTS_ENABLED=true` being set first, which
   this canary's own scope explicitly never does.
7. `finalizeOperationalNotificationEvent()` → would call the (also
   missing) `finish` RPC.

**Answering the audit's specific questions:**

- **Flags required to reach any behavior beyond `"disabled"`:** exactly
  one — `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true`. Nothing else
  needs to change; `OPERATIONAL_EMAIL_ALERTS_ENABLED` and
  `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` are both irrelevant to this
  specific diagnostic route (it never checks the runtime flag, and only
  the adapter factory checks the email flag, always safely).
- **Event that would be created (if the RPC existed):** `event_type: "unexpected_error"`,
  `channel: "email"`, `severity: "info"`, `scopeKey: "ledger-test"`,
  `safe_summary`: the fixed Polish diagnostic string
  ("Diagnostyczny test ledgera operacyjnego (Sprint 166N) — nie jest to
  prawdziwy incydent."), `scheduled_writer_run_id: null`, `source_id: null`.
- **Fingerprint that would be used:** `${environmentTag}:ledger-test:unexpected_error`
  — see §6 for the concrete Production value and collision analysis.
- **Tables that could change (if the RPC existed):** exactly one —
  `operational_notification_events` (one `INSERT` via claim, one `UPDATE`
  via finish, same row). Nothing else — the route never imports
  `writeCandidatesForSource`, never touches `source_notice_candidates`,
  `alerts`, or `scheduled_writer_runs` (confirmed: no import of any writer
  or Builder helper anywhere in this file).
- **Maximum expected counter increase (if the RPC existed and this
  canary were ever run):** `operational_notification_events` **+1**, every
  other table **+0**.
- **Alert publication:** impossible — this route never imports
  `writeCandidatesForSource` or any Builder/publish path.
- **Email/Resend with `OPERATIONAL_EMAIL_ALERTS_ENABLED=false`:**
  structurally impossible per §5.6 above — `decideNotificationAdapterKind()`
  always returns `"noop"` before any Resend client is even constructed.
- **Claim/finish count:** exactly one of each, by construction — the route
  calls `claimEventForSending` once and `finalizeOperationalNotificationEvent`
  once, unconditionally, with no loop or retry anywhere in this file.
- **No event can remain open/stale-claimed:** the route's own code path
  always reaches `finalizeOperationalNotificationEvent` synchronously
  after a successful claim, in the same request — there is no `await`
  gap where the process could be killed leaving a claim orphaned, other
  than a genuine process crash (covered as a named failure scenario, §8).
  The ledger's own `claim` RPC also has a 6-hour cooldown and a
  stale-claim self-heal path (any prior `claimed` row older than
  `p_stale_claim_after_seconds`, default 300s, is auto-abandoned by the
  *next* claim attempt) — belt-and-suspenders even in a worst case.

## 6. Fingerprint collision check — Preview vs. Production

The fingerprint is `buildOperationalNotificationFingerprint(environmentTag, "ledger-test", "unexpected_error")`
= `${environmentTag}:ledger-test:unexpected_error` (`src/lib/operationalNotificationPolicy.ts`).
`environmentTag` comes from `getConfiguredDatabaseEnvironmentTag()`, which
reads `SUPABASE_ENVIRONMENT_TAG` and resolves it through
`resolveEnvironmentIdentity()` — a closed-vocabulary resolver already
used everywhere else in this codebase to produce exactly `"preview"` or
`"production"` (never a raw/arbitrary string).

- **Preview's actual canary fingerprint** (observed live, Sprint 166O-D):
  `preview:ledger-test:unexpected_error`.
- **Production's fingerprint would be:** `production:ledger-test:unexpected_error`.
- **Collision risk: none.** The two strings differ in their first segment,
  and the ledger's own uniqueness constraint
  (`operational_notification_events_one_claim_per_scope`, a partial unique
  index on `(environment_tag, fingerprint) where status = 'claimed'`) is
  itself scoped by `environment_tag` as a real column, not merely as part
  of the fingerprint string — even a hypothetical fingerprint collision
  would not cross environments, because Preview and Production are
  entirely separate Supabase projects/databases in the first place (no
  shared table to collide in). No new/alternate fingerprint scheme is
  needed; the existing deterministic one is already environment-safe by
  construction.
- **The old, unrelated Production row** (if any manual test rows exist):
  none — Production's `operational_notification_events` is confirmed
  empty (§4), unlike Preview which retained one older manually-created row
  from Sprint 166F-2B with an unrelated fingerprint format.

## 7. Prepared runbook — one Production canary (NOT executed; blocked on §2)

This is the exact sequence for a future turn, **once the RPC migration
(§2) has been applied and separately confirmed** — written now so no
design work remains once that precondition clears.

1. **Preflight** (repeat §3's live checks — RPC existence must now read
   ✅, everything else should be unchanged).
2. **Set exactly one flag:** `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true`,
   **Production scope only**, no branch-pinning (Production has no branch
   concept the way Preview does — this applies to the `main`-tracked
   Production environment directly). Every other flag stays exactly as-is.
3. **Exactly one redeploy** of the current Production deployment (via the
   Deployments list's "..." → Redeploy on the correct row — never the
   save-toast's Redeploy button, per this project's own established,
   repeatedly-confirmed trap where that button can default to the wrong
   environment). Wait for Ready.
4. **Fresh preflight after redeploy:** confirm flag picked up (no direct
   way to observe this without the one POST — confirmed instead via
   `automation-status` still showing no "ledger" mention, since this flag
   doesn't surface there either, consistent with Preview's own precedent),
   admin session still valid, endpoint still `GET` → `405`.
5. **Exactly one authenticated `POST`** to
   `/api/admin/operational-notification-ledger-test`, from the existing,
   already-logged-in Production admin session (§9) — its `access_token`
   read from `localStorage` programmatically, never displayed/logged/
   copied. Zero retry, regardless of response.
6. **Immediate rollback:** delete
   `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` from Production scope.
7. **Exactly one rollback redeploy.** Wait for Ready.
8. **Compare counters before/after** (same method as §4): expect
   `operational_notification_events` **+1**, everything else **+0**.
9. **Inspect the specific new row:** `fingerprint = "production:ledger-test:unexpected_error"`,
   `status` terminal (`"abandoned"`, matching Preview's own canary result,
   since `OPERATIONAL_EMAIL_ALERTS_ENABLED` will still be absent/false),
   `claimed_at` and `finished_at` both set, no gap suggesting a stale
   claim.
10. **Confirm:** no email/Resend contact (structurally impossible per
    §5.6), no new/changed row in any other table, `LEDGER_TEST` flag
    absent again (Vercel search), endpoint `GET` → `405` again.

## 8. Failure scenarios and minimal rollback (not executed — reference only)

| Scenario | Detection | Minimal rollback |
|---|---|---|
| Response `401`/`403` | Session expired or not admin | No system state changed (guard rejects before any write) — nothing to roll back; re-establish a valid admin session before retrying (still counts as zero attempts against the "exactly one POST" budget, since no claim occurred) |
| Response `405` | Wrong HTTP method used by mistake | No state changed — route never reached past method routing |
| Response `500`/`503` (e.g. environment guard or RPC failure, exactly the failure mode this audit predicts today) | Body is a generic closed-vocabulary message, never a stack trace | Delete the flag, one redeploy — same as the normal rollback (steps 6-7); no event was ever created, so no further cleanup needed |
| No event created despite a `200`/success-shaped response | `operational_notification_events` count unchanged after §8 comparison | Investigate before any further action — this would indicate an unexpected code path; do not retry; delete flag, redeploy, then read (not write) the ledger's exact response to understand why |
| Event remains `claimed` (no `finished_at`) | Direct `SELECT` on the one new row shows `finished_at IS NULL` | The ledger's own 6-hour cooldown and stale-claim self-heal (§5) already bounds this automatically; if immediate correction is wanted, the *only* acceptable action is deleting the flag and redeploying — never a manual `UPDATE` on the row (that would be exactly the "SQL zapisujący" this turn's constraints and the standing MCP rules forbid) |
| Unexpected increment in any other table (`scheduled_writer_runs`, `source_notice_candidates`, `alerts`, `source_checks`) | §8 counter comparison shows a nonzero delta anywhere but `operational_notification_events` | Stop immediately, do not attempt further diagnosis via write actions; delete flag, redeploy, then investigate read-only — this would mean the code no longer matches this audit's own analysis (§5), a genuinely unexpected finding worth pausing the whole canary program over, not just this one attempt |
| Unexpected contact with Resend (e.g. a delivery/webhook log appears) | Resend's own dashboard, checked read-only, outside this codebase | Should be structurally impossible per §5.6; if it ever happened it would mean `OPERATIONAL_EMAIL_ALERTS_ENABLED` was somehow true, which this runbook never sets — treat as a critical, standalone incident, not a canary-specific failure; delete flag, redeploy, and stop the whole program pending investigation |
| Session/browser crash or interruption after the flag is set but before the POST, or after the POST but before rollback | The flag would still show as `true` in a subsequent Vercel check | Resume exactly at whichever step was interrupted — never re-send the POST if it's unclear whether it already succeeded (check `operational_notification_events` read-only first to see if a row already exists for `production:ledger-test:unexpected_error` before deciding); always still complete the rollback (steps 6-7) as the very next action once resumed |

## 9. Production admin session check (read-only only, this turn)

- `GET /admin/sources` on `alertownik-mvp.vercel.app` → loads fully under
  an **already-existing** authenticated session in this browser
  (`sb-puhcjyffosgohbmxrczb-auth-token` — correct Production project ref).
  This session was not created by this turn's work; it predates it.
- `GET /api/admin/automation-status` (authenticated, using that existing
  session's own token) → `200`: `writesEnabled: false`,
  `writeAttemptsPossible: false`, `cronSecretConfigured: true`,
  `writerCredentialsConfigured: true`, `operationalNotificationRuntimeEnabled: false`,
  `emailAlertConfig.enabled: false`, `runHistory.openRun: null`. No
  mention of "ledger" anywhere in the response.
- **No `POST` was sent to `ledger-test`** — confirmed by direct review of
  every network call this turn; the only calls made were the two `GET`s
  above plus the earlier read-only `information_schema`/`pg_policies`
  queries via MCP (read-only by the tool's own configuration).

## 10. Tests

This turn's change is documentation-only (this file, plus a new,
otherwise-empty branch) — zero `src/` or `tests/` files were touched.
Per this session's own standing rule, a full suite re-run was not
performed. Confirmed via `git diff main --stat` equivalent (this branch
vs. `main`) that only this one new doc file differs.

## 11. Risk to users

**None.** Every check this turn was read-only or local (SQL introspection,
file reads, two authenticated `GET`s, one new git branch, one new
documentation file). No Environment Variable, RLS policy, schema, or
Production data was touched. Public and admin users experience zero
change — nothing was deployed differently, nothing was activated.

## 12. Success and STOP criteria (for the future activation turn, not this one)

**Success criteria** for the eventual canary itself: exactly one `POST`
sent; response is `200`/`{"ok":true,"status":"abandoned"}` (matching
Preview's own proven result); exactly one new
`operational_notification_events` row with the exact predicted
fingerprint and a terminal, non-open status; zero change in every other
table; flag successfully removed and reconfirmed absent; endpoint
reconfirmed fail-closed afterward.

**STOP criteria** (abort before the POST, or halt immediately after
rollback without further investigation attempts) — any of:
- The RPC-existence precondition (§2) is not yet met.
- Any preflight check in §3 that previously passed now fails.
- The admin session cannot be confirmed live and correctly-scoped
  immediately beforehand.
- Any Environment Variable other than the one canary flag shows signs of
  having changed since this audit.
- Production counters (§4) show any drift from this baseline at the
  moment of the future preflight.

## 13. What Adam needs to do manually before this can proceed

1. Review `docs/sql/PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql`
   (already written, already reviewed once before, unchanged).
2. Explicitly request that this migration be applied to Production, and
   run it himself (per this project's own standing rule: schema changes
   are written to `docs/` for manual execution, never run automatically
   by Claude) — or explicitly direct Claude to apply it via the
   `apply_migration` MCP tool, which would be the first time this
   session's MCP access is used for a write, requiring its own separate,
   explicit approval.
3. After the migration, run
   `docs/sql/VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql`
   (already exists) to confirm the result — the migration file's own
   final comment already says exactly this.
4. Only then does Day 10's prepared runbook (§7) become executable in a
   future turn, under its own separate explicit approval for the
   activation step itself.
