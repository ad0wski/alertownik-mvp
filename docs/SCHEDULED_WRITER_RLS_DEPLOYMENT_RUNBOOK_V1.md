# Scheduled Writer RLS Deployment Runbook v1

**Sprint 145.** Operational runbook for applying (and, if necessary,
rolling back) `docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql`.

**Status: this runbook describes a future action. Nothing in it has been
executed. No step below has been performed as part of Sprint 145.**

---

## 0. Approval gate — confirm before starting step 1

Per `docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md` §11, applying the
migration below requires Adam's explicit approval of, at minimum, items
1–3 (RLS/policy changes, replacing the broad policies, this specific
migration's SQL). Items 4–8 of that gate (technical account creation,
its `automation_identities` membership, environment credentials, Vercel
changes, enabling server writes) are **not** required to apply *this*
migration — this migration only prepares the authorization layer; no
technical account or writer code exists yet, so those items remain
gated separately for a later sprint.

---

## 1. Pre-deployment checks

- [ ] Confirm the working tree / Supabase project match the state
      recorded in `docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md` and
      the Sprint 144 live-audit findings — re-run
      `docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql` §5–8
      *before* applying anything, and confirm the results match the
      "BEFORE migration" expectations in that file's comments (in
      particular: §5/§6 should still show the four original
      `"Authenticated admins can ..."` policies, not the new ones).
- [ ] Confirm no other pending schema change is queued for the same
      tables (avoid interleaving unrelated migrations).
- [ ] Confirm this is being applied outside of any period where the
      admin urgently needs uninterrupted access (i.e., not moments
      before a time-sensitive publish) — the risk is low (§3 below) but
      not zero, and this is a cheap precaution.

## 2. Database backup / snapshot recommendation

- [ ] Take a Supabase point-in-time-recovery checkpoint or manual backup
      immediately before applying, per Supabase's own project dashboard
      backup tooling. This migration does not delete or modify any
      *data* (only policies), so a backup is precautionary, not because
      data loss is expected — cheap insurance given this touches the
      authorization layer for two operationally important tables.

## 3. Current admin identity verification

- [ ] Run `docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql` §9 —
      confirm exactly one row exists in `admin_profiles`, and that its
      `user_id` corresponds to the expected admin account
      (`ak.jurkowski@gmail.com`, per the Sprint 144 live-audit `auth.users`
      query).

## 4. Confirm current admin is present in `admin_profiles`

- [ ] Already implicitly confirmed: `alerts`' admin policies already
      depend on this exact row (proven live and working today, per the
      Sprint 144 audit) — this migration does not add, remove, or modify
      anything in `admin_profiles`. If step 3 above shows the expected
      row, this is satisfied; no separate action is needed.

## 5. Apply the proposed migration — only after approval

- [ ] Confirm Adam has explicitly approved this specific migration file
      (§0 above).
- [ ] Open `docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql` in
      the Supabase SQL Editor and run it in full, as one transaction
      (the file already wraps itself in `begin;`/`commit;`).
- [ ] Confirm the editor reports success with no error. If any error
      occurs, the transaction automatically rolls back in full — no
      partial state is possible (Postgres DDL transactionality); simply
      investigate the error and do not re-attempt until it's understood.

## 6. Admin re-login / session refresh

- [ ] **Not required for this migration.** Unlike an `app_metadata`/JWT-
      claim-based design, this migration's admin check
      (`exists (select 1 from admin_profiles where user_id = auth.uid())`)
      depends only on `auth.uid()` — which is already present in any
      valid session token and requires no reissuance, no claim
      assignment, and no staleness window. The admin's already-open
      browser session (if any) continues to work immediately after the
      migration commits, with no logout/login step needed. (This is a
      direct, deliberate consequence of choosing to reuse the
      `admin_profiles` pattern rather than introducing `app_metadata` —
      see `docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md`'s live-audit
      follow-up for why that path was chosen.)

## 7. Admin allowed-operation tests

Perform each of the following in the same sitting immediately after
applying the migration, before ending the session:

- [ ] `/admin/sources`: view the source registry (SELECT on
      `alert_sources` — unaffected by this migration, sanity check only).
- [ ] `/admin/sources`: log a manual source check result (INSERT on
      `source_checks` via the admin's session).
- [ ] `/admin/sources`: view check history for a source (SELECT on
      `source_checks`).
- [ ] `/admin/sources`: save a candidate from a source preview (INSERT on
      `source_notice_candidates`).
- [ ] `/admin/queue`: view the candidate list (SELECT on
      `source_notice_candidates`).
- [ ] `/admin/queue`: approve, reject, or archive a candidate (UPDATE on
      `source_notice_candidates`).
- [ ] `/admin/queue`: run the rule-based verifier on a candidate and
      confirm the report saves (UPDATE on `source_notice_candidates` via
      `saveCandidateVerification()`).
- [ ] `/builder`: save a draft and publish an alert (exercises `alerts` —
      unaffected by this migration, sanity check only, confirms nothing
      about this migration accidentally touched it).

If **any** of the above fails, proceed directly to §11–12 (rollback).

## 8. Normal authenticated non-admin denied-operation tests

There is no second real account to test this against today (single-admin
model, confirmed by the Sprint 144 audit) — this row is included for
completeness of the runbook and becomes directly testable once/if a
second authenticated account (e.g. a test account, or the future
technical writer account before it's added to `automation_identities`)
exists:

- [ ] An authenticated session with **no** row in `admin_profiles` and
      **no** row in `automation_identities` must be denied SELECT,
      INSERT, UPDATE, and DELETE on both `source_checks` and
      `source_notice_candidates`. This is the actual proof the migration
      changed anything — today, before the migration, such a session
      would succeed at all of these; after, it must fail all of them.

## 9. Future scheduled-writer allowed-operation tests

Not executable until a technical account exists and is added to
`automation_identities` (a later, separately-approved sprint) — listed
here so the eventual onboarding sprint can copy this checklist directly:

- [ ] SELECT on `source_notice_candidates` succeeds.
- [ ] INSERT on `source_notice_candidates` succeeds when
      `status = 'pending'`, `verification_status = 'unverified'`, and
      every other constrained column (§ migration file SECTION 3) is
      null.
- [ ] INSERT on `source_checks` succeeds when
      `result in ('no_changes', 'found_notice')`,
      `related_alert_id is null`, and `created_by = auth.uid()`.

## 10. Future scheduled-writer forbidden-operation tests

- [ ] INSERT on `source_notice_candidates` with any status other than
      `'pending'` is **rejected** (WITH CHECK failure).
- [ ] INSERT on `source_notice_candidates` with a non-null
      `verification_status`, `confidence_score`, `risk_level`,
      `verification_notes`, `checked_at`, `duplicate_of_alert_id`, or
      `converted_alert_id` is **rejected**.
- [ ] UPDATE on any `source_notice_candidates` row is **rejected**
      (no update policy exists for this identity).
- [ ] DELETE on any `source_notice_candidates` row is **rejected**.
- [ ] INSERT on `source_checks` with `result` outside
      `('no_changes', 'found_notice')` is **rejected**.
- [ ] UPDATE/DELETE on `source_checks` is **rejected**.
- [ ] SELECT/INSERT/UPDATE/DELETE on `alert_sources` is **rejected** (no
      policy of any kind grants this identity anything on that table).
- [ ] SELECT/INSERT/UPDATE/DELETE on `alerts` is **rejected**,
      unconditionally — no policy anywhere references
      `automation_identities` for this table.
- [ ] SELECT/INSERT/UPDATE/DELETE on `admin_profiles` is **rejected**
      (only a self-row SELECT policy exists, and this identity is never
      a member of `admin_profiles`).

## 11. Rollback criteria

Roll back immediately if:
- Any admin allowed-operation test in §7 fails.
- The migration transaction reports an error partway through (though
  this should self-rollback automatically — verify it actually did, via
  `docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql`).
- Any unexpected policy, grant, or table state is observed that doesn't
  match this package's documented expectations.

## 12. Exact rollback sequence

- [ ] Run `docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_ROLLBACK_V1.sql` in
      full, in the Supabase SQL Editor.
- [ ] Run `docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql` again —
      confirm `source_checks`/`source_notice_candidates` show the
      original four `"Authenticated admins can ..."` policies each, and
      re-run every §7 admin allowed-operation test to confirm recovery.
- [ ] Do not re-attempt the forward migration until the root cause of
      the failure is understood and, if needed, the migration file
      itself is corrected and re-reviewed.

## 13. Immediate kill-switch plan

This migration has no interaction with the scheduled-checks kill switch
at all — `SCHEDULED_CHECKS_ENABLED` remains unset, and the dry-run
endpoint (`/api/cron/check-sources`) remains inert regardless of this
migration's outcome. There is no "kill switch" specific to this RLS
change beyond the rollback file itself (§12) — policy changes don't have
a separate runtime flag; the rollback SQL *is* the kill switch for this
layer.

## 14. Credential revocation plan

Not applicable to this migration — no credential of any kind is created
by it (no technical account, no password, no `CRON_SECRET`). Once a
future sprint creates the technical account and its credentials, that
sprint's own runbook governs their revocation/rotation (already designed
in `docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md` §9).

## 15. Statement: cron remains disabled

Confirmed. No `vercel.json`, no scheduler configuration, and no
`SCHEDULED_CHECKS_ENABLED` value exists anywhere as a result of this
migration or this sprint. Applying this migration changes nothing about
whether any scheduled job runs — none does, before or after.

## 16. Statement: server writes remain disabled

Confirmed. No application code was added or changed in Sprint 145. The
migration prepares the *authorization layer* a future writer would use —
it does not create the writer itself, and no code in this repository
performs a write to any of these tables outside the existing,
browser-session-driven admin flows.

## 17. Statement: autopublish remains nonexistent

Confirmed. No policy in this migration grants any identity other than an
`admin_profiles` member any access to `alerts` — the scheduled writer has
zero access to that table under this design, and no code path anywhere
in this repository automatically sets a candidate's status to
`approved`, `converted_to_draft`, or `published`, or writes to `alerts`
directly. Publishing remains the single manual action it has always
been, in Builder, gated by the admin's own session.
