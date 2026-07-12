# Sprint 152A — Production Manual Dry-Run Runbook v1

**Status: PLAN PREPARED, NOT EXECUTED.** No Vercel environment variable
has been set or changed for this. No Production redeploy has been
triggered. No request has been made. This document exists so that,
WHEN Adam decides to run the first manual Production validation of
`/api/cron/check-sources`, every step is already reviewed, ordered,
and reversible — not so that it happens automatically.

See `docs/SPRINT_151_PRODUCTION_RELEASE_AUDIT_V1.md` and
`docs/SPRINT_152_PRODUCTION_MANUAL_DRY_RUN_RUNBOOK_V1.md` (this file)
for the zero-write audit backing every claim below — re-confirmed
directly against the deployed code on `main` (commit `4ce2f4a`), not
assumed from the route's name.

---

## 🔒 CONTROLLED PRODUCTION MANUAL DRY-RUN APPROVAL REQUIRED

**This prompt/document is not itself that approval.** Nothing in FAZA
A–C below executes until Adam explicitly approves, in a separate
message, the specific action of setting Production env and making one
manual request. This gate is independent of, and does **not** grant,
**FIRST DRY-RUN CRON ACTIVATION APPROVAL REQUIRED**
(`docs/SPRINT_151_FIRST_DRY_RUN_CRON_RUNBOOK_V1.md` §0) — a manual
one-off validation and an actual recurring Vercel Cron schedule are two
separate decisions; clearing this gate does not imply the other is
cleared.

---

## Target endpoint

`GET /api/cron/check-sources?sourceKey=michalowice-komunikaty` —
narrowed to Michałowice only for this manual test, consistent with
this project's established "narrowest scope first" pattern (Sprints
148/150), even though the route is zero-write regardless of scope (see
zero-write audit below).

## Zero-write audit (re-confirmed for this sprint)

Direct code read of `src/app/api/cron/check-sources/route.ts` and its
full import chain (`src/lib/cronCheckSources.ts`,
`src/lib/sourceParsers/pageParser.ts`, `src/lib/sourceCheck.ts`):

- **Zero Supabase import anywhere in the chain** — confirmed by direct
  grep (only comment-line mentions explaining the absence) and by the
  existing dedicated test
  (`tests/e2e/cronCheckSourcesRoute.spec.ts`'s static-import-audit,
  which asserts none of `supabaseCandidateWrites`,
  `supabaseSourceWrites`, `supabaseAlertWrites`,
  `SUPABASE_SERVICE_ROLE`, the Supabase client import, or
  `@supabase/supabase-js` appear anywhere in the route or its lib
  module).
- **Zero INSERT/UPDATE/DELETE/UPSERT/RPC** — confirmed by grep across
  the full chain; the only `.update(` matches found are Node's
  `crypto.createHash(...).update()` calls (hash-digest API, unrelated
  to any database), not Supabase writes.
- **No technical-account sign-in** — no writer identity exists
  anywhere in this route's execution path.
- **No writer env read** — `SUPABASE_SCHEDULED_WRITER_EMAIL/PASSWORD`,
  `SCHEDULED_WRITER_FINGERPRINT_ENABLED`,
  `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` are never referenced anywhere
  in this route or its imports.
- **`published` is a hardcoded literal `false`** in
  `buildDryRunSummary` — never computed, never conditionally set to
  `true`.
- **No access to `alerts`** — no import of any alert-publishing,
  draft, or candidate-approval helper.

**Conclusion: `/api/cron/check-sources` is structurally incapable of
writing anything, under any Production configuration.** This manual
dry-run validates that fact against the real deployment; it does not
introduce any write risk itself.

## Exact expected success response (read from code, not guessed)

```json
{
  "ok": true,
  "dryRun": true,
  "checkedAt": "<ISO timestamp>",
  "checkedSources": 1,
  "successfulSources": 0,
  "failedSources": 0,
  "totalProposalCount": 0,
  "savedCandidates": 0,
  "savedSourceChecks": 0,
  "published": false,
  "message": "Dry-run: nic nie zostało zapisane w bazie, żaden kandydat ani historia sprawdzenia nie powstały, nic nie zostało opublikowane.",
  "results": [ /* one entry for michalowice-komunikaty */ ]
}
```

`checkedSources: 1` because the `?sourceKey=michalowice-komunikaty`
filter narrows `resolveCronSources` to exactly one source, unlike a
bare cron invocation (which would resolve both allowlisted sources —
see `docs/SPRINT_151_FIRST_DRY_RUN_CRON_RUNBOOK_V1.md` §5 for that
case). `successfulSources`/`failedSources`/`totalProposalCount` depend
on whether the live Michałowice page is reachable and has content at
test time — any combination that sums correctly is a valid, honest
result; only `savedCandidates`, `savedSourceChecks`, and `published`
are load-bearing safety fields that must be exactly `0`/`0`/`false`.

## Possible non-success statuses

- `503` `{"ok":false,"error":"Zaplanowane sprawdzenia są wyłączone."}` — `SCHEDULED_CHECKS_ENABLED` not `"true"`
- `503` `{"ok":false,"error":"Endpoint nieskonfigurowany."}` — `CRON_SECRET` unset
- `401` `{"ok":false,"error":"Unauthorized."}` — secret mismatch
- `404` / `500` / HTML body — would indicate a genuine deployment or routing problem, not a safety concern by itself, but a stop-and-investigate condition

---

## FAZA A — configure, deploy, inspect only (no request)

1. In Vercel, add to **Production** environment variables (Production
   scope only, never copied from Preview):
   - a **fresh, newly generated** `CRON_SECRET` (never reused from any
     Preview environment's value)
   - `SCHEDULED_CHECKS_ENABLED=true`
2. **Do not** add writer env (`SUPABASE_SCHEDULED_WRITER_EMAIL`,
   `SUPABASE_SCHEDULED_WRITER_PASSWORD`,
   `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS`) — not read by this route,
   not needed.
3. **Do not** add `SCHEDULED_WRITER_FINGERPRINT_ENABLED` — not read by
   this route, not needed.
4. **Do not** add any cron config — no root `vercel.json`, no `crons`
   array. This validation is a manual HTTP request, not a schedule.
5. Trigger a Production redeploy so the new env takes effect.
6. Confirm in the Vercel dashboard: `Environment: Production`,
   `Branch: main`, commit matches the currently-released one, status
   `Ready Latest`.

## FAZA B — one manual request

1. Run `scripts/invoke-sprint-152-production-dry-run.ps1` exactly
   once. It will prompt only for the Production `CRON_SECRET` (via
   `SecureString`, never echoed, never written to disk).
2. The script itself validates the response shape and prints
   `PASS`/`FAIL` — paste the safe JSON output (no secrets in it) back
   for review.
3. Do not re-run the script "just to be sure" — a second invocation is
   a fresh, separate decision, not a retry.

## FAZA C — after a positive result

1. Set `SCHEDULED_CHECKS_ENABLED=false` in Production.
2. Trigger a final Production redeploy so the change takes effect.
3. **Leave the Production `CRON_SECRET` in place** — it's the secret
   itself, not an activating flag; with checks disabled it has no
   effect, and keeping it saves re-generating and re-configuring it
   for the eventual real cron activation (Sprint 151's own runbook
   reuses the same variable).
4. No cron config is added at this point — that remains a distinct,
   separately-approved future step (see below).

---

## Relationship to the future cron proposal

`docs/vercel/PROPOSED_SPRINT_151_FIRST_DRY_RUN_CRON_V1.json` and
`docs/SPRINT_151_FIRST_DRY_RUN_CRON_RUNBOOK_V1.md` were reviewed for
this sprint — **no inaccuracy found, no update needed.** Both remain
accurate: the proposed schedule still targets this same endpoint
without a `sourceKey` filter (checking both allowlisted sources, per a
real recurring cron's bare-GET behavior), the auth mechanism
(`Authorization: Bearer <CRON_SECRET>`, auto-injected by Vercel Cron)
is unchanged, and the env requirements match. **This manual dry-run
(Sprint 152A) must pass before cron activation is even considered** —
it's the smaller, controlled precursor to that larger, recurring step.
**FIRST DRY-RUN CRON ACTIVATION APPROVAL REQUIRED** remains a wholly
separate gate, not satisfied by anything in this document.

## What this runbook does NOT authorize

- Any Vercel environment change.
- Any Production redeploy.
- The one manual request itself.
- Any cron config, root `vercel.json`, or scheduled activation.
- Any SQL, any RLS change.
- Any writer credential, fingerprint flag, or write-mode activation.
