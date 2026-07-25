# Sprint 166L-A/B — Production Environment Guard: Audit, Plan, and Activation

**Status: FAZA B is now ACTIVE.** Adam gave explicit, scoped approval
(see §7) and Sprint 166L-B has been executed: `SUPABASE_ENVIRONMENT_TAG=production`
and `SUPABASE_EXPECTED_PROJECT_REF=puhcjyffosgohbmxrczb` are now set in
Production scope only, and a fresh Production deployment picked up the
change. See §9 for the activation checkpoint. No SQL has been executed.
No writer, RPC, Cron, claim/finish, email, or Resend action has occurred.
Every other flag (`SCHEDULED_WRITES_ENABLED`,
`OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`, `OPERATIONAL_EMAIL_ALERTS_ENABLED`,
writer credentials) remains false/absent in Production, unchanged.

This document is the direct successor to the Sprint 166K-D runbook
addendum's FAZA B — it re-verified that phase's premises with a fresh,
independent read-only pass before the real change, and surfaced one new
finding FAZA B's original text did not have.

---

## 1. Scope

Day 4 opens with exactly one goal: prepare FAZA B (environment guard and
metadata) for a future, separately-approved activation. This document:
- re-confirms the live Production state with a fresh read-only audit
  (Vercel Environment Variables — names/scopes only; Vercel deployments;
  Vercel domains; a minimal, safe Supabase read),
- reports one new, material finding not previously documented,
- specifies the exact values FAZA B would set, their scope, and why,
- specifies verification that requires **zero** live Production requests,
- specifies rollback,
- adds a static test pinning the plan's internal consistency.

Nothing here activates anything. Setting the two variables for real is
Sprint 166L-B (or later), and requires Adam's own separate, explicit
approval — see §7's exact confirmation text.

## 2. Fresh read-only audit (2026-07-26)

### 2.1 Vercel — `alertownik-mvp` project, Environment Variables

Re-ran the same names/scopes-only check as Sprint 166K-D's audit, two
days later. **No drift.** Production still has exactly:

| Variable | Scope |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production (separate entry also exists for Preview) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production (separate entry also exists for Preview) |
| `SCHEDULED_CHECKS_ENABLED` | Production (drives only the existing zero-write `check-michalowice` Cron) |
| `CRON_SECRET` | Production |
| `ANTHROPIC_API_KEY` | Production and Preview (unrelated — AI draft generator) |

`SUPABASE_ENVIRONMENT_TAG` and `SUPABASE_EXPECTED_PROJECT_REF` exist —
but **only in Preview scope** (added 2026-07-21, as part of Sprint 165B's
Preview environment-guard work). Production has neither. Every other
automation variable (`SCHEDULED_WRITES_ENABLED`, writer credentials,
`OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`, all email/Resend variables,
`SCHEDULED_WRITER_ALLOWED_SOURCE_IDS`/`SCHEDULED_WRITER_SOURCE_REGISTRY_IDS`/
`SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN`/`SCHEDULED_WRITER_FINGERPRINT_ENABLED`)
remains Preview-only or branch-scoped, exactly as Sprint 166K-D recorded.

### 2.2 Vercel — deployments and domain

- Current Production deployment: commit `1e9380bc80964752bd2157fc75222646f7edc31c`,
  `main`, status **Ready** — matches the exact hash `main` fast-forwarded
  to at the close of Day 3.
- Domain: exactly one, `alertownik-mvp.vercel.app`, assigned to
  Production. No custom domain, no additional environment-scoped domain
  aliasing to reason about.

### 2.3 Supabase — `alertownik-mvp` Production project (project ref `puhcjyffosgohbmxrczb`)

Read-only only, and only after independently confirming this project ref
via its own **public-facing data** — not by trusting the MCP connection's
name (which is a known-misleading label; see
`SPRINT_166G_PREVIEW_RUNTIME_VALIDATION_CHECKPOINT_V1.md` §7). Queried
`public.alerts` and found real, non-synthetic titles (e.g. "Przerwa w
dostawie ciepła i ciepłej wody w Pruszkowie", real WKD schedule notices) —
no `[SYNTHETIC PREVIEW]` markers anywhere, which is the actual
distinguishing signal between the two projects (Preview's seed data is
always marked `SYNTHETIC`). This positively confirms the connection is
Production, independent of the connection's own label.

Schema/ACL state matches the Sprint 166J-A checkpoint exactly:
`scheduled_writer_runs` — 0 rows, RLS enabled. `operational_notification_events`
— 0 rows, RLS enabled. Both tables and all four RPC functions present.

### 2.4 New finding — `automation_identities` already has one row in Production

**Not previously documented in any Sprint 166H/166J/166K checkpoint.**
`public.automation_identities` (Production) contains exactly one row:
`user_id` ending `...da746`, `created_at = 2026-07-11 15:22:26 UTC` — a
date that predates every Sprint 166-series checkpoint this project has on
record (the earliest, Sprint 166A, is dated after this). No email,
password, or any other credential-adjacent value was read — only the
`user_id` UUID and the timestamp, both non-sensitive metadata already
covered by this table's own comment ("Populated exclusively via direct
SQL/dashboard action by a human operator").

**This finding is neutral to Sprint 166L-A's own scope** (Layer 0, the
environment guard, is fully independent of Layer 3, the writer identity —
setting `SUPABASE_ENVIRONMENT_TAG`/`SUPABASE_EXPECTED_PROJECT_REF` neither
depends on nor affects this row). It is surfaced here because Sprint 166K-D's
FAZA C explicitly assumed writer-identity provisioning "has not been
started" in Production, and this row means that assumption was not fully
accurate — either this is a legitimate, older, undocumented provisioning
step from before the current phased-rollout discipline existed, or it is
stale/orphaned data. **Not deleted, not investigated further, not acted on
in any way** — this is Adam's own decision to make (confirm what it is,
decide whether to keep or remove it) before FAZA C is ever opened as a
sprint. Recommend: when FAZA C is eventually opened, its first step should
be confirming what this specific row is, not assuming a clean slate.

## 3. FAZA B — exact values, scope, and rationale

| Variable | Planned value | Scope |
|---|---|---|
| `SUPABASE_ENVIRONMENT_TAG` | `production` | **Production only** — never Preview, never a specific branch |
| `SUPABASE_EXPECTED_PROJECT_REF` | `puhcjyffosgohbmxrczb` | **Production only** |

Both values are drawn directly from code that already exists and is
already tested: `resolveEnvironmentIdentity()` (`src/lib/environmentIdentity.ts`)
accepts exactly `"production"`, `"preview"`, or `"development"` — any
other string resolves to `"unknown"` and fails the guard. `puhcjyffosgohbmxrczb`
is Production's own, already-public project ref (visible in its own
`NEXT_PUBLIC_SUPABASE_URL`, which ships to every browser — this is not a
secret; see `docs/SPRINT_166H_PRODUCTION_ROLLOUT_RUNBOOK_V1.md` line 9,
already committed and merged before this sprint).

### Why Production scope only, never broader

Setting these in Preview scope, or unscoped ("all environments"), would
risk exactly the cross-environment confusion the guard exists to prevent
— see `databaseEnvironmentGuard.ts`'s own header on why four independent
signals, not two, are required. Preview already has its own correct,
independent values (added 2026-07-21) that must never be touched by this
sprint.

### Does this require a new deployment?

**Yes, treat it as requiring one.** Next.js Route Handlers read
`process.env` at request time, so in principle an already-running
serverless function instance could pick up a changed value without a
redeploy — but Vercel's own documented behavior is that Environment
Variable changes take effect on the *next deployment*, not retroactively
on already-built functions. Per FAZA B's original text: no code change is
needed, but a fresh deployment is "the safer, observable way to confirm
the values are live" — this sprint treats that as a requirement, not an
optimization, so the moment of activation is always an explicit, visible
event (a new deployment appearing in the dashboard), never an ambiguous
"did it apply yet" question.

### Rollback

Delete both Environment Variables from Production scope in Vercel. The
guard's own default behavior for "not configured" is `database_tag_not_configured`
— i.e., deleting them returns to exactly today's already-safe, already-
verified fail-closed state. No redeploy is strictly required to restore
safety (an unset variable fails the guard immediately, in the same
request, with no caching involved), but triggering one is still
recommended for the same observability reason as activation.

### Verifying fail-closed correctness — without ever invoking the live writer

This sprint (166L-A) does not invoke `/api/cron/write-candidates`, does
not call any RPC, and does not touch live Production data. Verification
here is entirely static/unit-level, proving the *logic* is correct before
any real value is ever set:

1. `tests/e2e/productionEnvironmentGuardPlan.spec.ts` (new, this sprint)
   directly exercises `checkDatabaseEnvironmentGuard()` and
   `extractSupabaseProjectRef`-equivalent logic with the **exact planned
   Production values** — proving `production` resolves as a known
   identity, and that `puhcjyffosgohbmxrczb` is exactly what the real
   `NEXT_PUBLIC_SUPABASE_URL` (`https://puhcjyffosgohbmxrczb.supabase.co`,
   the standard Supabase URL shape) would parse to. This is proof the two
   values are *compatible with each other* before they are ever paired
   for real.
2. The existing `productionRolloutReadiness.spec.ts` (Sprint 166K-D)
   already proves the guard fails closed on every malformed/missing/
   mismatched combination — unchanged, still passing, still the
   authoritative fail-closed proof.
3. **Live verification is explicitly deferred to a future, separately-
   approved activation session** (Sprint 166L-B or later): a single
   one-shot, `CRON_SECRET`-authenticated request to `write-candidates`,
   expected to still return `503` (blocked by `SCHEDULED_WRITES_ENABLED`
   remaining absent — Layer 1/2, independent of Layer 0), matching FAZA
   B's original PASS criteria exactly. **Not performed in this sprint.**

## 4. Sprint 166L-B — implementation plan (executed — see §9 for the activation checkpoint)

1. Adam reviews this document and the new automation_identities finding
   (§2.4) — a decision about that row is not required before 166L-B, but
   should not be forgotten before FAZA C is ever opened.
2. Adam gives the exact separate approval text in §7 below.
3. In Vercel, Production scope only: add `SUPABASE_ENVIRONMENT_TAG=production`.
4. In Vercel, Production scope only: add `SUPABASE_EXPECTED_PROJECT_REF=puhcjyffosgohbmxrczb`.
5. Trigger a fresh Production deployment (redeploy the current `main`
   HEAD, or wait for a natural one) so the change is visible and
   unambiguous.
6. Read-only confirmation: both variables show the correct NAME with
   Production scope in the Vercel dashboard (value never read back).
7. **Stop.** No further phase (writer credentials, kill switches, Cron)
   is authorized by this approval — each is its own separate sprint per
   the existing runbook.

## 6. Kill switch and impact if something goes wrong

Both variables are purely additive to Layer 0 of a route
(`write-candidates`) that no code path can reach without also passing
Layers 1–3 — all of which stay false/absent through Sprint 166L-B.
Setting them cannot, by itself, cause a write, a Cron activation, an
email, or any Resend contact. The only observable effect of activation is
a change in which specific `503` reason `checkDatabaseEnvironmentGuard()`
would return internally — never surfaced to any caller, per
`write-candidates/route.ts`'s own "generic error, identical shape"
convention. If anything unexpected is observed after activation, the
single-step rollback in §3 fully and immediately restores today's state.

## 7. Separate approval text — paste exactly this to authorize Sprint 166L-B

This approval covers **only** setting the two Environment Variables named
below, in Production scope, exactly as specified in §3. It does not
authorize any later phase (writer identity, kill switches, Cron, email).

> I approve Sprint 166L-B: in the alertownik-mvp Vercel project, Production
> environment scope only, set `SUPABASE_ENVIRONMENT_TAG=production` and
> `SUPABASE_EXPECTED_PROJECT_REF=puhcjyffosgohbmxrczb`. I understand this
> does not enable the writer, does not change any other flag, and requires
> a fresh deployment to take effect. I understand rollback is deleting both
> variables. This approval does not extend to FAZA C or any later phase.

## 8. What this sprint explicitly does not do

- Does not run any SQL.
- Does not invoke `/api/cron/write-candidates`, any RPC, any Cron, any
  claim/finish cycle, any email, or Resend.
- Does not modify `automation_identities` or any other Production data.
- Does not merge to `main`.
- Does not touch `SCHEDULED_WRITES_ENABLED`, writer credentials,
  `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`, or
  `OPERATIONAL_EMAIL_ALERTS_ENABLED` — all remain false/absent.
- Does not open FAZA C (writer identity/credentials) or any later phase.

## 9. Sprint 166L-B activation checkpoint (2026-07-26)

Executed exactly the approved scope (§7), nothing beyond it.

**Environment Variables set** (Vercel dashboard, Production scope only,
confirmed via the same names/scopes-only read-only method used throughout
this document — values never re-read after entry):
- `SUPABASE_ENVIRONMENT_TAG` — Production, "Added just now"
- `SUPABASE_EXPECTED_PROJECT_REF` — Production, "Added just now"

Both Preview-scoped entries of the same names (added 2026-07-21) were
left untouched, confirmed still present and unchanged in the same
listing. No other variable was added, edited, or removed.

**Deployment:** triggered via Vercel's "Redeploy" action on the current
Production deployment (commit `1e9380b`, same source code, picks up the
new Project Settings per Vercel's own dialog copy). New deployment
reached **Ready** status, Production environment, same domain
(`alertownik-mvp.vercel.app`).

**Fail-closed tests, re-run after activation (all local/unit-level, zero
live requests):** `productionEnvironmentGuardPlan.spec.ts`,
`productionRolloutReadiness.spec.ts`, `databaseEnvironmentGuard.spec.ts`,
`databaseEnvironmentGuardIntegration.spec.ts` — **72/72 passed**, no
regressions.

**Read-only Production smoke test** (`alertownik-mvp.vercel.app`, after
the new deployment went Ready):
- Homepage: identical rendering to before activation (real WKD alert),
  zero console errors, zero `/api/*` requests.
- `/admin/sources`: identical rendering, copy still reads "cron jeszcze
  nieaktywny", zero console errors, exactly one legitimate
  `GET /api/admin/automation-status` request (200) — the same single
  call observed before activation, nothing new.

**Conclusion:** Production behavior is observably unchanged, as
predicted by §6 — the environment guard change is invisible to any
caller because `SCHEDULED_WRITES_ENABLED` (Layer 1/2) and writer
credentials (Layer 3) remain absent, so `write-candidates` still fails
closed at the same generic `503`, now for a different internal reason.
No writer, RPC, Cron, claim/finish, email, or Resend action occurred at
any point in this activation.

**Stopped exactly where instructed:** before FAZA C, before any writer
identity or credential configuration, before any merge to `main`.
