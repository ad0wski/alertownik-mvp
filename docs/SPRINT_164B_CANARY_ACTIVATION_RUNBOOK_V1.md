# Sprint 164B — Canary Activation Runbook

**Audience:** Adam, manually, step by step, in order. Nothing in this document is executed automatically by any sprint. Each step is independently reversible (see the paired rollback runbook, `SPRINT_164B_CANARY_ROLLBACK_AND_KILL_SWITCH_RUNBOOK_V1.md`).

**Precondition:** this branch (or its merge to `main`) is on Production, and you have read `docs/SPRINT_164B_SAFE_AUTO_CANDIDATE_CANARY_FOUNDATION_V1.md` §2–§5.

This activation is intentionally split into stages. **Do not skip a stage.** Each stage is independently observable before you proceed to the next.

---

## Stage 0 — Before touching anything

1. Open `/admin/sources` on Production, logged in as admin.
2. Expand "Stan automatyzacji (canary)" (the new panel from this sprint).
3. Confirm it shows: automatyczne sprawdzanie **wyłączone**, automatyczne tworzenie kandydatów **wyłączone**, `CRON_SECRET` **brak**, dane konta writer **brak**. This is the expected starting state — if anything already shows as configured/enabled and you did not set it, **stop and investigate before proceeding.**

---

## Stage 1 — Technical writer account (one-time, database side)

This step was already fully designed and SQL-drafted in Sprint 147 (`docs/sql/INSERT_SCHEDULED_WRITER_AUTOMATION_IDENTITY_V1.sql`, verified with `VERIFY_SCHEDULED_WRITER_AUTOMATION_IDENTITY_READ_ONLY_V1.sql`). If not already done:

1. Create a dedicated Supabase Auth account for the writer (email/password), **not** an existing admin's own login.
2. Run the existing, already-reviewed SQL to add that account's `auth.uid()` to `public.automation_identities`.
3. Run the paired verify script (read-only) to confirm the row exists and nothing else changed.

If this account already exists from prior sprint work, skip to Stage 2.

## Stage 2 — Vercel environment variables (Preview first, then Production)

Set these on **Preview** only, first:

- `SCHEDULED_CHECKS_ENABLED=true`
- `CRON_SECRET=<a newly generated, random secret — not reused from anywhere else>`

Leave `SCHEDULED_WRITES_ENABLED` and the writer credentials **unset** for now. This alone only enables the existing, already-Production-proven **dry-run** path (`/api/cron/check-michalowice`, `/api/cron/check-sources`) — no write is possible yet, by construction (Gate 2/4 in §5's diagram still fail closed).

Verify: open the automation status panel on Preview → "automatyczne sprawdzanie" now shows **aktywne**, "automatyczne tworzenie kandydatów" still shows **wyłączone**.

## Stage 3 — Enable write mode on Preview only

- `SCHEDULED_WRITES_ENABLED=true`
- `SUPABASE_SCHEDULED_WRITER_EMAIL=<the Stage 1 account's email>`
- `SUPABASE_SCHEDULED_WRITER_PASSWORD=<the Stage 1 account's password>`

Do **not** set `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` or `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN` — leaving both unset keeps the conservative defaults (Michałowice only, cap of 1), which is the entire point of a canary.

Verify on the Preview automation status panel: "automatyczne tworzenie kandydatów" now shows **aktywne**, "CRON_SECRET" and "dane konta writer" both show **skonfigurowane/skonfigurowany**, "zapis możliwy przy obecnej konfiguracji" shows **tak**.

## Stage 4 — The single manual canary run (Preview)

Do this manually, once, via `curl` or an HTTP client — **never** by adding a `vercel.json` cron entry yet:

```
curl -X GET "https://<preview-url>/api/cron/write-candidates?sourceKey=michalowice-komunikaty" \
  -H "Authorization: Bearer <CRON_SECRET value>"
```

Read the JSON response. It will report, per §5's diagram: `proposalsFound`, `candidatesInserted` (0 or 1, never more), `duplicatesSkipped`, `ambiguousCandidates`, `cappedSkipped`, `sourceChecksInserted`, and always `published: false`.

**Then, immediately:**

1. Go to `/admin/queue` on the same Preview environment. Confirm at most one new candidate appeared, with `status = pending`, and `source_key = "michalowice-komunikaty"`.
2. Confirm no alert was created or changed — check `/admin` alert counts before/after, or query `alerts` (read-only) if you have direct access.
3. Run the run a second time immediately. The response should show `candidatesInserted: 0` and `duplicatesSkipped` (or `ambiguousCandidates`) reflecting the same notice — this proves dedup is working before you trust it on a schedule.
4. **Manually review the pending candidate as you would any other** — verify it against the source, then either convert it via the normal queue flow or archive/reject it. Nothing about this candidate is treated specially by the review flow; it is a completely ordinary `pending` row.

If anything in this stage looks wrong (more than one candidate, a candidate for the wrong source, an alert appearing, a 5xx with unexpected content) — **stop, do not proceed to Stage 5, and roll back per the rollback runbook.**

## Stage 5 — Repeat Stage 2–4 on Production

Only after Stage 4 has been clean on Preview for at least one full manual review cycle. Same env vars, same manual `curl` trigger — **still no `vercel.json` entry.** Do this at least once, observe the same checks as Stage 4, on Production.

## Stage 6 — Only now, consider `vercel.json`

This is a **separate, later decision**, not part of this runbook's scope. If and when you decide to schedule `write-candidates` automatically:

```json
{
  "path": "/api/cron/write-candidates?sourceKey=michalowice-komunikaty",
  "schedule": "0 6 * * *"
}
```

added as a **second** entry alongside the existing `check-michalowice` one (never replacing it). Before adding this:

- Confirm your Vercel plan's cron limits still comfortably cover two daily cron invocations (Hobby plan: check current limits at the time you do this — they have changed before).
- Confirm all four gates (§5) are still genuinely required and unweakened in the code at that time (re-run `npm run test:e2e` and specifically the `scheduledWriterRoute.spec.ts` / `scheduledWriterCanaryFoundation.spec.ts` files).
- Pick a schedule that does not overlap the existing `check-michalowice` cron's runtime window.

This document deliberately stops at "how to do it, once you decide to" — it does not decide *when* for you.
