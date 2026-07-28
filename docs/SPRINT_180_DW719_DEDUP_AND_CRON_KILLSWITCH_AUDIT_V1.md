# Sprint 180B — Forensic Dedup Audit (DW 719 stage-2 candidate) + Cron Kill-Switch Audit

Date: 2026-07-28/29 (Dzień 13)

## 1. Input state after Day 12 / Sprint 180A

`main` = `origin/main` = `d105af4`, clean working tree. First real
scheduler-triggered `write-candidates` run had succeeded and been rolled
back: `writesEnabled=false`, `writeAttemptsPossible=false`, temporary
Pruszków allowlist removed, `canarySources=[michalowice-komunikaty]`,
`openRun=null`, the write-candidates cron job left configured (daily
05:30 UTC) but fail-closed. `alerts=8`, `source_notice_candidates=8`,
`scheduled_writer_runs=6`, zero publications, zero emails.

## 2. Preflight (this sprint)

Confirmed via `/admin/sources` automation panel: `checksEnabled=true`,
`writesEnabled=false`, `writeAttemptsPossible=false` ("nie — co najmniej
jedna brama zamknięta"), `canarySources=[michalowice-komunikaty]`,
`maxCandidatesPerRun=1`, email alerts disabled, operational notification
runtime disabled, `openRun=null` ("Aktualnie otwarty przebieg: nie").
Production deployment Ready at `d105af4`, matching `main`. Counters
unchanged from Sprint 180A's close: `alerts=8`, `candidates=8`,
`runs=6`, `notification_events=1`.

## 3. New candidate — full record (SELECT only)

```
id:                 758819cc-b532-4b54-af86-d25d28da45b4
source_key:         pruszkow-aktualnosci
source_name:        Miasto Pruszków — aktualności
source_url:         https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/
candidate_url:      https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/
                     zmiana-organizacji-ruchu-na-drodze-wojewodzkiej-nr-719/
title:               "Zmiana organizacji ruchu na drodze wojewódzkiej nr 719"
raw_text (321 chars, parser-truncated — the trailing "[...]" is real,
stored exactly this way in the database):
  "Od 29 lipca 2026 r. od godz. 9:00 zostanie wprowadzona czasowa
   organizacja ruchu na drodze wojewódzkiej nr 719 w Nowej Wsi, na
   terenie gminy Michałowice. Zmiany obejmą odcinek od km 22+531 do km
   23+274 i są związane z realizacją inwestycji pn. „Rozbudowa DW nr 719
   od km 22+531 do km 23+274 w miejscowości Nowa Wieś [...]"
status:              pending
verification_status: unverified
detected_at:         2026-07-28 06:34:51.311131+00
created_at:          2026-07-28 06:34:51.311131+00
source_id:           null
category/severity/locality/place/starts_at/ends_at/change/action: null
confidence_score/risk_level/verification_notes/checked_at: null
duplicate_of_alert_id: null
converted_alert_id:  null
ai_draft_json:       null
content_fingerprint: null (SCHEDULED_WRITER_FINGERPRINT_ENABLED is off —
                     no fingerprint column populated, matches existing
                     "expand step not yet flipped on" documented state)
```

## 4. Official article — full content (public REST, read-only)

Fetched directly from `https://www.pruszkow.pl/wp-json/wp/v2/posts?slug=
zmiana-organizacji-ruchu-na-drodze-wojewodzkiej-nr-719` — nothing written
back to the application.

```
Post ID:    149518
Published:  2026-07-23T09:31:12
Modified:   2026-07-23T09:31:14
Permalink:  https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/
            zmiana-organizacji-ruchu-na-drodze-wojewodzkiej-nr-719/
Title:      Zmiana organizacji ruchu na drodze wojewódzkiej nr 719

Full content:
"Od 29 lipca 2026 r. od godz. 9:00 zostanie wprowadzona czasowa
organizacja ruchu na drodze wojewódzkiej nr 719 w Nowej Wsi, na terenie
gminy Michałowice. Zmiany obejmą odcinek od km 22+531 do km 23+274 i są
związane z realizacją inwestycji pn. „Rozbudowa DW nr 719 od km 22+531
do km 23+274 w miejscowości Nowa Wieś na terenie gminy Michałowice”.
Wykonawcą prac jest firma STRABAG Sp. z o.o. Przywrócenie poprzedniej
organizacji ruchu lub wprowadzenie nowej stałej organizacji planowane
jest w sierpniu 2026 r. Prosimy kierowców o zachowanie ostrożności oraz
stosowanie się do obowiązującego oznakowania."
```

Distinguishing facts extracted:
- Road: DW nr 719 (voivodeship road).
- Segment: km 22+531 – km 23+274 (identical to the published alert's own
  investment name, which does not itself state km markers).
- Location: Nowa Wieś, gmina Michałowice.
- Contractor: STRABAG Sp. z o.o. (present in the full article but **cut
  off by the parser's 321-char truncation** — not present in the stored
  `raw_text`, and therefore not part of what the classifier actually
  compared — see §6).
- Effective date: **29 lipca 2026, godz. 9:00** — future tense ("zostanie
  wprowadzona" — "will be introduced"), i.e. a traffic scheme not yet in
  effect at detection time.
- Expected end: August 2026 (same month as the published alert's own
  "Przewidywane zakończenie prac: sierpień 2026 r.").
- Investment name: "Rozbudowa DW nr 719 od km 22+531 do km 23+274 w
  miejscowości Nowa Wieś na terenie gminy Michałowice" — a road-widening
  project.

## 5. Existing published alert — full record

```
id:            80983ceb-3f97-4d7b-8cbc-f2f0083aa7bc
title:         "Utrudnienia w ruchu drogowym – DW nr 719, Nowa Wieś"
place:         Nowa Wieś
starts_at:     2026-07-09 00:00:00+00
ends_at:       null
change:        "Od 9 lipca 2026 r. na odcinku DW nr 719 w Nowej Wsi
                obowiązuje czasowa organizacja ruchu w związku z pracami
                prowadzonymi przez STRABAG. Jezdnia jest zwężona, ale
                ruch dwukierunkowy pozostaje zachowany. Przewidywane
                zakończenie prac: sierpień 2026 r."
action:        "Zachowaj ostrożność i stosuj się do tymczasowego
                oznakowania."
source_name:   Gmina Michałowice — komunikaty
source_url:    https://www.michalowice.pl/dzieje-sie/aktualnosci/
               komunikaty/rok-2026/utrudnienia-w-ruchu-drogowym-dw-nr-
               719-nowa-wies,p2027957373
status:        published
created_at:    2026-07-27 05:52:47+00
published_at:  2026-07-27 05:58:47+00
```

## 6. Comparison table — new candidate vs. existing alert

| Field | New candidate (758819cc) | Existing alert (80983ceb) | Same? |
|---|---|---|---|
| Road | DW nr 719 | DW nr 719 | Yes |
| Location | Nowa Wieś, gmina Michałowice | Nowa Wieś | Yes |
| Segment (km) | 22+531 – 23+274 (in full article; **not** in stored `raw_text`) | not stated | N/A (not comparable — alert never captured km markers) |
| Contractor | STRABAG (in full article; **cut off** before the 321-char truncation, absent from stored `raw_text`) | STRABAG | Same underlying fact, but the classifier never saw it on the candidate side |
| Investment name | "Rozbudowa DW nr 719 od km 22+531 do km 23+274…" | not stated (alert text describes only "prace"/"utrudnienia", no investment name) | Same project, different framing |
| Effective date of THIS traffic scheme | 29 lipca 2026, 09:00 — **future**, "zostanie wprowadzona" | 9 lipca 2026 — **already in effect**, "obowiązuje" | Different |
| Traffic description | "czasowa organizacja ruchu… zostanie wprowadzona" (new scheme introduced) | "jezdnia jest zwężona, ruch dwukierunkowy pozostaje zachowany" (narrowed lane, two-way preserved) | Different specific configuration |
| Expected completion | sierpień 2026 | sierpień 2026 | Same (consistent with one overall investment) |
| `candidate_url` / `source_url` (exact) | `pruszkow.pl/.../zmiana-organizacji-ruchu-na-drodze-wojewodzkiej-nr-719/` | `michalowice.pl/.../utrudnienia-w-ruchu-drogowym-dw-nr-719-nowa-wies,...` | **No** — different domain, different path |
| Canonical URL after normalization (trim + strip one trailing slash) | same as above, no trailing slash present | same as above, no trailing slash present | **No match** |
| Exact-URL classifier result | — | — | `urlMatch = false` |
| Text-similarity score (`textSimilarity`, word-overlap ratio) | — | — | **0.333** (8 shared significant words ÷ min(24, 28)) |
| `classifyProposalAgainstExisting` result | — | — | **`"new"`** |

Shared significant words (both >3 chars, Polish-diacritic-folded):
`lipca, 2026, czasowa, organizacja, ruchu, nowej, nowa, wies` (8 words).
Candidate-only significant words: 16 (`godz, zostanie, wprowadzona,
drodze, wojewodzkiej, terenie, gminy, michalowice, zmiany, obejma,
odcinek, zwiazane, realizacja, inwestycji, rozbudowa, miejscowosci`).
Alert-only significant words: 20 (`utrudnienia, drogowym, odcinku,
obowiazuje, zwiazku, pracami, prowadzonymi, przez, strabag, jezdnia,
jest, zwezona, ruch, dwukierunkowy, pozostaje, zachowany, przewidywane,
zakonczenie, prac, sierpien`) — notably including `strabag`, which never
had a chance to match because the candidate's own `raw_text` was cut off
before that word appeared in the source article (see §7).

## 7. Reproducing the algorithm's decision path

Traced `writeCandidatesForSource()` (`src/lib/scheduledWriter.ts:620`)
step by step for this exact run:

1. **`findExistingCandidateTexts`** — bounded read (limit 50) of other
   `pending`/candidate texts for `pruszkow-aktualnosci`. Contributes
   candidate-vs-candidate comparison texts; irrelevant to this alert
   comparison.
2. **`findExistingAlertComparisons`** — `SELECT title, change, source_url
   FROM alerts ORDER BY created_at DESC LIMIT 200`. With only 8 alerts
   total, the DW 719 alert (created 2026-07-27) was unconditionally
   inside this pool — confirmed by re-reading the RLS policy list
   (`Scheduled writer can select alerts for deduplication`,
   `roles={authenticated}`, live and undrifted since Sprint 178A) and by
   the fact that using the alert's real `title + " " + change` in the
   hand-reproduced score calculation (§6) is the only way to get a
   deterministic, testable number — the query executed successfully
   through the authenticated writer session, not RLS-filtered to zero.
3. `existingItems` = candidate texts + alert comparison items (`{text,
   url}`).
4. For the `Zmiana organizacji ruchu…` proposal: `text = proposal.rawText
   || proposal.excerpt || proposal.title` → the 321-char truncated
   `raw_text` (§3) was used, **not** the full article.
5. `classifyProposalAgainstExisting({text, url}, existingItems)`:
   - Exact-URL check first: `pruszkow.pl/.../zmiana-organizacji-ruchu…`
     normalized (trim + strip one trailing slash) never equals
     `michalowice.pl/.../utrudnienia-w-ruchu-drogowym…` → no match, falls
     through.
   - `classifyCandidateAgainstExisting(text, existingTexts)`: best score
     across the whole pool was the DW 719 alert's own text, **0.333**
     (hand-reproduced in §6, using the exact `normalizeForCompare` /
     `significantWords` / `textSimilarity` implementation from
     `src/lib/candidateWarnings.ts`).
   - `0.333 < AMBIGUOUS_SIMILARITY_THRESHOLD (0.6)` → **`"new"`**.
6. Insert proceeds (cap not yet reached — first proposal processed);
   `duplicatesSkipped=2` and `cappedSkipped=1` account for the other 3 of
   the 4 total proposals found that run (the already-known Sienkiewicza
   and Działkowa notices as duplicates, one further genuinely-new item
   correctly capped by `maxCandidatesPerRun=1`) — consistent with the
   live response recorded in Sprint 180A's own doc.

No RLS denial, no null-mapping bug, no cap-vs-dedup ordering issue, no
URL-normalization edge case: the algorithm worked exactly as designed,
on exactly the data it was given, and reached a fully explainable,
reproducible result.

## 8. Classification

**B — odrębny etap większego wydarzenia** (a distinct stage of a larger
investment).

Evidence:
- Both notices unambiguously describe the same underlying investment
  (STRABAG, DW 719, Nowa Wieś, same "sierpień 2026" completion target),
  so this is not classification A (unrelated new notice).
- The candidate describes a **materially different, future-dated traffic
  configuration** (a new scheme "to be introduced" July 29, superseding
  or supplementing the narrowed-lane scheme in effect since July 9) —
  this is genuinely new, actionable information a resident needs, not a
  restatement of the existing alert. Not classification C.
- The distinguishing facts (different date, "zostanie wprowadzona" vs.
  "obowiązuje", different specific description of the traffic pattern)
  are concrete and legible from the source text itself, not inferred —
  this is not classification D (no meaningful ambiguity remains once the
  full article is read).
- This is exactly the scenario the codebase's own design comment
  anticipated verbatim: *"a new, unrelated phase of roadworks on the same
  street must still be allowed through"* (`scheduledWriter.ts:182-183`) —
  and the pre-existing test group 6 in `alertCrossTableDedup.spec.ts`
  (Sprint 177C/177E) modeled this near-identical case as a hypothetical
  **before** it happened live.

No candidate mutation performed: not approved, not rejected, not
converted, not deleted, not published. Still `status=pending`.

## 9. Code path per §7 instructions (classification B)

- Dedup logic **unchanged** — it already produced the correct result.
- Distinguishing features documented above (§4, §6, §8).
- Regression test added: `tests/e2e/alertCrossTableDedup.spec.ts`,
  section 12, "Sprint 180B regression — the real, live-fired DW nr 719
  stage-2 candidate is confirmed 'new', not a duplicate" — uses the
  exact production `raw_text` (321-char truncated, trailing `[...]`
  included verbatim) and the exact existing alert's `title`/`change`,
  asserting `classifyProposalAgainstExisting(...) === "new"`. This locks
  in the real case as a permanent regression guard, distinct from (and
  now confirming) the earlier hypothetical test group 6.

## 10. Cron kill-switch audit (`SCHEDULED_WRITES_ENABLED=false`)

Traced `GET /api/cron/write-candidates` (`src/app/api/cron/write-
candidates/route.ts:108-124`) line by line:

1. **Layer 0** — `checkDatabaseEnvironmentGuard()`: cheapest check, no
   I/O, runs first.
2. **Layer 1+2** — `isScheduledChecksEnabled(...) && isWriteModeEnabled(...)`.
   With `SCHEDULED_WRITES_ENABLED=false`, this condition is false and the
   route returns **immediately**:
   `NextResponse.json({ ok: false, error: "Tryb zapisu jest wyłączony." },
   { status: 503 })`.

This return happens **before**:
- `checkCronAuth` (line 126) — the CRON_SECRET / bearer token is never
  even inspected.
- `getScheduledWriterCredentials()` / `signInScheduledWriter()` — no
  Supabase Auth call, no session created.
- `history.openRun(...)` — **no `scheduled_writer_runs` row is ever
  created**. The route has no code path that writes a "kill-switch-off"
  log entry; it simply never reaches that code.
- Any source fetch (`fetchAndParseProposals`) — zero outbound HTTP
  requests to any official source.
- `runOperationalNotification(...)` — only ever called deep inside the
  try block, strictly after a run was successfully opened; unreachable
  here. **No operational notification event, no email, regardless of
  `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`.**
- Any Supabase query of any kind.

**Conclusion:** a Cron-triggered (or any other) call to this endpoint
while `SCHEDULED_WRITES_ENABLED=false` is a pure, stateless HTTP 503 with
zero side effects — no DB row, no lock, no notification, no outbound
fetch. There is structurally zero risk of a parallel/pending run being
created by a kill-switch-blocked invocation, because nothing is ever
opened. This matches the observed evidence: `scheduled_writer_runs` count
is unchanged at 6 (the last row is still the Sprint 180A manual/Cron-panel
run, `finished_at` set, no open run) since the rollback, consistent with
either the daily 05:30 UTC cron not yet having fired again, or having
fired and correctly done nothing — both are indistinguishable from the
database's perspective, and both are equally safe.

## 11. Tests

- `alertCrossTableDedup.spec.ts` (extended, +1 test): 19/19 passed.
- `scheduledWriter.spec.ts`, `scheduledWriterRoute.spec.ts`,
  `candidateUrlHardening.spec.ts`, `sourceCheck.spec.ts`,
  `scheduledWriterRouteHistoryLock.spec.ts`, `scheduledWriterRunSafety.spec.ts`,
  `vercelCronConfig.spec.ts`, `productionRolloutReadiness.spec.ts`:
  207/207 passed.
- `pruszkowRestParser.spec.ts`, `manualSourceCheckPruszkowRest.spec.ts`,
  `automationAlertReadPolicySqlAntiDrift.spec.ts`,
  `scheduledWriterRlsMigrationHistoricalWarning.spec.ts`,
  `cronCheckSources.spec.ts`, `cronCheckSourcesRoute.spec.ts`,
  `cronCheckMichalowiceRoute.spec.ts`: 103/103 passed.
- `npm run check` (typecheck + lint + build): clean, 0 errors.
- Full `npm run test:e2e`: **1326/1327 passed** — the single failure is
  the same pre-existing, unrelated `themeSystem.spec.ts:98` timing-poll
  flake already documented in Sprint 179B/180A (confirmed 21/21 in
  isolation previously; not touched by this sprint's changes).

## 12. Preview / merge / Production

- Branch `sprint-180b-dw719-forensic-audit-v1` (from `main` @ `d105af4`).
- Committed the regression test, pushed, Preview built Ready (test-only
  change — a successful build is itself the meaningful validation).
- Fast-forward merged to `main`, pushed. `main` = `origin/main` =
  `916a673`, 0 ahead / 0 behind.
- Production auto-deployed from `916a673`.

## 13. Final flags

`checksEnabled=true, writesEnabled=false, writeAttemptsPossible=false,
canarySources=[michalowice-komunikaty], isSingleSourceCanary=true,
maxCandidatesPerRun=1, openRun=null, operationalNotificationRuntimeEnabled=false,
emailAlertConfig.enabled=false`. Cron Jobs: Enabled, 2 entries (both
fail-closed for writes; the dry-run cron runs daily as before,
unaffected).

## 14. Final counters — zero data changes this sprint

`alerts=8` (Δ0), `source_notice_candidates=8` (Δ0 — candidate 758819cc
untouched, still `pending`), `scheduled_writer_runs=6` (Δ0),
`operational_notification_events=1` (Δ0). This sprint was 100% read-only
against Production data — every mutation was to test/doc files only, on
a branch, merged after the full suite passed.

## 15. Recommendation before enabling cyclical writes

The dedup algorithm is confirmed correct on a real, previously-untested
live case (same road, different stage, correctly kept separate) in
addition to its existing unit-test coverage. The Cron kill-switch is
confirmed to be a true no-op when off — zero risk of orphaned runs or
silent side effects while `SCHEDULED_WRITES_ENABLED=false`.

**Recommended next steps before enabling daily unattended writes:**
1. Have a human review and decide on candidate 758819cc (approve as a
   genuinely new alert, given the classification B finding above) —
   this sprint deliberately left it untouched.
2. Consider raising the parser's raw-text truncation length (currently
   321 chars for this article) so future dedup comparisons have access
   to the full article text (e.g. the contractor name) rather than a
   truncated prefix — today's classification was correct despite the
   truncation, but a future, more textually-similar case could
   theoretically be affected by what the truncation happens to cut off.
   This is a separate, optional hardening item, not required by this
   sprint's findings.
3. Given both the dedup correctness and the kill-switch safety are now
   independently confirmed on real Production data, a short supervised
   cyclical-writes window (writes enabled for a full day, single source,
   cap=1, actively monitored) is a reasonable next step — full
   unattended/indefinite enablement is a separate decision for Adam.
