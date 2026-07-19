# Sprint 164C — Canary Environment Safety Audit

**Status:** documentation-only, branch `sprint-164c-canary-environment-safety-runbook-v1`, not merged to `main`. No environment variable, RLS policy, or database row was changed as part of this sprint. No code was changed.

**Trigger:** a read-only audit (conducted in-conversation before this sprint, findings confirmed by Adam) found that Vercel's Preview and Production environments for `alertownik-mvp` share a single Supabase project. This document records that finding formally and captures the corrections it required.

---

## 1. Preview/Production database separation — confirmed finding

**SAME PROJECT.** In Vercel → Project Settings → Environment Variables, `NEXT_PUBLIC_SUPABASE_URL` exists as exactly **one row**, scoped to **"Production and Preview" together** — not as two separate rows with independent values. This is the standard Vercel UI representation of a single shared value applied to both environments.

**Method and its limit:** this was confirmed by inspecting the environment-scope grouping in the Vercel dashboard, without opening, editing, or copying the variable's actual value (no `Edit`/`Rotate`/`Copy to Clipboard` action was ever clicked). This is strong structural evidence, not a byte-for-byte value comparison — but it is the standard, reliable signal Vercel's own UI provides for "these environments share this value," and Adam has independently confirmed the conclusion.

**Consequence:** any write performed by `write-candidates` — from a Preview URL or the Production URL, under any Vercel environment variable configuration — lands in the same `source_notice_candidates` and `source_checks` tables, visible in the same `/admin/queue` regardless of which URL triggered it. Preview provides code isolation (a different deployed commit/build) but **not data isolation**.

## 2. Decision (Adam, this sprint)

**Option A chosen: keep the single shared Supabase project.** No new Supabase project is created. No database migration. This is treated as an accepted, documented characteristic of the current MVP setup — not a defect requiring an immediate fix. A separate Preview database remains a **future option**, revisitable if/when the project's risk profile changes (e.g., before scheduling automatic writes on a cron, or before onboarding additional admins who might experiment on Preview).

**What this changes today:** documentation and the activation runbook, so that nobody — Adam in a future session, or Claude in a future sprint — is misled into treating a Preview canary run as lower-risk than a Production one. See `docs/SPRINT_164B_CANARY_ACTIVATION_RUNBOOK_V1.md`'s new notice at the top, and its restructured Stage 0–7 (particularly the new Stage 4 pre-flight checklist and Stage 6 post-run verification with explicit PASS/STOP/ROLLBACK criteria).

## 3. Orphaned branch-scoped environment variables — read-only inventory

Two old feature branches still exist in the repository (confirmed via `git ls-remote --heads origin`, a read-only git operation — no Vercel or Supabase access involved) and still have Vercel environment variables scoped specifically to their branch name:

### `sprint-148-controlled-writer-preview`

| Variable | Scope | Added/Updated |
|---|---|---|
| `SCHEDULED_WRITES_ENABLED` | Preview, this branch only | Updated Jul 11 |
| `SCHEDULED_CHECKS_ENABLED` | Preview, this branch only | Added Jul 11 |
| `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` | Preview, this branch only | Added Jul 11 |
| `SUPABASE_SCHEDULED_WRITER_EMAIL` | Preview, this branch only | Added Jul 11 |
| `SUPABASE_SCHEDULED_WRITER_PASSWORD` | Preview, this branch only | Updated Jul 11 |
| `CRON_SECRET` | Preview, this branch only | Added Jul 11 |

### `sprint-150-race-condition-closure-package-v1`

| Variable | Scope | Added/Updated |
|---|---|---|
| `SCHEDULED_WRITES_ENABLED` | Preview, this branch only | Updated Jul 12 |
| `SCHEDULED_CHECKS_ENABLED` | Preview, this branch only | Added Jul 12 |
| `SCHEDULED_WRITER_FINGERPRINT_ENABLED` | Preview, this branch only | Added Jul 12 |
| `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` | Preview, this branch only | Added Jul 12 |
| `SUPABASE_SCHEDULED_WRITER_EMAIL` | Preview, this branch only | Added Jul 12 |
| `SUPABASE_SCHEDULED_WRITER_PASSWORD` | Preview, this branch only | Added Jul 12 |
| `CRON_SECRET` | Preview, this branch only | Added Jul 12 |

**No values were opened, copied, or revealed for any of the above.** Only name, scope (Preview), and branch were read from the list view.

### Assessment

1. **Likely orphaned, yes.** Both branches predate this sprint by roughly a week and appear to represent earlier, now-superseded attempts at the same "controlled writer" work that Sprints 147–153 and 164A/164B eventually formalized on `main`. Neither branch name appears anywhere in `docs/ROADMAP.md`'s "current work" sections or in the Sprint 164A/164B/164C documents as active.
2. **Would deleting them be safe?** Deleting the *environment variables* (not the branches themselves) would very likely be safe — nothing on `main`, in the current canary architecture, or in any active runbook depends on `sprint-148-controlled-writer-preview` or `sprint-150-race-condition-closure-package-v1` by name. **This audit does not delete anything** — that is explicitly out of scope for a read-only pass, and deleting environment variables is a write action requiring its own deliberate confirmation.
3. **Exact manual steps for Adam to take later** (not performed now):
   - Confirm neither branch has uncommitted, wanted work by checking `git log <branch> --oneline -5` for each and comparing against what's already on `main`.
   - If confirmed superseded: in Vercel, delete the 6 variables under `sprint-148-controlled-writer-preview` and the 7 under `sprint-150-race-condition-closure-package-v1` (13 total), one at a time, confirming each deletion individually rather than in bulk.
   - Optionally, also delete the git branches themselves (`git push origin --delete sprint-148-controlled-writer-preview sprint-150-race-condition-closure-package-v1`) once their environment variables are gone — this is a separate, even-lower-risk cleanup step since the commits remain reachable in history either way.
4. **Risk of leaving them as-is:** low but non-zero. As long as these two branch names are never pushed to again, their environment variables are inert — Vercel only applies branch-scoped variables to a deployment built from that exact branch ref. The risk is specifically: if anyone (Adam, a future Claude session, a collaborator) ever reuses one of these two exact branch names for new work without knowing this history, that new Preview deployment would silently inherit a pre-configured write-mode credential set — an unexpected, easy-to-miss state. This is a real but low-likelihood residual risk, worth cleaning up eventually, not urgent.

## 4. Plan for the next session (not executed now)

In order:

1. **Decide whether to delete the orphaned branch-scoped env vars** (§3) — a quick yes/no from Adam, then the deletion itself if yes.
2. **Verify the scheduled-writer technical account** actually exists and is genuinely a row in `public.automation_identities` (read-only SQL verify, already drafted — `docs/sql/VERIFY_SCHEDULED_WRITER_AUTOMATION_IDENTITY_READ_ONLY_V1.sql`).
3. **Verify `automation_identities` RLS** is still the live-verified Sprint 146 configuration (read-only SQL verify, already drafted — `docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql`).
4. **Configure the required environment variables** for the run (per the corrected runbook's Stage 2–3) — presence and scope only discussed here, no values ever written into any document.
5. **One manual canary run** (runbook Stage 5), preceded by the full Stage 4 pre-flight checklist.
6. **Verify the result** (runbook Stage 6) against the explicit PASS/STOP/ROLLBACK criteria.
7. **Immediate kill-switch readiness** — confirm Adam knows, without looking it up, that removing `SCHEDULED_WRITES_ENABLED` stops everything instantly.
8. **Decide whether to repeat the canary run** a second/third time on different days before considering any schedule — a judgment call for Adam based on Stage 6's results.
9. **Only after multiple clean manual runs, a separate, later decision** about a `vercel.json` cron entry (runbook Stage 7) — its own explicit go-ahead required, not a default next step.

## 5. What this sprint deliberately did not do

- Did not create a new Supabase project or database.
- Did not activate `SCHEDULED_CHECKS_ENABLED`, `SCHEDULED_WRITES_ENABLED`, or any other automation flag anywhere.
- Did not run `write-candidates`, any cron, or any other write-capable endpoint.
- Did not execute any SQL.
- Did not modify any RLS policy.
- Did not delete, edit, or add any Vercel environment variable — the 13 orphaned entries in §3 remain exactly as found.
- Did not publish, edit, or archive any alert or candidate.
- Did not change any code — only documentation.
