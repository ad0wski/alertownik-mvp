# Sprint 166F-2B — Preview Ledger Validation Checkpoint

Date of test execution: 2026-07-24.

## 1. Project

- Name: `alertownik-preview`
- Project ref: `nowvcdbtgaigutyxpmdp`

## 2. Migration

- File: `docs/sql/PROPOSED_SPRINT_166F_OPERATIONAL_NOTIFICATION_LEDGER_V1.sql`
  (Revision 2, hardened in Sprint 166F-2A).
- SHA-256 of the executed content: `27731faf53032f839c2a6d16317c5dd34e3eaa15bd3c2a7bfb3295e6ae16a89b`
  (18,983 bytes), verified byte-exact against the reviewed file before
  execution.
- Executed **exactly once** against `alertownik-preview`, result: Success.

## 3. Post-migration structural confirmation

- `public.operational_notification_events` exists, `relrowsecurity = true`
  (RLS enabled).
- Exactly one RLS policy present: admin-only `SELECT`, gated by
  `admin_profiles` membership — no direct table grant for any writer-shaped
  role.
- `public.claim_operational_notification_event` and
  `public.finish_operational_notification_event` both exist,
  `prosecdef = true` (SECURITY DEFINER), `search_path` pinned empty.
- Cooldown is a fixed constant of **21600 seconds (6 hours)** — no caller
  parameter exists to change it.

## 4. Controlled concurrency test — safe description

A single synthetic fingerprint
(`sprint-166f-2b-controlled-preview-ledger-test-1`) was used throughout,
with `environment_tag='preview'`, `channel='email'`,
`event_type='transient_fetch'`, `severity='info'`,
`source_id=NULL`, `scheduled_writer_run_id=NULL`, and a `safe_summary`
explicitly stating this was a synthetic Preview test — no real incident,
error, source, or run was referenced anywhere in the test data. The calling
identity was Supabase's own built-in "impersonate a user" feature in the
SQL Editor, confirmed to match the registered automation writer identity
in `automation_identities` (full UUID intentionally not recorded here —
referred to only as "the confirmed active writer identity").

Two separate SQL Editor connections were used to create a genuine
(non-simulated) two-connection race: Card A held an open transaction
(`begin; ...; pg_sleep(12); commit;`) around its `claim` call while Card B
issued a plain `claim` call for the identical scope mid-sleep.

## 5. Card A result

`claimed = true` — the first caller won the claim.

## 6. Card B result

`claimed = false`, `suppressed_reason = 'suppress_duplicate'` — correctly
blocked by the partial unique index
(`operational_notification_events_one_claim_per_scope`) while Card A's
transaction was still open, then failed with `unique_violation` once
Card A committed.

## 7. Exactly one winner confirmed

Yes — read-only verification after both calls confirmed exactly one row
existed for the fingerprint, and it was the row created by Card A's claim.

## 8. Finish result

`finish_operational_notification_event(...)` called **exactly once**, with
`p_status = 'abandoned'`, `provider_status = NULL`, `sent_at = NULL`.
Result: `true`. This status was chosen because no real send or provider
contact ever occurred — `'sent'` would have misrepresented the test, and
`'abandoned'` is a valid value in the function's closed vocabulary
(`'sent' | 'failed' | 'abandoned'`) that matches this codebase's own prior
convention for "a claim was closed without a genuine send attempt."

## 9. Cooldown test result

A further `claim` call for the identical scope, issued after the finish,
returned `claimed = false`, `suppressed_reason = 'suppress_cooldown'`.
Direct inspection confirmed `cooldown_until = claimed_at + interval
'21600 seconds'` exactly.

## 10. Zero active claims confirmed

Read-only check after all test steps: `count(*) where status = 'claimed'`
= `0`.

## 11. No other side effects confirmed

- No email sent.
- No connection to Resend.
- No Cron run (`/api/cron/*` never invoked).
- Production (`alertownik-mvp`) never touched — all steps ran against
  `alertownik-preview` only, confirmed fresh from the project header/URL
  before each phase of testing.
- No real source, real error, or real scheduled-writer run was referenced
  by any test row — all values were either the synthetic fingerprint
  literal or `NULL`.
- No manual `INSERT`/`UPDATE`/`DELETE` was executed outside the two
  approved RPCs — every write-performing action was exactly one `claim` or
  `finish` RPC call, each clicked exactly once by Adam.

## 12. Synthetic record retained intentionally

The one test row (`fingerprint =
'sprint-166f-2b-controlled-preview-ledger-test-1'`, `status = 'abandoned'`)
was deliberately **not deleted** — it is kept as an audit trail of this
test. Deleting it requires a separate, explicit approval from Adam.

## 13. Final result

**PASS.** The atomic claim, duplicate suppression, fixed 6-hour cooldown,
and `finish` status vocabulary all behaved exactly as designed under a
genuine two-connection race.

## 14. Open decisions before runtime integration

- The ledger's RPCs are not yet called from any application code path —
  wiring `claim`/`finish` into the actual scheduled-writer runtime
  (Sprint 166G, not started) is a distinct, separately-approved decision.
- No decision has yet been made about whether/when the `'suppressed'`
  status (reserved, currently unreachable — see
  `docs/SPRINT_166F_OPERATIONAL_ALERT_LEDGER_AUDIT_AND_DESIGN_V1.md` §H.5)
  should ever be written by a higher-level policy layer.
- Production still lacks this migration entirely (and lacks Sprint 166C's
  `scheduled_writer_runs` table, a hard prerequisite) — no Production
  migration timeline has been discussed or approved.

## 15. Do not repeat this test without separate approval

This controlled concurrency/cooldown test must not be re-run — including
partially (a single extra `claim` or `finish` call) — without a fresh,
separate, explicit approval from Adam, matching the discipline used to
approve it the first time.
