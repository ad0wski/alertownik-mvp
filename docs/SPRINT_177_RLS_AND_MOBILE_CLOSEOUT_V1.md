# Sprint 177 — RLS Anon-Read Incident and Mobile Above-the-Fold Closeout

Date: 2026-07-27 (Dzień 9, Sprints 177F–177F-G)

## 1. Original incident

Sprint 177E designed, and Sprint 177F executed on Production, a migration
(`docs/sql/PROPOSED_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_V1.sql`) adding
a new RLS policy, `"Scheduled writer can select alerts for deduplication"`,
on `public.alerts` — intended to let the scheduled writer's own
authenticated session read draft/published/archived alerts for
cross-table deduplication.

## 2. Root cause

The `CREATE POLICY` statement as executed had no `to <role>` clause. In
Postgres, a policy with no explicit role scope applies to `PUBLIC` — every
role, including `anon`. RLS requires evaluating every applicable
permissive policy's condition for a query, and this policy's condition
(`EXISTS (SELECT 1 FROM automation_identities WHERE
automation_identities.user_id = auth.uid())`) requires table-level SELECT
privilege on `automation_identities` for whichever role is evaluating it.
`anon` deliberately has zero grant on `automation_identities` (correct,
by design — that table lists which identities may act as the automation
writer). The result: every anonymous read of `public.alerts` — including
the public homepage's own read of published alerts — began failing with
`42501 permission denied for table automation_identities`.

Symptom confirmed three independent ways: a live browser console error on
`/alerty`, a raw REST call against the Production anon endpoint returning
HTTP 401 with that exact code/message, and a `pg_policies` audit showing
`roles={public}` on the new policy. Five previously-passing tests in
`public.spec.ts` began failing — a correct symptom of the real defect, not
a test or environment problem.

Audit also found three other, already-live, structurally identical
policies sharing the same gap (created in an earlier sprint, before this
one): `"Scheduled writer can insert automated source_checks"` (INSERT,
`source_checks`), `"Scheduled writer can insert pending
source_notice_candidates"` (INSERT, `source_notice_candidates`), and
`"Scheduled writer can select source_notice_candidates"` (SELECT,
`source_notice_candidates`). These were latent (the app never issues anon
requests to those admin-only tables) but shared the identical structural
flaw.

## 3. Why anon was never granted access to automation_identities

`automation_identities` is a minimal membership table (`user_id`,
`created_at`) whose entire purpose is to say which Supabase user IDs are
authorized to act as the scheduled writer. Granting `anon` (or any
non-authenticated session) read access to it would let any site visitor
enumerate which user IDs hold automation privileges — a real widening of
a table deliberately locked down since its creation. PostgREST's own
error hint (`GRANT SELECT ON public.automation_identities TO anon;`) was
explicitly rejected as a fix for this reason.

## 4. Corrective hotfix

`docs/sql/CORRECTIVE_SPRINT_177_SCHEDULED_WRITER_POLICY_ROLE_SCOPE_V1.sql`
— a single transaction that drops and recreates all four affected
policies, identical in every respect except adding `to authenticated`:

| Table | Policy | cmd |
|---|---|---|
| `alerts` | Scheduled writer can select alerts for deduplication | SELECT |
| `source_checks` | Scheduled writer can insert automated source_checks | INSERT |
| `source_notice_candidates` | Scheduled writer can insert pending source_notice_candidates | INSERT |
| `source_notice_candidates` | Scheduled writer can select source_notice_candidates | SELECT |

Executed manually by Adam, exactly once, in the Supabase SQL Editor
(Production), after clipboard exact-match verification. Not re-executed
since. No GRANT/REVOKE statement anywhere in the file — a narrowing of
role scope, not a widening of any grant.

`docs/sql/PROPOSED_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_V1.sql` was
retroactively annotated (not re-run) to record that the version actually
executed lacked `to authenticated`, and to point at the corrective file.

## 5. Read-only VERIFY result (post-hotfix)

- All 4 corrected policies exist exactly once, `roles={authenticated}`.
- Zero remaining `automation_identities`-referencing policies with
  `roles` other than `{authenticated}`.
- `"Public can read published alerts"` unchanged: `roles={anon}`,
  `qual: status='published'`.
- The 4 admin policies on `alerts` unchanged, `roles={authenticated}`.
- `anon` grants on `alerts`/`source_checks`/`source_notice_candidates`
  unchanged (table-level SELECT+INSERT, RLS is the real gate).
- `anon` grants on `automation_identities` unchanged: zero (SELECT,
  INSERT, UPDATE, DELETE all false).
- `automation_identities`: 2 columns (`user_id`, `created_at`), 2 rows —
  unchanged.
- RLS enabled on all affected tables, unchanged.

## 6. REST API result — before/after

| | Before hotfix | After hotfix |
|---|---|---|
| `GET .../alerts?status=eq.published` (anon) | HTTP 401, code `42501` | HTTP 200 |
| Body | `permission denied for table automation_identities` | 5 real published alerts |
| `GET .../automation_identities` (anon) | 401/`42501` (already denied, correct) | 401/`42501` (still correctly denied) |

`42501`/`permission denied for table automation_identities` is confirmed
gone from the public alerts read path. `automation_identities` remains
correctly inaccessible to anon — the hotfix narrowed scope, it did not
widen anything.

## 7. public.spec.ts — before/after

Before hotfix: 5 tests failing (`toBeVisible` timeouts, "0 aktywnych lub
nadchodzących alertów" states) — a correct symptom of the live defect.
After hotfix: all 5 pass. Full `public.spec.ts`: 76/77 initially (one
new, unrelated failure surfaced — see below), then 77/77 after the
mobile fix.

## 8. Later-surfaced test: mobile above-the-fold (880 > 795)

Once the RLS fix restored real data flow, a previously undetected test —
`Sprint 158A-2 — first active alert card starts with a clear, usable
margin above the fold at 390×844` (`expect(box!.y).toBeLessThanOrEqual(795)`)
— began failing, reproducibly (identical result across repeated runs):
`Received: 880`.

### 9. Main vs. branch comparison

Ran the identical test 3× on a clean, isolated `git worktree` checkout of
`main` (pre-security-fix, commit `3827c22`) and 3× on the security branch
(`f9e80b3`). Both failed identically, 3/3, with the exact same value
(`880`), every time. **Classification: B — pre-existing, data-dependent
main issue.** The security hotfix branch did not cause this and did not
touch any UI/layout code — its diff was scoped entirely to `docs/sql/*`
and one SQL anti-drift test file.

### 10–11. Root cause of the 880px shift

Layout measurement (`getBoundingClientRect()` on Production, real data)
showed the block above the first alert card contains a combined "active
scope + freshness status" box. Its "Nowe albo zmienione w tym tygodniu"
(recently-touched-alerts) line — which only renders when real alert data
has recent activity — did not exist in whatever dataset the 795px
threshold was originally calibrated against in Sprint 163. With the RLS
fix restoring real data flow, this line (plus flex-wrap-induced line
breaks in two adjacent rows at 390px width) pushed the first card down to
880px. This is exactly the kind of content the RLS incident had itself
been suppressing — the "0 active alerts" broken state never triggered
this code path.

## 12. Minimal UI fix

`src/components/AlertList.tsx` — three small, additive, CSS/copy-only
changes, no logic change, no hidden content:

1. The "Nowe albo zmienione w tym tygodniu" line: added `truncate` (single
   line, ellipsis) plus a `title` attribute carrying the full text — the
   alert itself remains fully visible in the list below; this line is a
   supplementary hint, not the primary disclosure.
2. The "Ustaw swoją okolicę..." prompt text and the "X aktywnych lub
   nadchodzących alertów..." count text: `text-sm` → `text-xs sm:text-sm`
   (desktop unaffected via the `sm:` breakpoint).
3. The "Sprawdź najbliższy odbiór odpadów →" link: shortened to "Odbiór
   odpadów →" on mobile only (`sm:hidden`/`hidden sm:inline` pair, full
   text preserved on desktop); its row changed from `flex-wrap` to
   `flex-nowrap` with `truncate min-w-0` on the sibling paragraph so both
   fit on one line without ever causing horizontal overflow.

No touch target was reduced below 44px, no element was hidden, no alert
was hidden, no negative margins were used, no viewport-specific hack was
hardcoded.

## 13. Viewport results after the fix

| Viewport | First card top | Horizontal scroll |
|---|---|---|
| 375×812 | 773.5px | none |
| 390×844 | 773.5px | none |
| 414×896 | 773.5px | none |

All ≤ 795px, comfortably under threshold with margin.

## 14. public.spec.ts / full test results

- `public.spec.ts`: 77/77 passing, including the target test.
- Full suite: 1318/1318 passing (both after the security hotfix and again
  after the mobile fix).
- SQL anti-drift (`automationAlertReadPolicySqlAntiDrift.spec.ts`): 30/30.
- No test was modified, skipped, or had its timeout raised. No threshold
  was changed — the layout was fixed to meet the existing 795px bar.

## 15. typecheck / lint / build

All three clean (0 errors, 0 warnings) after both the security hotfix and
the mobile fix, confirmed independently each time.

## 16. Preview

Both branches (`sprint-177-automation-alert-read-policy-v1` /
`sprint-177-mobile-alert-above-fold-v1`) reached Preview `Ready` on
Vercel before merge. Preview deployment protection (Vercel SSO) blocks
unauthenticated automated smoke tests against Preview URLs directly —
noted as a tool limitation; verification instead relied on the
authenticated browser session (confirming the Preview app renders
correctly with no errors) plus the exact-pixel local Playwright
measurements against the identical commit and the same live Production
data.

## 17–18. Both merges

- Security hotfix: fast-forward merge of `sprint-177-automation-alert-read-policy-v1`
  (`f9e80b3`) into `main`. No merge commit.
- Mobile fix: fast-forward merge of `sprint-177-mobile-alert-above-fold-v1`
  (`fc03071`) into `main`. No merge commit.
- Both pushed to `origin/main` with a normal `git push`; `main` ==
  `origin/main` after each.

## 19. Both Production deployments

- `f9e80b3` — "fix(security): scope scheduled writer policies to
  authenticated" — Production, Ready.
- `fc03071` — "fix(ui): keep first active alert visible on mobile" —
  Production, Ready.

Both confirmed via the Vercel deployments dashboard (project
alertownik-mvp, domain alertownik-mvp.vercel.app, branch `main`, correct
commit hash each time).

## 20. Final policy state

Four scheduled-writer policies, all `roles={authenticated}`:
`Scheduled writer can select alerts for deduplication` (alerts, SELECT),
`Scheduled writer can insert automated source_checks` (source_checks,
INSERT), `Scheduled writer can insert pending source_notice_candidates`
(source_notice_candidates, INSERT), `Scheduled writer can select
source_notice_candidates` (source_notice_candidates, SELECT). Public
anon policy and all four admin policies on `alerts` unchanged throughout.

## 21. Final data state

`alerts`: 5 published rows visible to anon (DW nr 719 ×1, Działkowa ×1,
no duplicates, no drafts visible). `automation_identities`: 2 rows,
2 columns, unchanged throughout this entire sprint sequence.

## 22–26. No side effects

No SQL executed a second time. No new migration beyond the one
corrective hotfix. No Environment Variable changes. Scheduled writer,
Cron, and check-sources were never invoked. No candidate was approved or
created via automation. No alert was published, edited, or deleted by
any automated process. No email was sent. No data was lost — every row
count matched its baseline throughout.

## 27. Anti-drift recommendation

Any RLS policy whose condition references a protected/locked-down table
(here, `automation_identities`) must always carry an explicit `to
<role>` clause scoping it to the intended caller. A policy created
without one silently defaults to `PUBLIC`, and if the same base table is
also readable by `anon` for an unrelated reason (as `alerts` is, for the
public homepage), evaluating the policy's condition for an anon request
can fail with a hard permission error — even though the row-level
condition itself was never meant to apply to anon. Static SQL anti-drift
tests going forward should assert not just "policy references table X
correctly" but "policy is explicitly role-scoped," for every migration
touching a table with mixed anon/authenticated readers.

## 28. Mobile QA recommendation

Above-the-fold layout assertions pinned to a specific pixel threshold
(e.g. `<= 795`) are inherently data-dependent when the measured element's
position depends on variable-length real content (recently-touched alert
titles, category counts, etc.). Future assertions of this kind should
either measure against a fixture/mocked dataset with a stable shape, or
build in explicit tolerance/truncation in the UI itself (as done here)
so real content growth doesn't silently regress the layout. This
incident is a useful case study: a genuine security fix (restoring real
data flow) surfaced a UX issue that had been invisible only because the
underlying bug was suppressing the exact content that exposed it.
