# Sprint 153 — First Production Dry-Run Cron Activation Runbook v1

**Status (2026-07-13): PHASE A COMPLETE AND VERIFIED.** `main` (commit
`dc6bb53`) is deployed to Production — `Ready Latest`. Vercel Cron
Jobs shows exactly one entry: path `/api/cron/check-michalowice`,
schedule `0 5 * * *`. `SCHEDULED_CHECKS_ENABLED=false` in Production,
so the route remains fail-closed. **Phase B (observation window) has
NOT been activated** — no Vercel env change, no manual request, no
live write, no SQL, no RLS change. The Phase B approval gate below is
separate and still required.

## 0. Context

Sprint 152 closed with Production resting at
`SCHEDULED_CHECKS_ENABLED=false`, `CRON_SECRET` retained, no cron
registered anywhere, and a manually-verified dry-run response
(`ok=true, dryRun=true, savedCandidates=0, savedSourceChecks=0,
published=false`) against `/api/cron/check-sources`.

Sprint 153A's job is to prepare — but not activate — the first *real,
scheduler-triggered* (not manually-requested) invocation of a
zero-write dry-run route in Production.

## 1. Cron path decision — wrapper route, not a query string

Official Vercel docs (`https://vercel.com/docs/project-configuration/vercel-json#crons`)
define a cron object's `path` as:

> `path` — **Required** — The path to invoke when the cron job is
> triggered. Must start with `/`.

No example anywhere in Vercel's cron documentation
(`/docs/cron-jobs`, `/docs/cron-jobs/manage-cron-jobs`,
`/docs/project-configuration/vercel-json#crons`) uses a query string —
the one example of parameterizing a target uses a dynamic **path
segment** (`/api/sync-slack-team/T0CAQ10TZ`), never `?key=value`.
Nothing in the spec says query strings are forbidden, but nothing
confirms they're supported either.

Per the sprint brief's instruction not to risk undocumented behavior
on the first real Production cron wiring, this sprint adds a small
wrapper route instead of relying on `/api/cron/check-sources?sourceKey=michalowice-komunikaty`:

**`GET /api/cron/check-michalowice`**
(`src/app/api/cron/check-michalowice/route.ts`)

- Hardcodes the source key `michalowice-komunikaty` — no query
  string is read or needed.
- Same fail-closed kill switch (`SCHEDULED_CHECKS_ENABLED`), same
  `CRON_SECRET` bearer auth, same zero-write dry-run summary shape as
  `/api/cron/check-sources`.
- Reuses `checkOneSource` from `src/lib/cronCheckSources.ts` (moved
  there this sprint from the original route file so both routes share
  one fetch/parse implementation — zero duplication of the parser).
- Never imports Supabase, the writer, or any publish path (see the
  static-import audit in
  `tests/e2e/cronCheckMichalowiceRoute.spec.ts`).

The original `/api/cron/check-sources` route is untouched in
behavior — it still accepts an optional `sourceKey` filter and
defaults to checking both allowlisted sources — and is not what
`vercel.json` targets.

## 2. Root `vercel.json` — feature branch only

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/check-michalowice",
      "schedule": "0 5 * * *"
    }
  ]
}
```

- Exactly one cron, one schedule, one path — nothing else.
- `0 5 * * *` = once daily. On Vercel's Hobby plan this triggers
  sometime in the 05:00–05:59 UTC hour (hour-precision only, not
  minute-precision) — roughly 07:00–07:59 Polish summer time,
  06:00–06:59 Polish winter time.
- This file exists **only on
  `sprint-153-first-production-dry-run-cron-v1`**. It is not merged
  to `main`. A Preview deployment of this branch does **not** by
  itself activate a cron — Vercel Cron only ever triggers against a
  **Production** deployment (confirmed:
  `https://vercel.com/docs/project-configuration/vercel-json#crons`
  — "Used to configure cron jobs... for the production deployment of
  a project").
- Validated locally: valid JSON, matches the documented schema shape,
  no secrets, no env values, no hardcoded Production URL, path starts
  with `/`, schedule fixed to a single minute+hour (not a wildcard),
  so it cannot resolve to more than once per day. See
  `tests/e2e/vercelCronConfig.spec.ts` for the enforced contract.

## 3. Vercel Cron facts relied on (source: official docs, fetched
   2026-07-13)

1. Cron jobs trigger only against the **Production** deployment
   (`/docs/project-configuration/vercel-json#crons`).
2. Vercel Cron always sends an **HTTP GET**
   (`/docs/cron-jobs#how-cron-jobs-work`).
3. `CRON_SECRET` (if set as a Production env var) is sent
   automatically as `Authorization: Bearer <CRON_SECRET>`
   (`/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs`).
4. Hobby plan: max **once per day**, and Vercel may invoke anywhere
   within the specified hour, not the specified minute
   (`/docs/cron-jobs/usage-and-pricing#hobby-scheduling-limits`).
5. Cron delivery is **best-effort**: an invocation can occasionally be
   missed, and can occasionally fire more than once for the same
   scheduled run
   (`/docs/cron-jobs/manage-cron-jobs#cron-job-delivery-and-idempotency`).
   Our target route is zero-write and stateless per request, so a
   duplicate delivery is inert by construction — there is nothing to
   reconcile.

Sources:
- https://vercel.com/docs/cron-jobs
- https://vercel.com/docs/cron-jobs/manage-cron-jobs
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/project-configuration/vercel-json

## 4. Three-phase safe release plan

### 🔒 FIRST CRON CONFIG PRODUCTION RELEASE APPROVAL REQUIRED — CLEARED 2026-07-13

Covers Phase A only — merging `vercel.json` (and the
`check-michalowice` route) to `main` and deploying to Production.
`SCHEDULED_CHECKS_ENABLED` stays `false` throughout Phase A, so
registering the cron changes nothing observable: every scheduled
invocation still 503s at the kill switch, same as every manual
request has since Sprint 142.

### Phase A — release cron config, checks OFF — ✅ DONE 2026-07-13

1. ~~Fast-forward `main` to this branch's tip~~ — done locally then
   pushed by Adam. `main` = `origin/main` = `dc6bb53`.
2. ~~Confirm Production env still has `SCHEDULED_CHECKS_ENABLED=false`~~
   — confirmed manually by Adam before and after deploy.
3. ~~Deploy the merged `main`~~ — confirmed: Production, Branch main,
   Commit `dc6bb53`, Status Ready Latest, Current: yes.
4. ~~Confirm exactly one Cron Jobs entry~~ — confirmed manually:
   path `/api/cron/check-michalowice`, schedule `0 5 * * *`, Global
   Cron Jobs toggle Enabled.
5. Confirmed: the cron being registered does not mean it is "live" in
   any writing sense — the route itself still fail-closes on
   `SCHEDULED_CHECKS_ENABLED=false` (verified against the committed
   code: the kill-switch check runs before auth, before fetch, before
   the parser — there is no write or publish call anywhere in the file
   or its import chain).
6. Confirmed: no writer env, no `SCHEDULED_WRITES_ENABLED`, no new
   secret was touched in this phase.

### 🔒 FIRST CRON OBSERVATION WINDOW APPROVAL REQUIRED — NOT YET CLEARED

Covers Phase B only — flipping `SCHEDULED_CHECKS_ENABLED=true` for a
single scheduled cron run. Requested and granted separately from
Phase A, and only after Phase A's Production deploy is confirmed
`Ready` (now true). **Not activated as of this update.**

### Phase B — single observation window (planned, not activated)

Current schedule `0 5 * * *` = 05:00–05:59 UTC. Poland is on CEST in
July, so the Hobby-plan hour window currently maps to
**07:00–07:59 Polish time** (this shifts to 06:00–06:59 Polish time
once CET returns in late October — re-check the offset before any
future-dated window).

**B1 — before the window**
1. Set `SCHEDULED_CHECKS_ENABLED=true` in Production only.
2. Redeploy Production.
3. Confirm: Environment Production, Branch main, Commit `dc6bb53`,
   Status Ready Latest.
4. Do **not** send a manual request — the whole point is observing the
   real scheduler-triggered call.

**B2 — observation**
1. Wait for a single automatic invocation in the window
   05:00–05:59 UTC (currently 07:00–07:59 Polish time).
2. Check Cron Jobs → View Logs, and Runtime Logs.
3. Record: timestamp, HTTP status, `ok`, `dryRun`, `checkedSources`,
   `successfulSources`, `failedSources`, `totalProposalCount`,
   `savedCandidates`, `savedSourceChecks`, `published`.
4. Expected: `HTTP 200`, `ok=true`, `dryRun=true`, `checkedSources=1`,
   `savedCandidates=0`, `savedSourceChecks=0`, `published=false`.
5. Vercel does not guarantee the exact minute — don't treat an
   invocation at, say, 07:47 Polish time as anomalous.
6. **Missed delivery**: if no invocation appears by the end of the
   hour, do not manually retry as a substitute and do not click Run as
   a stand-in. Note the missed delivery, review the logs for any
   partial/error entry, and make a separate decision about the next
   day's window — don't compress two decisions into one.
7. **Duplicate delivery**: if two invocations appear for the same
   scheduled run, this is not a DB risk (the route is zero-write) —
   note it as an observed duplicate delivery and move on.

**B3 — return to resting state (= Phase C)**

Immediately after one confirmed cron run (success, missed, or
duplicate — any of the three closes the observation window):
1. Set `SCHEDULED_CHECKS_ENABLED=false` in Production.
2. Redeploy Production.
3. `CRON_SECRET` remains configured. The cron entry may remain
   registered in Vercel's Cron Jobs list — that's fine, the route
   stays fail-closed regardless of whether the cron itself is still
   scheduled to fire.
4. No writer env is introduced at any point in this runbook.
5. No autopublish path exists or is touched.

## 5. Rollback

**Immediate kill switch** (works regardless of cron registration
state): set `SCHEDULED_CHECKS_ENABLED=false` in Production, then
redeploy. This alone stops every future invocation from doing
anything beyond a 503, cron or manual.

**Full cron removal**: remove the `crons` entry from `vercel.json`
(or delete the file) and deploy — or use Vercel Dashboard's **Disable
Cron Jobs** button if immediate removal without a deploy is needed.
Note per Vercel's docs, a disabled cron job still counts toward the
project's cron job limit and stays listed; it just stops firing.

**Rollback caveat**: an Instant Rollback to a prior deployment does
**not** automatically change the currently active cron schedule —
Vercel's own docs state active cron jobs continue running as
scheduled after a rollback until manually disabled or updated. If a
deployment rollback is ever used for an unrelated reason while this
cron is registered, the Cron Jobs dashboard state must be checked
independently — don't assume the rollback also reverted the cron.

Rollback has **not been needed or executed** — this section remains
documentation only. No rollback trigger occurred during Phase A.

## 6. Status summary (2026-07-13)

**Done (Phase A):** merge to `main`, push of `main`, Production
deploy, cron registered in Vercel (`SCHEDULED_CHECKS_ENABLED` stayed
`false` throughout, so the route stayed fail-closed the entire time).

**Still not done (Phase B, separately gated):** no
`SCHEDULED_CHECKS_ENABLED=true`, no observation window activated, no
manual or scheduled request has run against the wrapper route in
Production, no live write, no SQL, no RLS change, no WKD write, no
autopublish, no `SCHEDULED_WRITES_ENABLED`, no new secret.
