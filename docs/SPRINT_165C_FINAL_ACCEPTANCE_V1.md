# Sprint 165C — Final Acceptance: Isolated Preview Environment

**Status:** Sprint 165C's isolated Preview environment is built, verified, and accepted at the branch level. Branch `sprint-165c-isolated-preview-supabase-infrastructure-v1`, **not yet merged to `main`** — that merge is a separate, later, Adam-only decision. Production (`alertownik-mvp`) has not been touched at any point across the entire sprint.

---

## What exists now

| Component | Status |
|---|---|
| Isolated Supabase project | ✅ `alertownik-preview`, West Europe (London), Free plan, `NANO` compute |
| Schema + RLS | ✅ Replayed and verified read-only against Production's live snapshot: 8 tables, 28 RLS policies, 4 triggers, all 8 tables RLS-enabled |
| Auth accounts | ✅ Two: test admin (`preview-test-admin@example.invalid`) and test scheduled-writer (`preview-test-writer@example.invalid`), correctly membership-linked to `admin_profiles`/`automation_identities` (one row each) |
| Synthetic seed data | ✅ Executed exactly once, transaction-wrapped: 6 categories, 3 sources, 7 alerts, 3 source checks, 3 candidates, 4 waste-schedule rows — all clearly labeled `SYNTHETIC`, zero real/Production-derived data |
| Vercel Preview environment separation | ✅ `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ENVIRONMENT_TAG=preview`, `SUPABASE_EXPECTED_PROJECT_REF` all scoped to Preview (all branches), separate from Production's own unchanged values |
| Live Preview deployment | ✅ Verified — every page loads correctly, environment badge reads `PREVIEW`, all Supabase calls confirmed hitting `nowvcdbtgaigutyxpmdp.supabase.co` (the isolated project's ref) |
| Nullable-URL regression | ✅ Found (by the synthetic seed's own deliberately-null-URL test source) and fixed — `/admin/sources` no longer crashes; regression tests added |
| Automation | ❌ **Still fully OFF** — `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` unset on Preview, no scheduled-writer credentials configured, no cron wired to `write-candidates` anywhere |

## Isolation proof (this sprint's core goal)

Every browser QA pass across this sprint — public pages, `/admin`, `/admin/sources`, after both the initial deployment and the regression-fix deployment — confirmed:
- All Supabase REST calls target `https://nowvcdbtgaigutyxpmdp.supabase.co` (the `alertownik-preview` project), never Production's project.
- The visible content is exclusively the synthetic seed (`[SYNTHETIC PREVIEW]`-prefixed alerts, `(SYNTHETIC)`-labeled sources) — content that has never existed on Production.
- The `EnvironmentBadge` reads `PREVIEW`, never `PRODUCTION`, on every admin page checked.
- Zero write requests (no POST/PUT/PATCH/DELETE) occurred during any read-only QA pass.
- `checkDatabaseEnvironmentGuard()`'s four-signal design (VERCEL_ENV, SUPABASE_ENVIRONMENT_TAG, actual project ref from `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_EXPECTED_PROJECT_REF`) is confirmed by its own test suite (72 tests, all passing) to fail closed on any single mismatch — and remains an *additional*, non-replacing gate alongside the pre-existing three kill-switch layers on `write-candidates`.

## What remains explicitly out of scope (deliberately not done)

- **Automation activation** — `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` remain unset everywhere. Turning them on for Preview is a separate, later, explicitly-scoped decision (see `docs/SPRINT_164B_CANARY_ACTIVATION_RUNBOOK_V1.md`/`docs/SPRINT_165C_MANUAL_DEPLOYMENT_RUNBOOK_V1.md` for the staged path when that decision is made).
- **Merge to `main`** — this document records branch-level acceptance only. The merge itself is a separate, explicit action for Adam.
- **Local `.env.local`** — whether local development should also point at `alertownik-preview` instead of Production remains an open, unresolved tradeoff from Sprint 165A, not addressed by this sprint.

## Known limitations carried forward

- **Free Plan constraints on `alertownik-preview`:** shared org-wide quotas (5 GB egress, 500 MB database, 50k MAU, 1 GB storage per billing cycle) — see Manual Gate 1's billing audit. A Free-tier project also auto-pauses after a period of inactivity; if `alertownik-preview` goes idle between test sessions, it may need to be manually resumed in the Supabase dashboard before the next QA pass.
- **Preview data is 100% synthetic** — nothing in `alertownik-preview` resembles real municipal data; any future demo or stakeholder review must not present Preview content as real.
- **Dark-mode/UI polish gaps** and other pre-existing limitations documented in `docs/LIMITATIONS.md` are unchanged by this sprint.

## Full sprint history (for reference)

1. Phase 1 — preflight, documentation/code audit, live re-verification (zero drift found against Sprint 165A's original snapshot, except a trigger-detection correction).
2. Manual Gate 1 — Vercel/Supabase billing and capacity audit (GO verdict).
3. Manual Gate 2 — `alertownik-preview` project created (empty).
4. Phase 3 — schema/RLS replay executed and verified.
5. Phase 4 — Auth accounts created, synthetic seed audited (one pre-run bug found and fixed), executed once, verified.
6. Vercel Preview environment separation — four variables split from the shared Production+Preview scope into Preview-only equivalents.
7. New Preview deployment via an empty commit — badge/isolation/guard confirmed live.
8. Sprint 165C-1 — nullable `alert_sources.url` regression found via the synthetic seed's own null-URL test case, fixed with proper `string | null` typing (no casts, no fake substitute values), regression tests added, re-deployed and re-verified.
9. This document — final branch-level acceptance.

---

**Verdict recorded separately in the sprint's final report (see chat): RELEASE-READY — SAFE TO FAST-FORWARD, pending Adam's explicit merge decision.**
