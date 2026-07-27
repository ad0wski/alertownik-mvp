# Sprint 174 — Controlled Activation Execution (Day 7)

**Status: CLOSED — full success. One controlled Production write occurred,
its single resulting candidate was manually verified against the live
official source, approved, converted to a draft, completed with the missing
fields, saved, and published as the first real alert produced end-to-end
through the scheduled-writer pipeline. The write kill switch was returned to
its resting (off) state and confirmed via a dedicated redeploy. This document
records what actually happened, not a plan — see
`docs/SPRINT_173_ACTIVATION_CHECKPOINT_V1.md` for the pre-approved plan this
execution followed.**

Branch: `sprint-174-scheduled-checks-activation-planning-v1`. No merge to
`main`, no other branch touched or deleted.

---

## 1. Baseline (start of Day 7)

| Table | Count |
|---|---|
| `alert_sources` | 4 |
| `source_checks` | 2 |
| `source_notice_candidates` | 3 |
| `alerts` | 6 |
| `scheduled_writer_runs` | 1 |
| `operational_notification_events` | 1 |
| `automation_identities` | 2 |

Preflight (Checkpoint 1) confirmed via `/api/admin/automation-status`
(booleans only, never a raw secret value) and read-only Supabase `SELECT`s:
`checksEnabled=true`, `writesEnabled=false`, no open run, no open/claimed
operational event, canary source correctly scoped to `michalowice-komunikaty`.
Verdict: **GO**.

## 2. Activation

1. Adam manually edited `SCHEDULED_WRITES_ENABLED` in Vercel (Production
   scope only) to `true` and clicked Save himself — Claude prepared and
   verified the form value programmatically (length 4, char codes
   `[116,114,117,101]`, no whitespace/quotes/newline) but never clicked Save.
2. One redeploy of the existing `main` commit `f4d1184` (deployment
   `3CSUQSYLPfKWksSu8pbHupg6XqgT`, Ready, Production, no code change) was
   required to make the new value take effect on Vercel Function instances —
   env var changes are **not** picked up by already-warm instances without a
   redeploy, despite an earlier code comment's assumption to the contrary
   (see § 6, lesson learned).
3. Post-redeploy `automation-status`: `checksEnabled=true`,
   `writesEnabled=true`, `writeAttemptsPossible=true`,
   `cronSecretConfigured=true`, `writerCredentialsConfigured=true`, canary =
   `michalowice-komunikaty`, no open run. Supabase counters unchanged from
   baseline — the flag flip and redeploy themselves wrote nothing.

## 3. The one controlled write-candidates request

A one-shot, human-in-the-loop PowerShell script
(`Alertownik_RunWriteCandidatesOnce.ps1`, written to a Temp path, statically
audited before use — see § 5) was used by Adam to send exactly one
`GET /api/cron/write-candidates` request with the real `CRON_SECRET`, which
Claude never read or saw.

**Result (HTTP 200):**

```
ok=true, dryRun=false
checkedAt=2026-07-27T04:34:17.523Z
checkedSources=1, successfulSources=1, failedSources=0
proposalsFound=6, candidatesInserted=1, duplicatesSkipped=3,
ambiguousCandidates=0, cappedSkipped=2, sourceChecksInserted=0
published=false
source: michalowice-komunikaty
```

**Database verification (read-only):**

| Table | Before run | After run | Δ |
|---|---|---|---|
| `alert_sources` | 4 | 4 | 0 |
| `source_checks` | 2 | 2 | 0 |
| `source_notice_candidates` | 3 | 4 | **+1** |
| `alerts` | 6 | 6 | 0 |
| `scheduled_writer_runs` | 1 | 2 | **+1** |
| `operational_notification_events` | 1 | 1 | 0 |
| `automation_identities` | 2 | 2 | 0 |

New `scheduled_writer_runs` row (`335f59e4-ad93-490b-a880-6dbbcb946d28`):
closed (`finished_at` set, 2026-07-27 04:34:17.456 UTC),
`outcome=success`, `trigger=manual`, `environment_tag=production`,
`sources_checked=1`, `sources_failed=0`.

New `source_notice_candidates` row (`72a01ba0-8549-456d-8e72-102bbca1273a`):
`source_key=michalowice-komunikaty`, `status=pending`,
`verification_status=unverified`, `converted_alert_id=NULL`,
`duplicate_of_alert_id=NULL` — **no alert exists or was created from it.**
Its status was never changed by any step in this sprint; it awaits Adam's
manual review in `/admin/queue`.

## 4. Rollback to resting state

1. Adam set `SCHEDULED_WRITES_ENABLED` back to `false` (Production scope
   only) and clicked Save himself — again, Claude only prepared and verified
   the value (length 5, char codes `[102,97,108,115,101]`) beforehand.
2. **Finding:** immediately after Save, `automation-status` still reported
   `writesEnabled: true` (confirmed twice, 5s apart, with a cache-busting
   query param) — the same warm-instance-propagation behavior as § 2, now in
   reverse. Flagged to Adam before taking any further action.
3. With Adam's explicit approval, a second redeploy of the same `main`
   commit `f4d1184` (deployment `58VXPKAKdxcR9B5hY1NsHEQ3iFWv`, Ready,
   Production, no code change) was performed.
4. Post-redeploy `automation-status`: `checksEnabled=true`,
   `writesEnabled=false`, `writeAttemptsPossible=false`, no open run,
   `lastClosedRun` still the same 04:34:17 run (no new run was created by
   either redeploy).
5. Final Supabase counters: unchanged from § 3's "after run" row. Candidate
   `72a01ba0…` still `pending`.

**Resting state confirmed:** `SCHEDULED_WRITES_ENABLED=false` in Production,
both in the Vercel dashboard and via live `automation-status` on the
currently-serving deployment. `SCHEDULED_CHECKS_ENABLED` remains `true`
(pre-existing, unrelated, still only gates the zero-write dry-run endpoints).

## 5. Security audit — one-shot write script

`Alertownik_RunWriteCandidatesOnce.ps1` was statically audited (parsed via
`[System.Management.Automation.Language.Parser]::ParseFile`, never executed
by Claude) before Adam ran it himself in a separate PowerShell window:

- 0 parse errors
- Exactly 1 `Invoke-WebRequest` call, method `GET`, correct URL
- `Authorization` header built from a variable, never a literal token
- No hardcoded secret anywhere in the file
- `-TimeoutSec 30`, no retry logic, no loop constructs (`for`/`while`/`do`/`foreach`)
- Requires typing the exact case-sensitive phrase `RUN ONE PRODUCTION WRITER`
  before doing anything
- Secret entered via `Read-Host -AsSecureString` (masked, not persisted to
  PSReadLine history)
- Secret converted to plaintext only in-memory (`Marshal.SecureStringToBSTR`)
  for the single request, then explicitly zeroed and nulled in a `finally`
  block (`ZeroFreeBSTR`, `SecureString.Dispose()`, variable removal)
- No `Set-Clipboard`/`clip`, no `Out-File`/`Set-Content`/`Export-*`, no
  `Start-Transcript` anywhere in the script — secret and response body never
  touch the clipboard, a file, or a log
- Script terminates immediately after the single response or error; no code
  path sends a second request

Claude never held, read, or logged `CRON_SECRET` at any point.

## 6. Lesson learned (for future activation/deactivation sprints)

Vercel Serverless Function instances that are already warm do **not**
re-read `process.env` per invocation as an earlier in-repo comment assumed —
an Environment Variable change (in either direction) requires a fresh
Production deployment to fully apply across all currently-serving instances.
Both this sprint's activation and rollback needed their own redeploy step;
treat this as a hard requirement, not an optional "near-instant propagation"
convenience, for any future flag flip on this project.

## 7. Candidate outcome (superseded by § 9 — kept for the historical record)

Candidate `72a01ba0-8549-456d-8e72-102bbca1273a`
(`michalowice-komunikaty`) was left `pending`, awaiting manual review in
`/admin/queue`, at the point this section was first written. § 9 documents
its full review, approval, and conversion to a published alert later the
same day.

## 8. What §§ 1–7 of this sprint did NOT do

Up through the rollback (§§ 1–4), no SQL other than read-only `SELECT`s was
executed, no RPC was called, no schema or RLS change was made, no email or
Resend send occurred, no alert existed yet, no merge to `main` happened, no
branch was deleted, no `SCHEDULED_CHECKS_ENABLED`/`CRON_SECRET`/
`SCHEDULER_WRITER_ALLOWED_SOURCE_IDS` change was made, and no second
`write-candidates`/`check-sources`/manual source-check request was sent. **§ 9
below describes later, separately-approved steps (candidate review through
publish) that did legitimately write to `alerts` and
`source_notice_candidates` — see that section for exactly what changed and
under what authorization.**

## 9. Day 7 — Final closeout: candidate review through publish

Continuing the same session, later on 2026-07-27, Adam reviewed and
progressed the one candidate produced by § 3 through to a published public
alert. Every step below was individually authorized by Adam before being
carried out; none were implied by an earlier approval.

### 9.1 Manual verification against the live official source

Candidate `72a01ba0…`'s title and excerpt ("Utrudnienia w ruchu drogowym -
DW nr 719 Nowa Wieś") were checked against
`https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty` (optional
statistics cookies declined) and the full article page
(`.../komunikaty/rok-2026/utrudnienia-w-ruchu-drogowym-dw-nr-719-nowa-wies,p2027957373`).
The notice was confirmed live, current (not marked "Archiwalny" unlike older
roadwork notices on the same listing), and attributed to the gmina's own
editor. Full article text added detail the raw candidate excerpt lacked:
lane narrowed but two-way traffic maintained, expected completion August
2026, contractor STRABAG sp. z o.o.

The candidate itself had **no** `category`, `place`, `starts_at`/`ends_at`,
`confidence_score`, or `risk_level` populated, and no direct article URL
(`candidate_url` was `NULL`; `source_url` pointed only at the listing page)
— the scheduled-writer path captures raw notice text only, by design; a
human filling in the missing structured fields before publish is the
intended workflow, not a gap to fix in code.

### 9.2 Approve

One click on the candidate's "Zatwierdź" button in `/admin/queue`.
**Procedural note:** the first two click attempts (coordinate-based, after
an earlier `scroll_to` call) silently missed — the candidate list's DOM was
temporarily offset far outside the viewport (confirmed via
`getBoundingClientRect()`, x/y in the thousands negative) after that
`scroll_to` call, so the synthetic clicks landed on empty page background;
no request fired, no state changed (verified by SQL before/after each
attempt — both no-ops). A page reload reset the layout, and a direct
`element.click()` call on the freshly-located button (rather than a
coordinate-based click) fired the real `onClick` handler correctly.
Confirmed via Supabase: `status: pending → approved`, one `UPDATE`, no other
row touched.

### 9.3 Convert to draft (client-side only, then re-done once)

Clicking "Utwórz draft z kandydata →" only writes to `sessionStorage` and
navigates to `/builder` — it makes **no** Supabase call by itself (confirmed
by reading `createBuilderDraftFromNotice()` in
`src/app/admin/queue/page.tsx` and `updateCandidateStatus()`'s call site).
**Procedural note:** an unrelated page permission issue required reloading
`/builder` once; since the pre-fill `sessionStorage` key is consumed on
first read, the reload silently cleared the pre-filled (but never-saved)
form. No database state was affected by this (confirmed: candidate still
`approved`, `converted_alert_id` still `NULL` before and after). Recovery
was to click the same safe, side-effect-free "Utwórz draft z kandydata"
action a second time to regenerate the pre-fill, then complete the fill
without reloading again.

### 9.4 Manual completion of the draft form

Adam supplied the corrected values; Claude applied them to the React
form's controlled inputs via native value setters + `input`/`change` events
(so React state updates the same as real typing) and read every field back
verbatim before reporting:

| Field | Auto-filled (candidate raw text) | Manually corrected |
|---|---|---|
| Title | "Utrudnienia w ruchu drogowym - DW nr 719 Nowa Wieś" | "Utrudnienia w ruchu drogowym – DW nr 719, Nowa Wieś" |
| Category | *(none — form default `municipal`)* | `roads` |
| Severity | `info` | `info` (unchanged) |
| Location (`place`) | *(empty)* | "Nowa Wieś" |
| Starts at | today's detection date (`2026-07-27`) | `2026-07-09` (the actual works-start date from the article) |
| Ends at | *(empty)* | left empty — official source gives only "sierpień 2026", no exact day; **no date was invented** |
| "Co się zmienia" | raw one-paragraph excerpt | expanded to include lane-narrowing/two-way-traffic/August-2026 detail from the full article |
| "Co zrobić" | *(empty)* | "Zachowaj ostrożność i stosuj się do tymczasowego oznakowania." |
| `source_url` | listing page (`.../komunikaty`) | direct article URL (`.../komunikaty/rok-2026/utrudnienia-w-ruchu-drogowym-dw-nr-719-nowa-wies,p2027957373`) |
| Slug | auto-generated from title + timestamp | left untouched (auto-regenerated once, matching the timestamp of the second "Utwórz draft" click — never hand-edited) |

Both in-form warnings ("Brak lokalizacji", "Brak opisu „Co zrobić"")
disappeared once the corrected values were applied. Save/Publish were not
clicked until each was separately authorized.

### 9.5 Save as draft

One click on "Zapisz jako draft w Supabase". Result: exactly one new
`alerts` row, `id=80983ceb-3f97-4d7b-8cbc-f2f0083aa7bc`,
`status=draft`, `published_at=NULL`; `alerts` count 6→7; candidate
`72a01ba0…` transitioned `approved → converted_to_draft` with
`converted_alert_id` set to the new alert's id. No duplicate row. All other
counters unchanged.

### 9.6 Publish

After a final read-only re-check (status still `draft`, `published_at`
still `NULL`, exactly one alert with that id, all fields still correct, 7
total alerts, 3 published), one click on the "Opublikuj" button scoped to
that specific alert's card in Builder's "Alerty w Supabase" list (targeted
by its unique slug, not the top-level form's generic publish button — this
guarantees only this one alert could have been affected).

**Result:**

| Field | Value |
|---|---|
| Alert ID | `80983ceb-3f97-4d7b-8cbc-f2f0083aa7bc` |
| Title | Utrudnienia w ruchu drogowym – DW nr 719, Nowa Wieś |
| `status` | `published` |
| `published_at` | `2026-07-27 05:58:47.111+00` |
| `alerts` count | 7 → 7 (unchanged — publish updates a row, doesn't insert one) |
| `alerts` published count | 3 → 4 |
| Duplicate/second row | None (`matching_alert_count = 1`) |
| Candidate final state | `converted_to_draft`, `converted_alert_id` unchanged (publish is alerts-only; it does not re-touch the candidate row) |
| `operational_notification_events` | 1 → 1, unchanged — no email/Resend send occurred |
| Public visibility | Confirmed live on both `/` and `/alerty`: category "Drogi", location "Nowa Wieś", date "09.07.2026", source "Gmina Michałowice — komunikaty", badges "Nowe"/"Trwa" |

### 9.7 Final closeout audit (read-only)

| Check | Result |
|---|---|
| `git status` | Clean except untracked `.vscode/` (not ours to commit) |
| Branch | `sprint-174-scheduled-checks-activation-planning-v1`, in sync with origin (0 ahead / 0 behind) |
| Unintended code changes | None — only this doc file changed |
| Open `scheduled_writer_runs` | None (`finished_at IS NULL` → 0 rows) |
| `SCHEDULED_WRITES_ENABLED` | `false` (confirmed live via `automation-status`: `writesEnabled: false`, `writeAttemptsPossible: false`) |
| `SCHEDULED_CHECKS_ENABLED` | `true` (unchanged, pre-existing, dry-run only) |
| Public alert visible | Yes, confirmed again at closeout |

**Final table counts:** `alert_sources=4`, `source_checks=2`,
`source_notice_candidates=4`, `alerts=7`, `alerts published=4`,
`scheduled_writer_runs=2`, `operational_notification_events=1`,
`automation_identities=2`.

### 9.8 Conclusion

**The first real, controlled, end-to-end run of the scheduled-writer →
candidate-review → draft → publish pipeline on Production succeeded in
full**, from the single authorized `write-candidates` HTTP call through to
one genuine, correctly-categorized, publicly-visible alert — with every
write-capable step individually authorized, every state change verified
read-only before and after, zero duplicates, zero unintended writes, zero
emails, and the write kill switch confirmed back at its safe resting state
before the session closed.

## 10. What this entire sprint (§§ 1–9) did NOT do

No SQL other than read-only `SELECT`s was ever executed by Claude. No RPC
was called outside the two authorized UI button clicks (Save, Publish) and
their underlying Supabase client calls. No schema or RLS change was made.
No email or Resend send occurred at any point
(`OPERATIONAL_EMAIL_ALERTS_ENABLED` stayed off throughout;
`operational_notification_events` never changed from 1). No merge to
`main`. No branch deleted. No `SCHEDULED_CHECKS_ENABLED`, `CRON_SECRET`, or
`SCHEDULER_WRITER_ALLOWED_SOURCE_IDS` change. No second
`write-candidates`, `check-sources`, or manual source-check request was
ever sent. No candidate or alert other than the one named throughout this
document was touched.
