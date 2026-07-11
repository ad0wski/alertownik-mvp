# Scheduled Writer RLS Deployment Result v1

**Sprint 146 — Controlled RLS Deployment.** This document records what
was actually applied to the live Supabase project and the result of
verifying it — as distinct from
`docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md` (the plan) and
`docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql` (the proposed
SQL), both of which predate execution.

**Status: applied and verified.** Adam ran
`docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql` manually in the
Supabase SQL Editor, then ran
`docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql` and supplied the
full live results for review.

---

## Verdict: MIGRATION VERIFIED ✅

Every check below was confirmed against the actual live query results,
not assumed from the proposal alone.

### `public.automation_identities`
- Exists, with exactly the designed shape: `user_id uuid not null`
  (references `auth.users(id)`), `created_at timestamptz not null
  default now()`.
- RLS enabled (`rls_enabled = true`, `rls_forced = false`).
- Exactly one policy: self-row `SELECT` only
  (`auth.uid() = user_id`) — no `INSERT`/`UPDATE`/`DELETE` policy exists
  for any role.
- No `anon` access of any kind (`REVOKE ALL ... FROM anon` confirmed —
  zero grant rows for `anon`).
- No self-registration path: no policy and no grant permits any
  authenticated session to insert its own row.
- Not connected to `alerts` administration in any way — no `alerts`
  policy references this table, and this table grants nothing on
  `alerts`.

### `public.admin_profiles`
- Unchanged. Confirmed byte-for-byte identical to the Sprint 144
  live-audit record — the single self-row `SELECT` policy is untouched.
  Remains the existing, sole administrator-membership mechanism.

### `public.alerts`
- Policies unchanged. Confirmed byte-for-byte identical to the Sprint
  144 live-audit record (the four `admin_profiles`-based admin policies
  + the one public `status = 'published'` policy).
- The scheduled writer receives no access of any kind — no policy on
  `alerts` references `automation_identities`, and no policy was added
  here at all.

### `public.source_notice_candidates`
- The four broad `"Authenticated admins can select/insert/update/delete
  source_notice_candidates"` policies (`auth.role() = 'authenticated'`)
  were fully replaced — confirmed absent from the live policy list.
- Admin retains full CRUD, now via four `admin_profiles`-based policies
  (the same mechanism already proven live for `alerts`).
- The future scheduled writer's policies are live and scoped exactly as
  designed:
  - `SELECT` — for deduplication.
  - `INSERT` only — `WITH CHECK` constrained to `status = 'pending'`,
    `verification_status = 'unverified'`, and every verifier/conversion
    field (`confidence_score`, `risk_level`, `verification_notes`,
    `checked_at`, `duplicate_of_alert_id`, `converted_alert_id`,
    `ai_draft_json`) forced `NULL`.
  - No `UPDATE`, no `DELETE` policy exists for this identity at all.

### `public.source_checks`
- The four broad `"Authenticated admins can ..."` policies were fully
  replaced — confirmed absent from the live policy list.
- Admin retains full CRUD via the same `admin_profiles`-based mechanism.
- The future scheduled writer receives `INSERT` only —
  `WITH CHECK` constrained to `result IN ('no_changes', 'found_notice')`,
  `related_alert_id IS NULL`, `created_by = auth.uid()`.
- No `UPDATE`, no `DELETE` policy exists for this identity.

### Zero remaining broad-`authenticated` policies anywhere
Confirmed across every policy row returned for both tables: no
`auth.role() = 'authenticated'` condition remains on either
`source_notice_candidates` or `source_checks`. The OR-combination risk
this whole effort exists to close (PostgreSQL permissive policies
combine with OR — a narrow policy added beside a broad one restricts
nothing) is resolved because the broad policy itself was replaced, not
merely supplemented.

---

## Minor verified finding: residual grants on `automation_identities`

The applied migration's `REVOKE INSERT, UPDATE, DELETE ON
public.automation_identities FROM authenticated` executed exactly as
written — but Supabase's default project-level grants also included
`TRUNCATE`, `TRIGGER`, and `REFERENCES` for the `authenticated` role,
and the migration's `REVOKE` statement did not name them. Live grant
inspection confirmed `authenticated` retains these three, in addition to
the still-intended `SELECT`.

**Risk: low.** These operations are not exposed through Supabase's
Data API/PostgREST — a client authenticating with a JWT (the only way
this application's code, browser or server, ever talks to the database)
cannot issue `TRUNCATE` or `CREATE TRIGGER`; those require a direct
Postgres connection using the `authenticated` role's credentials, which
this application's architecture never hands out. Even in the
worst case, `TRUNCATE`ing this table only erases membership rows (no
candidate/alert/check data lives here).

**No rollback required.** The migration's core security guarantees
(admin CRUD preserved, scheduled-writer scope exact, zero `alerts`
access, zero broad-policy leftovers) are all independently confirmed and
unaffected by this finding.

**Grant cleanup prepared separately, not executed:**
`docs/sql/PROPOSED_AUTOMATION_IDENTITIES_GRANT_HARDENING_V1.sql` +
`docs/sql/PROPOSED_AUTOMATION_IDENTITIES_GRANT_HARDENING_ROLLBACK_V1.sql`
+ `docs/sql/VERIFY_AUTOMATION_IDENTITIES_GRANTS_READ_ONLY_V1.sql`
(Sprint 147). Recommended before a real scheduled-writer identity is
onboarded, not urgent standalone.

---

## What still does not exist after Sprint 146

- No technical Supabase Auth account.
- No secrets of any kind (`CRON_SECRET`, writer credentials — none
  configured anywhere).
- No server-side database writes (no writer code existed yet at the
  time of this deployment — that came in Sprint 147, still
  default-disabled).
- No active cron, no scheduler of any kind.
- No autopublish path — the migration's scheduled-writer policies grant
  zero access to `alerts` under any condition.

## Approval gate this deployment satisfied

Per `docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md` §11 / the Sprint
145 deployment runbook, Adam approved and applied the RLS/policy
replacement itself. Technical-account creation, environment secrets,
Vercel changes, and enabling server writes remained (and remain)
separate, later approvals.
