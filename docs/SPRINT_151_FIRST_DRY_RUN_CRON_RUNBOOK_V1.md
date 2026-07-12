# Sprint 151 — First Dry-Run Cron Activation Runbook v1

**Status: PLAN PREPARED, NOT EXECUTED.** No merge to `main`, no
Production deploy, no Production env, no `vercel.json` in the repo
root, no active Vercel Cron, no live request. Two separate approval
gates (§0) must each be explicitly cleared by Adam before their
respective section proceeds — neither is implied by the other.

See `docs/SPRINT_151_PRODUCTION_RELEASE_AUDIT_V1.md` for the full
branch/schema/route audit and the reasoning behind every choice below
(fast-forward merge, Variant A, once-daily/05:00 UTC).

---

## 0. Two independent approval gates

### 🔒 FIRST PRODUCTION RELEASE APPROVAL REQUIRED

Covers §§1–3 below (merging code to `main` and deploying it to
Production) — **before any cron config exists anywhere in the repo.**
Releasing the code alone changes nothing observable: both cron routes
503 with no env configured (verified in the audit doc §C), and no
public/admin page reads any new env var.

### 🔒 FIRST DRY-RUN CRON ACTIVATION APPROVAL REQUIRED

Covers §§4–7 below (configuring the 2-variable env set, adding the
cron config, and observing the first real invocation) — **a separate,
later decision**, only after the release gate has been cleared and the
smoke test (`docs/SPRINT_151_PRODUCTION_SMOKE_TEST_RUNBOOK_V1.md`) has
passed on the newly-released Production code.

Neither gate authorizes the other. Clearing the release gate does not
imply the cron gate is also cleared.

---

## 1. Requirements before merge

- [ ] `docs/SPRINT_151_PRODUCTION_RELEASE_AUDIT_V1.md` §B reviewed —
      fast-forward from `main` at `b82353e`, zero conflicts possible
- [ ] `npm run check` (typecheck + lint + build) passes with zero
      errors/warnings — confirmed this sprint, see §K test results
- [ ] `npm run test:e2e` passes in full — confirmed this sprint,
      374/374, zero skipped/flaky
- [ ] No root `vercel.json` exists in the branch being merged —
      confirmed
- [ ] Secret scan of the full diff clean — confirmed
- [ ] Adam has reviewed and explicitly cleared **FIRST PRODUCTION
      RELEASE APPROVAL REQUIRED**

## 2. Requirements before Production deploy

- [ ] Merge is a `--ff-only` fast-forward of `main` to this branch's
      tip — never a forced push, never `--no-ff`, never a squash that
      would lose the individual Sprint 148–150 commit history
- [ ] Adam has confirmed no other unmerged Production-bound work is
      pending on `main` that this fast-forward would silently skip
      past (the audit doc's §B finding that `main` has zero unique
      commits means this is not expected, but it costs nothing to
      re-confirm at merge time, since time will have passed)
- [ ] No Production env has been set yet — this step deliberately
      deploys code with zero new configuration, to prove the
      fail-closed behavior in §3 for real, not just by code audit

## 3. Required env for the release itself

**None beyond what Production already has** (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY` — all
pre-existing, unrelated to this sprint). The release step is
deliberately a code-only deploy.

## Release → smoke test → dry-run env → deploy → cron config → deploy → observe

1. **Release code** — fast-forward merge `main` ← this branch, deploy
   to Production via Vercel's normal main-branch deploy. No cron
   config exists yet; both cron routes will 503 on any request
   (`SCHEDULED_CHECKS_ENABLED` unset).
2. **Production smoke test** — run
   `docs/SPRINT_151_PRODUCTION_SMOKE_TEST_RUNBOOK_V1.md` in full,
   including its two fail-closed cron checks. Do not proceed past this
   step on any failure.
3. **Configure dry-run env** (after **FIRST DRY-RUN CRON ACTIVATION
   APPROVAL REQUIRED** is cleared) — set exactly 2 Production
   variables: `SCHEDULED_CHECKS_ENABLED=true`, `CRON_SECRET=<new,
   Production-only value, never copied from Preview>`.
   `SCHEDULED_WRITES_ENABLED` stays unset/`false`.
4. **Deploy** — trigger a Production redeploy so the new env takes
   effect (env changes alone do not require a code change, but do
   require a redeploy on Vercel to be picked up by running functions).
5. **Add cron config** — copy the schedule from
   `docs/vercel/PROPOSED_SPRINT_151_FIRST_DRY_RUN_CRON_V1.json`'s
   `crons` array into a real root `vercel.json` (create it fresh — it
   does not exist yet in this repo; this is the one moment this
   runbook actually asks for a root file to be created, and only as a
   manual step Adam performs, not something this sprint's code changes
   do). Commit only the `vercel.json` addition, nothing else.
6. **Deploy** — a second Production deploy, this time to pick up the
   `crons` config itself (Vercel only reads `crons` from a deploy's own
   `vercel.json`, not retroactively).
7. **Observe the first invocation** — wait for the next `05:00 UTC`
   tick (or use Vercel's manual "Run now" if the dashboard offers it
   for the specific cron job, which does not require a code change or
   a second deploy). Check the response shape and Runtime Logs per §5
   below.

## 4. Required env recap (dry-run only)

| Variable | Value | Notes |
|---|---|---|
| `SCHEDULED_CHECKS_ENABLED` | `true` | Literal string, kill switch 1 |
| `CRON_SECRET` | new, Production-scoped | Never copied from Preview's value — a compromised Preview secret must not also compromise Production |

`SCHEDULED_WRITES_ENABLED`, writer credentials, and all optional
fingerprint/registry/cap flags are **not required** and should remain
unset for this dry-run-only activation.

## 5. Expected status / JSON

**Successful invocation** (`GET /api/cron/check-sources`, called by
Vercel Cron with its auto-injected `Authorization: Bearer <CRON_SECRET>`):

```json
{
  "ok": true,
  "dryRun": true,
  "checkedAt": "<ISO timestamp>",
  "checkedSources": 2,
  "successfulSources": <0-2>,
  "failedSources": <0-2>,
  "totalProposalCount": <n>,
  "savedCandidates": 0,
  "savedSourceChecks": 0,
  "published": false,
  "message": "Dry-run: nic nie zostało zapisane w bazie, żaden kandydat ani historia sprawdzenia nie powstały, nic nie zostało opublikowane.",
  "results": [ /* per-source detail, no candidate/check IDs — nothing was persisted */ ]
}
```

`checkedSources: 2` because `resolveCronSources(null)` (no
`sourceKey` filter, which is what a bare Vercel Cron GET produces)
resolves every entry in `SAFE_CHECK_SOURCE_IDS` — currently Michałowice
and WKD both, since the dry-run route's allowlist is not narrowed the
way the writer route's is. **This is expected and safe**: the dry-run
route cannot write regardless of which/how many sources it checks.

**Misconfiguration outcomes** (any of these before §3's env is fully
set): `503` with `{"ok": false, "error": "Zaplanowane sprawdzenia są
wyłączone."}` (checks disabled) or `503` with `{"ok": false, "error":
"Endpoint nieskonfigurowany."}` (`CRON_SECRET` unset) or `401` with
`{"ok": false, "error": "Unauthorized."}` (secret mismatch — should not
happen if Vercel injects it correctly per §4's note, but would indicate
a genuine misconfiguration to investigate before assuming it's safe to
retry).

## 6. Runtime logs

Check **Vercel Dashboard → Project → Cron Jobs** for invocation history
(timestamp, duration, HTTP status) and **Runtime Logs** filtered to
`/api/cron/check-sources` for the full JSON response body and any
uncaught exception (should never occur — every failure path in this
route resolves to a JSON response, per the per-source try/catch
isolation audited in `SPRINT_151_PRODUCTION_RELEASE_AUDIT_V1.md` §D).

## 7. Rollback

In order of increasing severity:

1. **Disable via Cron Jobs UI** — Vercel's dashboard allows pausing an
   individual cron job without any code or env change. Fastest option.
2. **`SCHEDULED_CHECKS_ENABLED=false`** in Production env — the route
   itself refuses to run on the very next invocation, no redeploy
   needed for the kill switch to take effect (env reads happen
   per-request in a serverless function).
3. **Remove the cron config** from `vercel.json` + redeploy — the
   harder disable; removes the schedule from Vercel entirely, not just
   the route's willingness to run.
4. **Full revert**: `git revert` the `vercel.json`-adding commit,
   redeploy.

No database rollback is ever required for this route — it never writes
anything, at any point, under any configuration (§D of the audit doc).

## 8. No writer

`/api/cron/write-candidates` is never referenced by
`docs/vercel/PROPOSED_SPRINT_151_FIRST_DRY_RUN_CRON_V1.json`'s `crons`
array and is not part of this activation. Its own separate Production
activation (Variant B, audit doc §E) remains a distinct, future,
separately-approved decision.

## 9. No DB writes

Structurally guaranteed by `/api/cron/check-sources`'s own code (no
Supabase import at all) and enforced by a dedicated static-import-audit
test (`tests/e2e/cronCheckSourcesRoute.spec.ts`) — not just a runtime
behavior that could regress silently.

## 10. No autopublish

No code path in this route or its dependencies reaches `alerts`,
Builder, or any draft/candidate-approval helper — confirmed in the
audit doc §C/§D. Publication remains, as always, a fully manual admin
action on a separate table.
