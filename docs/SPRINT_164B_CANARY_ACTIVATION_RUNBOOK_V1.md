# Sprint 164B — Canary Activation Runbook

**Audience:** Adam, manually, step by step, in order. Nothing in this document is executed automatically by any sprint. Each step is independently reversible (see the paired rollback runbook, `SPRINT_164B_CANARY_ROLLBACK_AND_KILL_SWITCH_RUNBOOK_V1.md`).

**Precondition:** this branch (or its merge to `main`) is on Production, and you have read `docs/SPRINT_164B_SAFE_AUTO_CANDIDATE_CANARY_FOUNDATION_V1.md` §2–§5.

---

## ⚠️ Sprint 164C update — Preview and Production share one database

**A read-only environment audit (Sprint 164C, confirmed by Adam) found that Preview and Production currently point at the SAME Supabase project — `NEXT_PUBLIC_SUPABASE_URL` is a single shared value scoped to "Production and Preview" together in Vercel, not two separate values.**

This changes what "run it on Preview first" actually means, and every step below has been corrected accordingly:

1. **Preview and Production currently use the same Supabase database.** There is no environment-level data isolation between them today.
2. **A `write-candidates` call against a Preview URL writes to the exact same tables as a call against the Production URL.** `source_notice_candidates` and `source_checks` are not partitioned by environment — a row inserted from Preview is indistinguishable from one inserted from Production, and shows up in the same `/admin/queue` either way.
3. **Preview is not a sandbox for write operations.** It is a sandbox for *code* (different deployed commit, different build), but not for *data*. Read-only checks (the dry-run routes, the Link Health Panel, the automation status panel) are unaffected by this — they never write regardless of environment. This limitation is specific to any operation that writes.
4. **The first canary run must be treated as a Production-data operation, regardless of which URL it is triggered from.** Do not lower your guard because the URL says `-git-...-alertownik.vercel.app` instead of `alertownik-mvp.vercel.app`.
5. **Do not use the phrase "safely on Preview first" anywhere in this process** — it implies an isolation guarantee that does not exist today. If a genuinely separate Preview Supabase project is created in a future sprint, that phrasing can be restored and this notice can be removed.
6. **A separate Preview database remains a future option, not a current requirement.** Sprint 164C evaluated it and Adam decided not to create one now — see `docs/SPRINT_164C_CANARY_ENVIRONMENT_SAFETY_AUDIT_V1.md` for the full audit and reasoning. This is a deliberate scope decision, not an oversight.

Stages 2–4 below (previously framed as "Preview, low-risk") and Stage 5 (previously "repeat on Production") have been merged in spirit: **there is effectively one staged rollout, not two independent ones**, because both target the same data. The stage numbering below is kept for env-variable sequencing purposes only (kill switches are still set per-Vercel-environment, even though the database is shared).

---

## Stage 0 — Before touching anything

1. Open `/admin/sources` on Production, logged in as admin.
2. Expand "Stan automatyzacji (canary)" (the panel from Sprint 164B).
3. Confirm it shows: automatyczne sprawdzanie **wyłączone**, automatyczne tworzenie kandydatów **wyłączone**, dane konta writer **brak**. This is the expected starting state — if anything already shows as configured/enabled and you did not set it, **stop and investigate before proceeding.**
4. (`CRON_SECRET` may already show as **skonfigurowany** on Production — this is expected, pre-existing state from Sprints 151–153's dry-run cron, not a problem by itself. It alone does not enable any write; see the status panel's combined "zapis możliwy" indicator, which accounts for all four gates together.)

## Stage 1 — Technical writer account (one-time, database side)

This step was already fully designed and SQL-drafted in Sprint 147 (`docs/sql/INSERT_SCHEDULED_WRITER_AUTOMATION_IDENTITY_V1.sql`, verified with `VERIFY_SCHEDULED_WRITER_AUTOMATION_IDENTITY_READ_ONLY_V1.sql`). If not already done:

1. Create a dedicated Supabase Auth account for the writer (email/password), **not** an existing admin's own login.
2. Run the existing, already-reviewed SQL to add that account's `auth.uid()` to `public.automation_identities`.
3. Run the paired verify script (read-only) to confirm the row exists and nothing else changed.

If this account already exists from prior sprint work, skip to Stage 2.

## Stage 2 — Vercel environment variables

Since Preview and Production share one database (see the notice above), the *environment variable scope* still matters for which URL can trigger a write, but no longer implies data isolation. Set on whichever Vercel environment you intend to trigger the run from — **understanding that the effect on data is identical either way**:

- `SCHEDULED_CHECKS_ENABLED=true`
- `CRON_SECRET=<a newly generated, random secret — not reused from anywhere else>`

Leave `SCHEDULED_WRITES_ENABLED` and the writer credentials **unset** for now. This alone only enables the existing, already-Production-proven **dry-run** path (`/api/cron/check-michalowice`, `/api/cron/check-sources`) — no write is possible yet, by construction (Gate 2/4 in the main sprint doc's §5 diagram still fail closed).

Verify: open the automation status panel → "automatyczne sprawdzanie" now shows **aktywne**, "automatyczne tworzenie kandydatów" still shows **wyłączone**.

## Stage 3 — Enable write mode

- `SCHEDULED_WRITES_ENABLED=true`
- `SUPABASE_SCHEDULED_WRITER_EMAIL=<the Stage 1 account's email>`
- `SUPABASE_SCHEDULED_WRITER_PASSWORD=<the Stage 1 account's password>`

Do **not** set `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` or `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN` — leaving both unset keeps the conservative defaults (Michałowice only, cap of 1), which is the entire point of a canary.

Verify on the automation status panel: "automatyczne tworzenie kandydatów" now shows **aktywne**, "CRON_SECRET" and "dane konta writer" both show **skonfigurowane/skonfigurowany**, "zapis możliwy przy obecnej konfiguracji" shows **tak**.

## Stage 4 — Pre-flight safety checklist (mandatory, before the single manual run)

Work through every item below and confirm each one explicitly before triggering anything. Do not skip any item because an earlier sprint "already checked it once" — configuration and code can drift between sprints.

1. **Autopublish still does not exist.** Confirm in code (or re-run `npx playwright test tests/e2e/scheduledWriterRoute.spec.ts -g "static import audit"`) that `write-candidates/route.ts` and `scheduledWriter.ts` import no alert-publishing, Builder/draft, or candidate-approval helper.
2. **The endpoint writes only to `source_notice_candidates` (status `pending`) and `source_checks`.** Confirm via `grep -n "\.from(\"" src/lib/scheduledWriter.ts` — only these two table names should appear.
3. **Cap is 1 candidate per invocation.** Confirm `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN` is either unset (default `1`) or explicitly set to `1`.
4. **Allowlist is exactly `["michalowice-komunikaty"]`.** Confirm `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` is unset (default) or, if set, contains only this one id.
5. **The scheduled-writer account exists and is a row in `public.automation_identities`.** Confirm via the read-only verify SQL from Stage 1 (do not re-run the INSERT).
6. **RLS policies for the scheduled writer are the live-verified ones from Sprint 146.** Confirm via `docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql` (read-only) — do not alter RLS to "double check" anything.
7. **All four kill switches are in the state you expect.** Read the automation status panel one more time immediately before the run — not from memory of an earlier session.
8. **You know the exact, tested rollback step.** Removing `SCHEDULED_WRITES_ENABLED` in Vercel stops every future invocation at Gate 2, immediately, with no redeploy needed. Say this out loud (or write it down) before proceeding — you should not need to look it up mid-incident.
9. **You will trigger the run manually, once, and watch it happen.** Not via a cron, not via a script that might retry, not while distracted. See Stage 5.
10. **You have `/admin/queue` and Vercel's function logs open in separate tabs, ready to check immediately after.** See Stage 6.

If any single item above cannot be confirmed, **stop — do not proceed to Stage 5.**

## Stage 5 — The single manual canary run

Do this manually, once, via `curl` or an HTTP client — **never** by adding a `vercel.json` cron entry yet:

```
curl -X GET "https://<the-url-you-configured-in-stage-2-3>/api/cron/write-candidates?sourceKey=michalowice-komunikaty" \
  -H "Authorization: Bearer <CRON_SECRET value>"
```

Read the JSON response immediately. It will report: `proposalsFound`, `candidatesInserted` (0 or 1, never more), `duplicatesSkipped`, `ambiguousCandidates`, `cappedSkipped`, `sourceChecksInserted`, and always `published: false`.

## Stage 6 — Post-run verification (mandatory, immediately after)

Work through every item, in order, right after Stage 5 — do not defer this to later:

1. **Count new candidates.** Go to `/admin/queue`. Confirm the number of new rows matches the run's own `candidatesInserted` value exactly (0 or 1).
2. **Confirm `status = pending`** on any new row, and `source_key = "michalowice-komunikaty"`.
3. **Confirm no change to `alerts`.** Compare `/admin` alert counts (draft/published/archived) before and after — they must be identical.
4. **Confirm no publish occurred.** The run's own response must show `published: false`; no alert should appear anywhere a resident could see it.
5. **Confirm no archive occurred.** No existing alert or candidate should have changed status as a side effect of this run.
6. **Confirm `source_checks` got exactly the expected row(s).** `sourceChecksInserted` in the response should be 0 or 1, matching whether a registry source id was configured.
7. **Check Vercel's function logs for this invocation.** Look for anything unexpected — a second, unrequested invocation, an error swallowed silently, a timeout that might have left something in an ambiguous state.
8. **Re-open the automation status panel.** "Ostatni bezpieczny wynik" should now reflect this run's timestamp.
9. **Run the exact same `curl` command a second time, immediately.** The response should show `candidatesInserted: 0` and the same notice counted as a duplicate/ambiguous — this proves dedup is working before you trust it on any future schedule.
10. **Manually review the new pending candidate as you would any other** — verify it against the source, then either convert it via the normal queue flow or archive/reject it. Nothing about this candidate is treated specially by the review flow.

### PASS / STOP / ROLLBACK criteria

**PASS** — proceed to consider a second run or, much later, scheduling — only if ALL of the following are true:
- `candidatesInserted` was 0 or 1, never more
- The candidate (if any) has `status = pending` and the correct `source_key`
- `alerts` counts are unchanged
- `published` was `false`
- The second immediate `curl` call correctly detected the duplicate
- No unexpected entries in Vercel's function logs

**STOP (do not repeat, investigate before touching anything else)** if any of the following:
- `candidatesInserted` was greater than 1
- A candidate appeared with any status other than `pending`
- Any change to `alerts` is observed
- `published: true` appears anywhere
- The response included an exception message, stack trace, or secret value
- Vercel logs show more invocations than you triggered

**ROLLBACK (immediate)** if any STOP condition is observed, or if anything else looks wrong that isn't explicitly covered above:
1. In Vercel, delete (or set to anything other than `true`) `SCHEDULED_WRITES_ENABLED` on the environment you configured. This stops every future invocation at Gate 2 with no redeploy needed.
2. Do not delete or modify the candidate row(s) already created — review and dispose of them through the normal `/admin/queue` flow, calmly, as ordinary data.
3. See `docs/SPRINT_164B_CANARY_ROLLBACK_AND_KILL_SWITCH_RUNBOOK_V1.md` for the full incident procedure.

## Stage 7 — Only after a clean PASS, consider `vercel.json`

This is a **separate, later decision**, not part of this runbook's mandatory scope, and requires its own explicit go-ahead from Adam. If and when you decide to schedule `write-candidates` automatically:

```json
{
  "path": "/api/cron/write-candidates?sourceKey=michalowice-komunikaty",
  "schedule": "0 6 * * *"
}
```

added as a **second** entry alongside the existing `check-michalowice` one (never replacing it). Before adding this:

- Confirm your Vercel plan's cron limits still comfortably cover two daily cron invocations (Hobby plan: check current limits at the time you do this — they have changed before).
- Confirm all four gates are still genuinely required and unweakened in the code at that time (re-run `npm run test:e2e`, specifically `scheduledWriterRoute.spec.ts` and `scheduledWriterCanaryFoundation.spec.ts`).
- Pick a schedule that does not overlap the existing `check-michalowice` cron's runtime window.
- Re-read the Sprint 164C environment-separation notice at the top of this document — it still applies to every scheduled run, exactly as it applies to the manual one.

This document deliberately stops at "how to do it, once you decide to" — it does not decide *when* for you.
