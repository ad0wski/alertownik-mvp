# Sprint 153 — First Cron Observation Checklist v1

Use this during Phase B of
`docs/SPRINT_153_FIRST_PRODUCTION_DRY_RUN_CRON_ACTIVATION_RUNBOOK_V1.md`,
once the **FIRST CRON OBSERVATION WINDOW APPROVAL REQUIRED** gate has
been explicitly cleared. Not executed as part of Sprint 153A.

## Before the window

- [ ] Cron Jobs entry exists in Vercel Dashboard → Project Settings →
      Cron Jobs: path `/api/cron/check-michalowice`, schedule
      `0 5 * * *`
- [ ] Production deployment status is `Ready`
- [ ] `SCHEDULED_CHECKS_ENABLED=true` set in Production **only**
      immediately before the window (not left on beforehand)
- [ ] Redeploy completed after the env change, deployment `Ready`
- [ ] `CRON_SECRET` unchanged from the value already configured

## During the window (05:00–05:59 UTC)

- [ ] No manual request sent to `/api/cron/check-michalowice` — this
      window observes the scheduler only
- [ ] Vercel Cron Jobs → View Logs (Runtime Logs), filter
      `requestPath:/api/cron/check-michalowice`

## Per invocation observed

- [ ] Invocation timestamp (UTC)
- [ ] HTTP status code
- [ ] `x-vercel-cron-schedule` header value, if visible in logs
      (should read `0 5 * * *`) — no secret values are ever logged by
      this route
- [ ] Response body fields:
  - [ ] `ok`
  - [ ] `dryRun`
  - [ ] `checkedSources`
  - [ ] `successfulSources`
  - [ ] `failedSources`
  - [ ] `totalProposalCount`
  - [ ] `savedCandidates` — must read `0`
  - [ ] `savedSourceChecks` — must read `0`
  - [ ] `published` — must read `false`

## After the window

- [ ] No new rows in `alert_sources` candidate/check tables
      attributable to this window (only worth a manual Supabase
      look if the response body itself is ambiguous — a clean
      `savedCandidates=0, savedSourceChecks=0, published=false`
      response already confirms zero writes by construction of the
      route; don't force a SQL check when the response already
      answers it)
- [ ] No new alert published (`/` and `/admin` show no unexpected
      new entries)
- [ ] `SCHEDULED_CHECKS_ENABLED` set back to `false` in Production
- [ ] Redeploy completed, deployment `Ready`
- [ ] Missed delivery (if applicable): noted, logs reviewed for any
      partial/error entry, no manual retry substituted, separate
      decision made for the next window
- [ ] Duplicate delivery (if applicable): noted; not treated as a
      DB risk (route is zero-write) — no remediation action needed
