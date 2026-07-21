# Sprint 165C — Post-Release Closure

**Status:** Sprint 165C is complete, merged to `main`, and live on Production. This document records the closure state after release — no new work is performed here.

---

## What is confirmed live today

| Component | Status |
|---|---|
| Isolated Preview Supabase project | ✅ `alertownik-preview` — a separate project from Production's own, each with its own project ref |
| Schema + RLS on Preview | ✅ Replayed and verified: 8 tables, 28 RLS policies, 4 triggers — exact match with Production's live schema at time of replay |
| Preview Auth accounts | ✅ Test admin and test scheduled-writer accounts exist on `alertownik-preview` only, correctly membership-linked |
| Preview seed data | ✅ Synthetic-only, clearly labeled, zero real/Production-derived content |
| Vercel environment separation | ✅ `NEXT_PUBLIC_SUPABASE_URL`, publishable key, `SUPABASE_ENVIRONMENT_TAG`, `SUPABASE_EXPECTED_PROJECT_REF` are all Preview-scoped values, separate from Production's own unchanged values |
| Nullable `alert_sources.url` fix | ✅ Live on Production (Sprint 165C-1) — `/admin/sources` correctly handles a source with no URL, no crash |
| Merge to `main` | ✅ Clean fast-forward (`git merge --ff-only`), no merge commit, pushed once |
| Production deployment | ✅ Verified `Ready`, no build errors, commit matches `main` |
| Production smoke test | ✅ All 8 required pages (`/`, `/alerty`, `/odpady`, `/wiecej`, `/ustawienia`, `/instalacja`, `/admin`, `/admin/sources`), badge `PRODUCTION`, real data, zero writes, zero console/hydration errors |
| Preview post-release recheck | ✅ Badge `PREVIEW`, synthetic data, isolated queries, `/admin/sources` unaffected |
| Automation | ❌ Still fully OFF everywhere — `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` unset on both Production and Preview |

## Final pre-release test results

- `npm run check` (typecheck + lint + build): PASS, zero errors
- `test:e2e`: 682/682 passed
- `test:pwa`: 17/17 passed

## Repo state at closure

- `main` = `origin/main` = `5e5a269` (feature branch fast-forwarded in, zero unique commits remain relative to `main`)
- Feature branch `sprint-165c-isolated-preview-supabase-infrastructure-v1` still exists, both locally and on origin — not deleted this sprint
- Working tree clean except untracked `.vscode/` (never committed)

## Explicitly out of scope for this closure document

- No Vercel variable was added, edited, removed, or rotated
- No SQL was executed
- No Supabase schema, RLS, Auth, or data was changed
- No cron or `write-candidates` endpoint was invoked
- No automation flag was set
- No Redeploy was triggered
- No secret value appears anywhere in this document or any document it updates
- Feature branch deletion was not performed — a separate, later decision for Adam

## What remains before the isolated Preview initiative is fully closed out

- **Feature branch deletion** — safe once Adam confirms no further reference is needed (branch is fully merged, zero unique commits against `main`)
- **Local `.env.local` decision** — whether local development should point at `alertownik-preview` or stay on Production remains open (carried over from Sprint 165A, not addressed by any 165C sub-phase)
- **Automation activation** — a fully separate, later, explicitly-scoped decision; the isolated Preview project is a prerequisite this sprint satisfies, not a trigger to activate anything
