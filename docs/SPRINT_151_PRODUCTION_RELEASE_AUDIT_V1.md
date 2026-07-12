# Sprint 151A — Production Release & First Dry-Run Schedule Safety Audit v1

**Status: RELEASED TO PRODUCTION AND SMOKE-TESTED (2026-07-12).**
`main` was fast-forwarded to `4ce2f4a` (Sprint 151B, `git merge
--ff-only`, zero conflicts as predicted below) and pushed to `origin`.
Vercel deployed it to Production — confirmed `Ready`, `Environment:
Production`, `Branch: main`, `Commit: 4ce2f4a`. A full, non-invasive
Production smoke test (real-browser, via Playwright against the live
URL — not just HTTP status codes) found zero regressions: homepage,
`/odpady`, `/about`, a real alert detail page, and the not-found state
for a fake slug all render correctly; `/admin` shows the login gate
with zero data leak to anonymous visitors. **`SCHEDULED_CHECKS_ENABLED`
and `SCHEDULED_WRITES_ENABLED` are still unset in Production** — both
cron routes remain fail-closed by construction, confirmed against the
exact deployed code, not by a live request. No cron is active, no
`vercel.json` exists, no live write, no SQL, no autopublish. Full
result: `docs/SPRINT_151_PRODUCTION_SMOKE_TEST_RUNBOOK_V1.md` update
section and Obsidian `Sprint 151 Production Release Candidate`.

Branch: `sprint-151-production-release-schedule-safety-v1`, created
directly from `sprint-150-race-condition-closure-package-v1` at commit
`bff725a` (Sprint 150 CLOSED — see
`docs/SPRINT_150_RACE_CONDITION_DEPLOYMENT_RUNBOOK_V1.md` and
`docs/SPRINT_150_FINGERPRINT_PREVIEW_ACTIVATION_RUNBOOK_V1.md` for full
Sprint 150 detail).

---

## B. Audit: current branch vs `main`

**Merge base:** `git merge-base main HEAD` = `b82353e` — this is
literally `main`'s current tip. **`main` has zero commits this branch
doesn't have** (`git rev-list --count HEAD..main` = `0`). This is the
simplest possible case: a pure linear fast-forward, not a divergence.

**7 commits ahead of `main`:**

```
bff725a sprint-150-phase-b-controlled-fingerprint-test-verified-v1
0b85a26 sprint-150-phase-a-fail-closed-preflight-verified-v1
02511a9 sprint-150-migration-verified-fingerprint-activation-ready-v1
c0fca27 sprint-150-race-condition-closure-package-v1
5f99e13 sprint-149-scheduled-writer-hardening-v1
36714b0 sprint-148-controlled-writer-test-verified-v1
b711520 sprint-148-vercel-preview-prep-v1
```

**31 files changed, 3508 insertions(+), 38 deletions(-).** Full
categorization (`git diff main..HEAD --stat`):

| Category | Files | Notes |
|---|---|---|
| Cron routes | `src/app/api/cron/write-candidates/route.ts` (modified, +77/-38 lines) | `check-sources/route.ts` — **zero diff vs `main`**, confirmed by `git diff main..HEAD --stat -- src/app/api/cron/check-sources/route.ts` returning empty |
| Server-only modules | `src/lib/scheduledWriter.ts`, `src/lib/candidateWarnings.ts`, `src/lib/writerCandidateActivity.ts` (new) | No public-facing import chain — verified in §C |
| Admin components | `src/app/admin/sources/page.tsx` (+31), `src/components/ScheduledWriterMonitoring.tsx` (new) | Purely additive: reuses the page's existing authenticated fetch, adds a new read-only panel — no new query, no new env var read |
| Public UI | **none** | Confirmed: `git diff main..HEAD --stat` for `src/app/page.tsx`, `src/app/alerts/**`, `AlertCard*`, `AppHeader*` returns empty |
| Tests | 5 files (`scheduledWriter*.spec.ts`, `writerCandidateActivity.spec.ts`) — 4 new, 1 modified | All Preview/local-fixture based, zero live-site dependency |
| Docs | 12 `.md`/`.sql` files under `docs/` | Non-runtime, no effect on the deployed app |
| Scripts | 2 new `.ps1` files under `scripts/` | Not part of the Next.js build, no effect on the deployed app |
| Config | **none** | Confirmed: `package.json`, `package-lock.json`, `next.config.*`, `vercel.json` all show zero diff vs `main`; no root `vercel.json` exists in either branch |

**Conflicts:** none possible — `main` has no commits this branch lacks,
so there is nothing to conflict with.

**Recommended integration method:** **fast-forward merge**
(`git merge --ff-only sprint-151-production-release-schedule-safety-v1`
from `main`, or equivalently `git checkout main && git merge --ff-only
<branch>`). No merge commit, no rebase needed — the history is already
linear. This is the safest option: a fast-forward cannot silently
combine or reorder changes, and `--ff-only` will hard-fail (not
fall back to a merge commit) if `main` has moved in the meantime,
which is the correct behavior to force a fresh audit rather than an
automatic 3-way merge.

---

## C. Production schema compatibility audit

Live Supabase already has (per Sprint 150 verification):
`content_fingerprint` column, the partial unique index
`source_notice_candidates_writer_fingerprint_uniq`, `automation_identities`,
and the least-privilege RLS policies (Sprint 143–146). This branch's
code was written against exactly that schema — no further migration is
proposed or required by this sprint.

**1. Is all branch code compatible with the live schema?** Yes.
`content_fingerprint` is only ever sent conditionally
(`isContentFingerprintEnabled()`, `scheduledWriter.ts:219-221,238`) —
when the flag is unset/false, the key is omitted from the insert
payload entirely (not sent as `undefined`), so the code is safe to run
against a database **with or without** the column. Since the live
database already has the column (Sprint 150), no compatibility gap
exists either way.

**2. Does deploying this code to Production — before any new env is
set, with writer env missing, `SCHEDULED_WRITES_ENABLED` unset/false,
fingerprint flag unset — stay fail-closed and not break the public
app?** Yes, verified by reading both cron routes end-to-end:

- `check-sources/route.ts`: kill-switch check
  (`isScheduledChecksEnabled`) is the literal first statement in `GET`;
  with `SCHEDULED_CHECKS_ENABLED` unset, it returns `503` immediately.
  Imports **zero** Supabase code (confirmed by
  `tests/e2e/cronCheckSourcesRoute.spec.ts`'s static-import-audit test,
  which greps the compiled source for `supabaseCandidateWrites`,
  `supabaseSourceWrites`, `supabaseAlertWrites`, `SUPABASE_SERVICE_ROLE`,
  the Supabase client import, and `@supabase/supabase-js`, asserting
  none appear).
- `write-candidates/route.ts`: two independent kill switches
  (`SCHEDULED_CHECKS_ENABLED`, `SCHEDULED_WRITES_ENABLED`) are checked
  first, before `checkCronAuth`, before `getScheduledWriterCredentials`
  (which itself returns `null` — and the route 503s — if
  `SUPABASE_SCHEDULED_WRITER_EMAIL`/`_PASSWORD` are unset), before any
  fetch or insert.
- Neither cron route is imported by, or shares any module with, any
  page rendering the public site or the admin UI — a Production deploy
  of this code with zero new env configured changes nothing observable
  to a visitor; the only new surface is two API routes that both 503
  immediately.

**3. Do public pages require writer credentials, `CRON_SECRET`, or any
new flag?** No — confirmed by `git diff main..HEAD` touching zero files
under `src/app/page.tsx`, `src/app/alerts/`, or any shared public
component; the only `process.env` reads anywhere in the diff are
scoped to the two cron routes and `scheduledWriter.ts` (full inventory
in §G).

**4. Does the admin panel stay compatible?** Yes — `admin/sources/page.tsx`'s
only change is additive (`ScheduledWriterMonitoring` panel, §B table
above); it reads from the same already-authenticated candidate fetch
the page already performs, reads no new env var, and renders an empty/
zero state gracefully when `writerActivityCandidates` is empty (the
default on a fresh Production database with no writer activity yet).

No SQL was run, no RLS was changed, as part of this audit.

---

## D. Cron route audit

### `GET /api/cron/check-sources`

| Property | Answer |
|---|---|
| Writes to DB? | **No — zero DB writes, confirmed by code (no Supabase import at all) and by a dedicated static-import-audit test (`tests/e2e/cronCheckSourcesRoute.spec.ts`)** |
| Logs a writer? | No — no writer identity exists in this route's execution path |
| Requires technical-account credentials? | No |
| Requires `CRON_SECRET`? | Yes — `checkCronAuth`, 401/503 otherwise |
| Required env | `SCHEDULED_CHECKS_ENABLED`, `CRON_SECRET` |
| Possible HTTP statuses | `503` (`SCHEDULED_CHECKS_ENABLED` not `"true"`, generic "Zaplanowane sprawdzenia są wyłączone"), `503` (`CRON_SECRET` unset, "Endpoint nieskonfigurowany"), `401` (bad/missing bearer token), `200` (success, always `ok: true` — even per-source fetch failures degrade into the summary, they don't fail the route) |
| Timeout | `CRON_FETCH_TIMEOUT_MS = 10_000` ms per source, `AbortController`-enforced |
| Behavior on source fetch error | Per-source `try/catch`; a `fetch_error`/`timeout`/`parse_error` result for one source never throws or fails the whole batch — degrades to a safe result object with `proposalCount: 0` |
| Can `published` be `true`? | No — `buildDryRunSummary` returns the literal constant `published: false` in its type signature (`CronDryRunSummary`), no code path sets it otherwise |
| Risk of touching `alerts`? | None — no import chain reaches any alert-publishing/draft/candidate-approval helper |

**Confirmed: `/api/cron/check-sources` is a genuine, zero-write dry
run — verified by code inspection AND by a live-guarding test, not
assumed from the name or the route's docstring.**

### `GET /api/cron/write-candidates`

| Property | Answer |
|---|---|
| Writes to DB? | Yes, when both kill switches are `true` — inserts `source_notice_candidates` (status always `pending`) and `source_checks` rows |
| Logs a writer? | Yes — `created_by` on `source_checks` is the signed-in technical writer's own `uid` |
| Requires technical-account credentials? | Yes — `SUPABASE_SCHEDULED_WRITER_EMAIL`/`_PASSWORD`, and that account must be a member of `automation_identities` (enforced by RLS, not just app code) |
| Requires `CRON_SECRET`? | Yes — same `checkCronAuth` as the dry-run route |
| Required env | `SCHEDULED_CHECKS_ENABLED`, `SCHEDULED_WRITES_ENABLED`, `CRON_SECRET`, `SUPABASE_SCHEDULED_WRITER_EMAIL`, `SUPABASE_SCHEDULED_WRITER_PASSWORD` (+ existing `NEXT_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY`) |
| Optional env | `SCHEDULED_WRITER_FINGERPRINT_ENABLED`, `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS`, `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN`, `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` |
| Possible HTTP statuses | `503` (either kill switch off), `503` (`CRON_SECRET` unconfigured), `401` (bad token), `503` (writer credentials missing or sign-in fails — both share one generic message, deliberately not distinguished), `200` (success — per-source failures degrade the same way as the dry-run route, never fail the whole response) |
| Timeout | Same `CRON_FETCH_TIMEOUT_MS = 10_000` ms per source |
| Behavior on source fetch error | Same per-source try/catch isolation as the dry-run route (Sprint 149 hardening) — plus a second layer: the whole `writeCandidatesForSource` call for one source is also wrapped, so a Supabase network error degrades the same way as a fetch/parse error |
| Can `published` be `true`? | No — `route.ts:227` returns the literal, unconditional `published: false` in every response; the table this route writes to has no publish column at all (confirmed in Sprint 150's verify SQL, check #12) |
| Risk of touching `alerts`? | None — same structural guarantee as the dry-run route: no import of any alert-publishing/draft/candidate-approval helper anywhere in this route or `scheduledWriter.ts` |

Both routes share `checkCronAuth`/`isScheduledChecksEnabled` from
`cronCheckSources.ts`, but are otherwise fully independent — a bug in
one cannot affect the other's behavior (by design, see the route's own
file-header comment).

---

## E. First schedule variant comparison

**Important existing finding (Sprint 149,
`docs/SPRINT_149_FIRST_SCHEDULE_READINESS_V1.md` §4):** a Vercel-Cron-
in-Preview variant does not exist technically — Vercel does not run
`crons` for Preview deployments at all, only Production. This
eliminates one theoretical option outright; the three variants below
reflect what's actually available.

| | **A: `/api/cron/check-sources` (dry-run)** | **B: `/api/cron/write-candidates` (writer)** | **C: external scheduler (e.g. GitHub Actions) → same endpoint** |
|---|---|---|---|
| Risk | **Lowest** — zero DB writes possible even under misconfiguration, confirmed by code + guarding test | Real DB writes; race-condition class of bug now closed (Sprint 150) but still the higher-risk path — a misconfigured kill switch has real effect | New dependency (GitHub Actions), new secret surface (`CRON_SECRET` would need to live in GH Actions secrets too), Preview URL is comparatively fragile across redeploys |
| Requires Production env | `SCHEDULED_CHECKS_ENABLED`, `CRON_SECRET` only | All of A's env + 4 more (writer credentials, registry ids) + `SCHEDULED_WRITES_ENABLED` | Same as A, but a *second* secret store (GH Actions) must also hold `CRON_SECRET` |
| Requires new secrets | 1 (`CRON_SECRET`, Production-scoped, never copied from Preview) | 1 + writer credentials (5 total) | 1, duplicated into a second system |
| DB impact | **None, structurally** | Up to 1 new `pending` candidate + 1 `source_checks` row per invocation (capped) | Same as A (this variant only ever targets the dry-run endpoint per its own design intent) |
| Monitoring | Vercel Cron Logs/Runtime Logs (Production) | Same + `/admin/sources` Scheduled Writer Monitoring panel (Sprint 149) | GitHub Actions run logs + manual endpoint check |
| Rollback | `SCHEDULED_CHECKS_ENABLED=false` (next invocation) or remove `crons` from `vercel.json` + redeploy (harder disable) | Same, plus `SCHEDULED_WRITES_ENABLED=false` as an independent second switch | Disable/delete the GitHub Actions workflow |
| Cost/limits | Vercel Hobby: max 1 cron/day, hourly precision only (see §F) | Same Hobby limits | GitHub Actions free tier: 2000 min/month (irrelevant at this frequency), no Hobby-plan cron limit, but adds an unrelated platform dependency |
| Effect on future scaling | Establishes the exact "Production Cron + kill switch" pattern variant B will reuse later — zero throwaway work | Is itself the end-state variant, but skips the "prove Production Cron works safely first" step | Would need to be discarded once Production Cron is eventually adopted for the writer — pure throwaway work |

**Recommendation: Variant A first** (dry-run cron in Production), for
the lowest possible first-touch risk on Production — this exercises
the entire Vercel Cron → auth → source-fetch → response path with a
route that is structurally incapable of writing, before Production
ever runs the writer on any schedule. This is the same "smallest
surface first" principle used throughout Sprints 147–150. Variant B
(writer on a schedule) remains the eventual goal but is explicitly
**out of scope for this sprint's cron proposal** — see the gates in §I.
Variant C is not recommended at any point: it only ever reaches the
already-safest endpoint (A) while adding a second secret store and a
new platform dependency for no risk reduction over just running A
directly on Vercel Cron once Production is the target anyway.

---

## F. Source frequency audit — `michalowice-komunikaty`

**Data actually available in this project (no live fetch performed for
this audit — none was needed):**

- `src/lib/officialSourceChecklist.ts` (Sprint 129, the canonical
  human-maintained source registry) already classifies
  `michalowice-komunikaty`'s manual-check cadence as **`frequency:
  "weekly"`** — this reflects Adam's own observed real-world posting
  rhythm for gmina Michałowice's komunikaty page, not a guess made for
  this audit.
- Recorded candidate history for this source across the entire
  project: **exactly 2 real writer-created candidates** exist to date
  — one from the Sprint 148 controlled write test, one from this
  session's Sprint 150 Phase B controlled test — both manual, one-off,
  months apart in project time. This is consistent with, not
  contradicting, the "weekly" classification: a low, bursty real
  posting rate.
- No `source_checks` history from a real recurring schedule exists yet
  (by design — no schedule has ever run; every logged check to date
  was a one-off manual/controlled test).

**Recommended first-schedule frequency: once daily.** Reasoning: the
source's own real posting cadence is roughly weekly, so daily is
already a comfortable safety margin above the rate of actual new
content, catching anything within at most ~24h of publication without
over-polling a small municipal site. Vercel's Hobby plan caps a single
cron job at **once per day with only hour-level precision** (no
sub-daily schedules, no minute-level control) — so daily is also
simply the finest granularity available without upgrading the Vercel
plan, making it both the technically-simplest and the risk-appropriate
choice; there is no meaningful tradeoff to weigh here between "ideal"
and "available."

**Recommended time: 05:00 UTC**, described as a relationship rather
than a hard local-time constant, since Poland observes DST (CET,
UTC+1, roughly late October–late March; CEST, UTC+2, roughly late
March–late October — exact transition dates shift slightly year to
year and should be read off the current calendar at activation time,
not assumed from this document). At 05:00 UTC that is **07:00 local
time in winter (CET) or 06:00 local time in summer (CEST)** — early
enough to run well before any office-hours traffic to gmina
Michałowice's own site, and to have results ready in the admin queue
before a typical morning admin check-in, without asserting a specific
"why this exact hour" justification beyond that generic reasoning —
Adam may prefer a different hour for his own morning-check habits, and
nothing here locks the choice in (see the JSON proposal in §I, which
is not wired into any active `vercel.json`).

---

## G. Production env inventory (via actual `process.env` reads, no values shown)

Full audit performed via `grep -rn "process\.env\." src/` — every
match categorized below; nothing inferred or assumed.

**PUBLIC EXISTING** (already required for the site to function at all,
unrelated to this sprint):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `ANTHROPIC_API_KEY` (server-only, `/api/ai/draft-alert` — pre-existing, unrelated to cron)

**SERVER-ONLY REQUIRED FOR DRY-RUN** (`/api/cron/check-sources`):
- `SCHEDULED_CHECKS_ENABLED` (must be literal `"true"`)
- `CRON_SECRET`

**SERVER-ONLY REQUIRED ONLY FOR WRITER** (`/api/cron/write-candidates`,
in addition to everything the dry-run route needs — the writer route
checks `SCHEDULED_CHECKS_ENABLED` too, per its own two-kill-switch
design):
- `SCHEDULED_WRITES_ENABLED` (must be literal `"true"`)
- `SUPABASE_SCHEDULED_WRITER_EMAIL`
- `SUPABASE_SCHEDULED_WRITER_PASSWORD`

**OPTIONAL SAFETY FLAGS** (writer-only, all have safe conservative
defaults when unset — see `scheduledWriter.ts`):
- `SCHEDULED_WRITER_FINGERPRINT_ENABLED` (default: off → `content_fingerprint` omitted from insert)
- `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` (default: `["michalowice-komunikaty"]` only)
- `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN` (default: `1`)
- `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` (default: unset → `source_checks` logging for a source is skipped gracefully, candidate insert unaffected)

**Minimal Production env set for the first dry-run cron (Variant A,
§E): exactly 2 variables — `SCHEDULED_CHECKS_ENABLED` and
`CRON_SECRET`.** No writer credentials, no fingerprint flag, no
registry map — none of those are read anywhere in `check-sources`'s
import chain. This is the smallest possible secret footprint for the
recommended first step.

---

## H. Production resting state design

### Resting state after code release, before any cron (recommended default)

```
SCHEDULED_CHECKS_ENABLED = false   (or simply unset)
SCHEDULED_WRITES_ENABLED = false   (or simply unset)
SCHEDULED_WRITER_FINGERPRINT_ENABLED = unset
```

**Fingerprint flag: recommend leaving it unset, not `true`, in this
specific resting state.** Reasoning: with `SCHEDULED_WRITES_ENABLED`
already `false`, the flag has zero behavioral effect either way (it
only matters inside the insert-payload builder, which the write route
never reaches with writes off) — but leaving Production's env
deliberately minimal (fewest flags touched = fewest things to reason
about later) is safer than pre-setting a flag with no active effect
yet. This differs from Preview's current state (flag `true`, Sprint
150) on purpose: Preview's flag was turned on specifically to prove the
fingerprint mechanism end-to-end before Production exists at all;
Production has no such need until its own writer is actually being
turned on, at which point setting the flag becomes part of that
later, separately-approved step.

No active cron in this state (no `crons` array committed anywhere).
Public app is fully unaffected — nothing above is read by any public
or admin page.

### State for the first dry-run cron (once approved and activated)

```
SCHEDULED_CHECKS_ENABLED = true
SCHEDULED_WRITES_ENABLED = false   (unchanged — stays off)
CRON_SECRET = <new, Production-only value, never copied from Preview>
```

No other variable needs to change. `SCHEDULED_WRITER_FINGERPRINT_ENABLED`
and the writer credentials remain unset — the dry-run route never reads
them.

**Nothing in this section was configured in Vercel.** This is a design
only.

---

## Related

`docs/SPRINT_149_FIRST_SCHEDULE_READINESS_V1.md` (original variant
analysis, superseded in the cron-choice specifics by §E above but its
Vercel-Cron-Preview-doesn't-exist finding still holds and is cited
directly) · `docs/SPRINT_150_RACE_CONDITION_DEPLOYMENT_RUNBOOK_V1.md` ·
`docs/SPRINT_150_FINGERPRINT_PREVIEW_ACTIVATION_RUNBOOK_V1.md` ·
`docs/SPRINT_151_FIRST_DRY_RUN_CRON_RUNBOOK_V1.md` ·
`docs/SPRINT_151_PRODUCTION_SMOKE_TEST_RUNBOOK_V1.md`.
