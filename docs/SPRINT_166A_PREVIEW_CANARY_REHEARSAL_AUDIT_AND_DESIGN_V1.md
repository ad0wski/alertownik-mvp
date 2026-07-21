# Sprint 166A — Preview Canary Rehearsal: Audit and Design

**Status:** Design and read-only audit only. Nothing was activated, no Vercel variable was added, no SQL was run, no cron was invoked. This document is the buildable plan for a future, separately-approved execution phase (Sprint 166B or later).

**Scope boundary:** this sprint exists specifically because Sprint 165C made Preview a genuinely isolated Supabase project. Before that, there was no safe place to rehearse the candidate-automation pipeline at all — a "Preview" run would have written to Production's own data (Sprint 164C's finding). That blocker is gone; this document is the first real plan to use the new isolation for something.

---

## A. Full pipeline audit

### A.1 — Data flow map

```
Official source (Michałowice/WKD webpage)
        │
        ▼
GET /api/cron/check-sources  ─┐
GET /api/cron/check-michalowice ─┴─► checkOneSource() → parsePageHtml() → buildCheckProposals()
        │                                  (src/lib/cronCheckSources.ts, src/lib/sourceCheck.ts)
        │  DRY RUN — zero writes, zero Supabase import, structurally enforced
        ▼
   JSON summary only (proposalCount, outcome) — nothing persisted
```

```
GET /api/cron/write-candidates
        │
        ├─ Layer 0: checkDatabaseEnvironmentGuard()          (src/lib/databaseEnvironmentGuard.ts)
        ├─ Layer 1: SCHEDULED_CHECKS_ENABLED === "true"
        ├─ Layer 2: SCHEDULED_WRITES_ENABLED === "true"
        ├─ CRON_SECRET bearer-token check                    (src/lib/cronCheckSources.ts)
        ├─ Layer 3: SUPABASE_SCHEDULED_WRITER_EMAIL/PASSWORD configured + successful sign-in
        │           + automation_identities membership (RLS-enforced, not just app-checked)
        ▼
   fetch + parse official source (same as dry-run path)
        ▼
   writeCandidatesForSource()                                (src/lib/scheduledWriter.ts)
        ├─ dedup: classifyCandidateAgainstExisting() — duplicate / ambiguous / new
        ├─ per-invocation cap: getMaxCandidatesPerInvocation() — default 1
        ├─ source allowlist: getAllowedWriteSourceIds() — default ["michalowice-komunikaty"]
        ├─ optional DB-level fingerprint uniqueness: isContentFingerprintEnabled()
        ▼
   INSERT source_notice_candidates (status='pending', verification_status='unverified')
   INSERT source_checks (result='no_changes'|'found_notice', created_by=writer uid)
        │
        ▼
   Admin reviews candidate manually in /admin/sources → /ai-helper → /builder
        │
        ▼
   Alert published — ALWAYS a human action, no code path skips this
```

### A.2 — Inventory

| Category | Items |
|---|---|
| **Endpoints** | `GET /api/cron/check-sources` (dry-run, any allowlisted source), `GET /api/cron/check-michalowice` (dry-run, Michałowice only, the one wired in `vercel.json`), `GET /api/cron/write-candidates` (write-capable, the one this sprint plans to rehearse) |
| **Cron entries** | `vercel.json`: one entry, `/api/cron/check-michalowice` at `0 5 * * *` — a **dry-run only**, zero writes. `write-candidates` is **not** in `vercel.json` at all; it can only be invoked by a manual HTTP call today |
| **Environment variables (all currently unset on Preview and Production)** | `SCHEDULED_CHECKS_ENABLED`, `SCHEDULED_WRITES_ENABLED`, `CRON_SECRET`, `SUPABASE_SCHEDULED_WRITER_EMAIL`, `SUPABASE_SCHEDULED_WRITER_PASSWORD`, `SCHEDULED_WRITER_FINGERPRINT_ENABLED`, `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN`, `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS`, `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS`, `SUPABASE_ENVIRONMENT_TAG`, `SUPABASE_EXPECTED_PROJECT_REF` |
| **Auth accounts** | On `alertownik-preview`: `preview-test-admin@example.invalid` (admin_profiles) and `preview-test-writer@example.invalid` (automation_identities) — both created in Sprint 165C Phase 4, both password-only, neither ever seen by Claude |
| **Tables touched by a write run** | `source_notice_candidates` (insert only), `source_checks` (insert only) — never `alerts`, never `alert_sources` |
| **RLS policies relevant to the writer identity** | Scheduled-writer role can INSERT into `source_notice_candidates`/`source_checks` and SELECT its own prior candidates for dedup; no SELECT on `alert_sources`, no UPDATE/DELETE anywhere, no access to `alerts` at all (Sprint 146 design, unchanged since) |
| **Kill switches** | Four independent, all-required: (0) database-environment guard, (1) `SCHEDULED_CHECKS_ENABLED`, (2) `SCHEDULED_WRITES_ENABLED`, (3) scheduled-writer credentials + RLS membership |
| **Limits** | `DEFAULT_MAX_CANDIDATES_PER_INVOCATION = 1` (env-overridable, but every override is still filtered — never removable); `DEFAULT_ALLOWED_WRITE_SOURCE_IDS = ["michalowice-komunikaty"]` (env-overridable, but always filtered through the existing `SAFE_CHECK_SOURCE_IDS` allowlist — can never point at an arbitrary source) |
| **Idempotency / race safety** | Three-way in-memory dedup (`classifyCandidateAgainstExisting`, thresholds 0.6/0.9) + an optional DB-level unique constraint on `(source_key, content_fingerprint)` (Sprint 150, `isContentFingerprintEnabled()`) that catches a genuine concurrent-invocation race the in-memory check cannot see |
| **Dry-run paths** | `check-sources`/`check-michalowice` are structurally zero-write (no Supabase import at all in that file, enforced by a static-import test) — these already serve as the "rehearse before the first real write" step |
| **Logs / rollback points** | The write route's JSON response is the only per-run record today (per-source counts: `proposalsFound`, `candidatesInserted`, `duplicatesSkipped`, `ambiguousCandidates`, `cappedSkipped`, `duplicatesPreventedByDatabase`) — nothing is persisted to a table (`WRITER_MONITORING_UNTRACKED_NOTE`, `src/lib/writerCandidateActivity.ts`, documents this honestly). Rollback is always a manual delete of the specific `pending` candidate row(s) created — no other table is ever touched, so rollback can never affect an alert |

### A.3 — What's confirmed OFF today

- `SCHEDULED_CHECKS_ENABLED` / `SCHEDULED_WRITES_ENABLED`: unset on both Production and Preview
- `write-candidates` is not in `vercel.json` — cannot run on any schedule, only via a manual authenticated call
- `databaseEnvironmentGuard`'s `SUPABASE_ENVIRONMENT_TAG`/`SUPABASE_EXPECTED_PROJECT_REF`: unset everywhere — this alone already blocks `write-candidates` in every environment, independent of the other three layers
- No scheduled-writer credentials configured in any Vercel scope

---

## B. Design: the smallest safe first Preview canary

**Single source, single invocation, manual trigger, hard cap of 1.**

| Requirement (from the brief) | How this design satisfies it |
|---|---|
| Runs only on Preview | Layer 0 guard requires `SUPABASE_ENVIRONMENT_TAG=preview` + `SUPABASE_EXPECTED_PROJECT_REF=nowvcdbtgaigutyxpmdp` — configuring these only in Vercel's **Preview** scope means a Production invocation fails closed structurally, not by discipline |
| Never touches Production | The scheduled-writer account only exists on `alertownik-preview`; even if someone pointed a request at the Production URL, the account credentials wouldn't authenticate against Production's Supabase project at all |
| At most one / very few sources | `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` left **unset** → defaults to `["michalowice-komunikaty"]` only (the existing default, no override needed) |
| Prefers synthetic data or one safe test source | The live official Michałowice announcements page is the same one already dry-run tested since Sprint 142 — real content, but a genuinely public municipal announcements page, not user data. No synthetic-source fetch exists (fetching is always a real HTTP call to a real URL) — this is accepted, matching how `check-michalowice`'s existing dry-run has already run safely |
| Hard cap on candidates | `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN` left **unset** → defaults to `1` (already the safest value; no override needed for the first rehearsal) |
| Clear dry-run before first write | Run `GET /api/cron/check-michalowice` (already cron-wired, zero-write) first — confirms the source is reachable and what it would find, with **zero** database risk, before ever calling `write-candidates` |
| Kill switch | All four layers (0–3) must be manually enabled by Adam in Vercel's dashboard before anything can run; any one left off keeps the route fully inert |
| Never auto-publishes alerts | Structural: `writeCandidatesForSource()` and `write-candidates/route.ts` never import any alert-publish, Builder, or draft helper — there is no code path from this route to `alerts` at all |
| Ends on `pending` | Every successful insert sets `status: 'pending'`, `verification_status: 'unverified'` — identical shape to a manually-saved candidate, reviewed the same way in `/admin/sources` |
| Fully manually reviewable before any further action | The resulting candidate is inert until an admin opens `/admin/sources` → reviews it → decides whether to promote it via the existing `/ai-helper` → `/builder` flow, exactly as today's manual "Sprawdź stronę" flow works |

**This design is not executed in this session.**

---

## C. Environment variables required for a future canary run

| Variable | Purpose | Secret? | Source of value | Regenerable? | Vercel scope | Starting value |
|---|---|---|---|---|---|---|
| `SCHEDULED_CHECKS_ENABLED` | Layer 1 kill switch | No | Literal | N/A | Preview only | `"true"` |
| `SCHEDULED_WRITES_ENABLED` | Layer 2 kill switch | No | Literal | N/A | Preview only | `"true"` |
| `CRON_SECRET` | Bearer-token auth for the cron routes | **Yes** | A fresh random value | Yes — generate new, **never reuse Production's** | Preview only | Adam must generate and paste a new random value (e.g. via his own password manager or `openssl rand -hex 32`) — Claude must not generate or see it |
| `SUPABASE_SCHEDULED_WRITER_EMAIL` | Sign-in identity for Layer 3 | No (already a non-secret `@example.invalid` convention value) | Already created (Sprint 165C Phase 4): `preview-test-writer@example.invalid` | N/A, already exists | Preview only | Adam pastes the existing value |
| `SUPABASE_SCHEDULED_WRITER_PASSWORD` | Sign-in credential for Layer 3 | **Yes** | The password Adam set when creating the account in Sprint 165C Phase 4 | No — must be the actual existing password, not regenerated (regenerating would require resetting the Preview account) | Preview only | Adam pastes it directly into Vercel; Claude must never see or type it |
| `SCHEDULED_WRITER_FINGERPRINT_ENABLED` | Enables the DB-level unique-constraint race guard | No | Literal | N/A | Preview only | `"true"` is safe to set from the start — the `content_fingerprint` column and its unique index already exist on `alertownik-preview` (replayed from Production's live schema in Sprint 165C Phase 3, confirmed in `docs/sql/SPRINT_165C_AS_BUILT_SCHEMA_NOT_EXECUTED_V1.sql`) |
| `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN` | Overrides the default cap | No | Literal | N/A | Preview only | **Leave unset** — the built-in default (`1`) is already the safest possible value for a first rehearsal |
| `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` | Overrides the default source allowlist | No | Literal JSON array | N/A | Preview only | **Leave unset** — the built-in default (`["michalowice-komunikaty"]`) is already the narrowest possible value |
| `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` | Maps `sourceKey` → `alert_sources.id` so `source_checks` can log against a real registry row | No (a UUID, not a secret) | The Michałowice row's `id` in `alertownik-preview`'s own `alert_sources` table | N/A, must be read (not generated) | Preview only | Optional for the first rehearsal — if left unset, candidate creation still works identically; only the `source_checks` log entry is skipped gracefully |
| `SUPABASE_ENVIRONMENT_TAG` | Layer 0 guard signal 2 | No | Literal | N/A | Preview only | `"preview"` |
| `SUPABASE_EXPECTED_PROJECT_REF` | Layer 0 guard signal 4 | No (a project ref, not a secret — already visible in the Preview `NEXT_PUBLIC_SUPABASE_URL`) | `alertownik-preview`'s own project ref | N/A | Preview only | `nowvcdbtgaigutyxpmdp` |

None of these were added, edited, or removed in this session.

---

## D. Scheduled-writer identity — read-only confirmation

Confirmed from the existing, already-verified Sprint 165C Phase 4 record (`docs/SPRINT_165C_PHASE_4_AUTH_AND_SYNTHETIC_SEED_V1.md`), not re-queried in this session (no new sign-in, no new database call was made):
- The Preview scheduled-writer account (`preview-test-writer@example.invalid`) exists on `alertownik-preview`.
- It has exactly **one row** in `automation_identities`, verified read-only at the time it was created, with a UID distinct from the test admin's.

No email, password, or other secret value is repeated here beyond what Sprint 165C Phase 4 already recorded as non-secret (the `@example.invalid` address itself). No sign-in or write was performed to reach this confirmation.

---

## E. Code-safety assessment

**Verdict: the existing safeguards are already sufficient for a small first canary. No code change is required or was made.**

Checked against each risk named in the brief:
- **Hard limit** — present (`DEFAULT_MAX_CANDIDATES_PER_INVOCATION = 1`), enforced server-side only, never caller-controlled.
- **Dry-run mode** — present, as a genuinely separate, already-proven route (`check-michalowice`), not a flag on the write route itself; running it first is a process step (documented in §F below), not a missing code feature.
- **Source allowlist** — present at two layers: the write-route's own narrower default, and the underlying `SAFE_CHECK_SOURCE_IDS` ceiling that no env override can exceed.
- **Readable reporting** — present in the route's JSON response (per-source counts for every outcome category); sufficient for a manually-triggered first rehearsal where Adam reads the response directly.

No new environment variable, gate, or test was added this session — adding one where the existing default is already the safest possible value would be unnecessary surface area, not a safety improvement.

---

## F. Manual execution checklist for the next phase (not performed now)

1. **Adam creates/pastes, Preview scope only:** `SCHEDULED_CHECKS_ENABLED=true`, `SCHEDULED_WRITES_ENABLED=true`, a freshly-generated `CRON_SECRET`, `SUPABASE_SCHEDULED_WRITER_EMAIL` (existing value), `SUPABASE_SCHEDULED_WRITER_PASSWORD` (existing value), `SCHEDULED_WRITER_FINGERPRINT_ENABLED=true`, `SUPABASE_ENVIRONMENT_TAG=preview`, `SUPABASE_EXPECTED_PROJECT_REF=nowvcdbtgaigutyxpmdp`.
2. **Claude in Chrome can, once the above is set:**
   - Trigger `GET /api/cron/check-michalowice` (dry run) via a direct browser/URL request and confirm the JSON response — zero writes, no auth needed beyond `CRON_SECRET` if the caller supplies it.
   - Before and after any write step, read-only query `source_notice_candidates`/`source_checks` on `alertownik-preview` (via the Supabase dashboard or admin UI) to record row counts.
   - Trigger exactly **one** `GET /api/cron/write-candidates` call against the Preview deployment.
   - Re-check row counts and the JSON response.
   - Verify in `/admin/sources` on the Preview deployment that the new candidate appears as `pending`.
3. **Order of operations:**
   1. Confirm all Preview env vars above are set (Adam confirms in chat, values never pasted into the conversation).
   2. Read-only baseline: record current `source_notice_candidates`/`source_checks` row counts on `alertownik-preview`.
   3. Run the dry-run (`check-michalowice`) once — confirm it reports a proposal count consistent with the live source's current content.
   4. Run `write-candidates` exactly once.
   5. Re-check row counts and the response body.
4. **PASS criteria:** response has `ok: true`, `published: false`; `candidatesInserted` is 0 or 1 (never more); every inserted row (if any) has `status='pending'`; no `alerts` row was created or modified; the environment badge on the Preview page used still reads `PREVIEW`; no error in the response.
5. **STOP criteria:** any `5xx`/`ok: false` response other than an expected kill-switch message; `candidatesInserted` > 1 in a single invocation; any write appears in `alerts`; the environment guard fails with anything other than an intentional pre-configuration state; any Supabase call is observed targeting Production's project ref.
6. **Rollback (never touches Production):** delete the specific `pending` row(s) created in `source_notice_candidates` (and their paired `source_checks` row, if any) directly on `alertownik-preview` via the Supabase dashboard — no code change, no redeploy, no RLS change needed. Setting `SCHEDULED_WRITES_ENABLED` back to unset/false immediately re-disables the route.

---

## G. Roadmap addition — nationwide direction (design note only, not implemented)

Recorded in `docs/ROADMAP.md` as a new future stage: after the canary is confirmed successful, the next large area of work is a nationwide official-source registry —
- Full Poland hierarchy: województwo → powiat → gmina → miejscowość → dzielnica/sołectwo.
- Source classification by alert category (transport/water/power/roads/waste/municipal).
- Per-source quality/availability status (building on the existing Link Health Panel concept).
- Duplicate detection across sources (building on the existing fuzzy/DB-fingerprint dedup).
- Manual and automated verification stages.
- Location- and interest-based personalization (building on the existing "Moja okolica" local-only preferences).
- A separate, later legal/RODO and location-consent design stage — explicitly not part of this or any current sprint.

**None of this is implemented. This is a roadmap entry only.**

---

## H. Change control

- Files changed this session: this document, plus a `docs/ROADMAP.md` addition recording the design-only Sprint 166A stage and the nationwide direction note.
- No source code was changed. No new test was added (no code changed to test).
- `git diff --check` run on the documentation change; full `npm run check`/`test:e2e`/`test:pwa`/`build` not required for a documentation-only change, per instructions.
