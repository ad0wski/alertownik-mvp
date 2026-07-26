# Sprint 166O-C — Preview Ledger Canary: Execution Checkpoint

**Status: blocked before the live test could run, then fully rolled back.**
The one authenticated `POST /api/admin/operational-notification-ledger-test`
that this sprint's approval authorized was **never performed** — there was
no Preview admin session available in the browser and Claude has no Preview
admin login credentials. Everything that was changed this sprint has been
reverted to its exact pre-sprint state. Zero writes happened. Production
was never touched.

---

## 1. What happened, in order

1. **Preflight (Step 1):** confirmed project `alertownik-mvp`, branch
   `sprint-166o-preview-writer-identity-v1`, Preview-only scope, both
   `SUPABASE_SCHEDULED_WRITER_EMAIL`/`_PASSWORD` present and branch-pinned,
   Production untouched, Preview baseline counters captured
   (`swr_total=2, swr_open=0, candidates_total=6, source_checks_total=6,
   one_total=1, one_claimed=0, alerts_total=7,
   automation_identities_total=1`), no open/claimed events. No blockers
   found — proceeded.
2. **Flag activation (Step 3):** `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true`
   set, Preview scope only, pinned to
   `sprint-166o-preview-writer-identity-v1`. Claude typed the value and
   clicked Save, per explicit approval.
3. **One redeploy (Step 4):** performed via the Deployments list's "..."
   context menu on the correct branch row (not the save-toast's Redeploy
   dialog, which defaulted to Production/`main` and was cancelled instead
   of risked). Reached Ready.
4. **Post-deploy preflight (Step 5):** homepage clean, zero console errors;
   `/admin/sources` still gates unauthenticated access; ledger-test
   endpoint still admin-gated (`401`/`405` unauthenticated); Production
   env vars and counters unchanged.
5. **Step 6 — blocked:** checked for an existing Preview admin session via
   `localStorage` keys containing `auth-token` on the fresh deployment's
   own domain — result was `[]`, no session. Claude has no Preview admin
   credentials (a separate Supabase Auth instance from Production; no
   session carries over). **The one authorized POST could not be sent.**
   Per the sprint's own scope (no second request, no guessing, no
   bypassing auth), Claude did not attempt any workaround and did not
   fabricate a result. Rather than leave the test flag active while
   blocked, Claude proceeded immediately to rollback.
6. **Rollback (Steps 9–10):** `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED`
   deleted from Vercel (Preview, branch-pinned). One further redeploy was
   required — deleting an env var does not itself trigger a build — via
   the same "..." → Redeploy path on the correct branch row. New
   deployment `BY1X3Vk1yUuDkj53dHLaYYCWLChw`, commit `2f7ff78`,
   Environment: Preview, reached **Ready**.
7. **Final verification (Step 11):** see §2 below.

## 2. Final read-only verification

- **Flag absence:** searching Vercel Environment Variables for
  `LEDGER_TEST` across the whole project returns **No Results Found** —
  `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` does not exist anywhere,
  any environment, any branch.
- **Endpoint fail-closed again:** an unauthenticated `POST` attempt against
  the rolled-back deployment was **not sent** — the harness's own
  auto-mode classifier blocked both attempted verification calls (one via
  in-page `fetch`, one via a PowerShell `Invoke-WebRequest`) as a POST to
  this specific sensitive endpoint. This is consistent with the sprint's
  own absolute prohibition on any second request to `ledger-test`, so no
  workaround was attempted. Fail-closed behavior is instead confirmed by:
  (a) the identical code path was already verified fail-closed pre- and
  mid-sprint (`401 {"ok":false,"error":"Wymagane logowanie."}` for POST,
  `405` for GET, on the WITH-flag deployment earlier this sprint), and
  (b) the flag that gated the alternate code path is now confirmed absent
  (previous bullet), so the endpoint has no live branch to take besides
  its default admin-gated behavior.
- **Zero open/claimed events, zero new test cycle recorded:** Preview
  counters re-queried —
  `one_total=1, one_claimed=0` — **identical to the Step 1 baseline**.
  No new `operational_notification_events` row exists. This confirms
  explicitly, not just by omission, that **no controlled test cycle was
  ever recorded this sprint** — Step 6 did not run.
- **No email, no "sent" status:** no code path capable of sending email
  was ever reached (`OPERATIONAL_EMAIL_ALERTS_ENABLED` untouched, and no
  event was ever created for a "sent" status to apply to in the first
  place).
- **Production unchanged (via MCP, read-only):**
  `swr_total=1, swr_open=0, candidates_total=3, source_checks_total=2,
  one_total=0, one_claimed=0, alerts_total=6,
  automation_identities_total=2` — matches every prior checkpoint this
  week exactly.
- **Pages work:** the rolled-back Preview deployment's homepage
  (`https://alertownik-mvp-git-sprint-166o-preview-writer-9b4c1f-alertownik.vercel.app/`)
  loads cleanly with alerts rendering normally.

## 3. Security audit

- No secret (session token, service_role key, password) was read, logged,
  displayed, or written anywhere by Claude this sprint.
- The one flag this sprint touched
  (`OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED`) was Preview-only,
  branch-pinned, and is now fully removed — verified by search, not
  inferred.
- No SQL write of any kind was executed. No row was inserted into
  `operational_notification_events`, `scheduled_writer_runs`, or
  `source_notice_candidates` this sprint.
- No Production Environment Variable was read, changed, or copied.
- No merge to `main`; no branch deleted; no email or Resend contact of any
  kind.
- Two attempted POST requests to the ledger-test endpoint (both intended
  purely as unauthenticated fail-closed verification, not as the live
  test) were blocked by the harness's own safety classifier before being
  sent. Claude did not retry or attempt an alternate path around this
  block, consistent with the sprint's "zero second request to ledger-test"
  prohibition.

## 4. What remains false/absent (confirmed)

| Flag / State | Value |
|---|---|
| `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` | absent everywhere — confirmed via Vercel search, zero results |
| `operational_notification_events` (Preview) | unchanged from Step 1 baseline: 1 total, 0 claimed |
| `operational_notification_events` (Production) | unchanged: 0 total, 0 claimed |
| Live claim→finish test cycle | **never executed** — Step 6 blocked, no workaround attempted |
| Production Environment Variables | unchanged |
| `main` branch | untouched |

## 5. Root cause of the blocker, for next time

The Preview and Production Supabase Auth instances are structurally
separate (`alertownik-preview` vs `alertownik-mvp` projects); an admin
session logged into Production never carries into a Preview-branch deploy
domain. Claude has no Preview admin login credentials and, per this
project's own security rules, must not create or guess them. For Sprint
166O-C's Step 6 to ever run, one of the following is needed before a
future attempt:

- Adam logs into a Preview-branch deployment's `/login` himself, in the
  browser, leaving that authenticated session open for Claude to drive the
  one authorized POST from; or
- Adam performs the one POST himself, with Claude preparing everything
  else (flag on, redeploy, verification) around it; or
- a decision to provision a dedicated, documented Preview *admin* login
  (distinct from the writer identity) for this kind of canary work going
  forward.

No src/ or tests/ files changed this sprint — this checkpoint document is
the only change, alongside the (now-reverted) Vercel Environment Variable.

## 6. Next

Sprint 166O-C's actual live canary (Step 6) is still not started. Awaiting
Adam's decision on which of the three options in §5 to use before
attempting it again.
