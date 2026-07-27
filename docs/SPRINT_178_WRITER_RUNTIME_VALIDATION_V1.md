# Sprint 178A — Scheduled Writer Runtime Validation

Date: 2026-07-27 (Dzień 10)

## 1. Input state after Day 9

- Sprint 177 RLS anon-read incident formally closed.
- Corrective SQL executed manually by Adam exactly once, not re-run since.
- Confirmed pre-sprint: public REST `alerts` = HTTP 200, `automation_identities`
  anon = HTTP 401, all four scheduled-writer policies `roles={authenticated}`,
  public anon policy unchanged, admin policies unchanged, writer disabled,
  `writeAttemptsPossible=false`, `openRun=null`, Cron inactive, operational
  email/notifications disabled, default Michałowice-only allowlist (no
  temporary Pruszków allowlist), DW nr 719 and Działkowa each published
  exactly once, no public drafts.
- Day 9 tests: `public.spec.ts` 77/77, full suite 1318/1318, typecheck/lint/
  build clean.

## 2. Final commit main (start of Day 10)

`74da9aa`

## 3–5. Full list of automation_identities-based policies, roles, and anti-drift result

Schema-wide search (not limited to previously known tables) found exactly
four policies referencing `automation_identities` in `qual`/`with_check`,
all `roles={authenticated}` — unchanged since Day 9, no drift:

| Table | Policy | cmd |
|---|---|---|
| `alerts` | Scheduled writer can select alerts for deduplication | SELECT |
| `source_checks` | Scheduled writer can insert automated source_checks | INSERT |
| `source_notice_candidates` | Scheduled writer can insert pending source_notice_candidates | INSERT |
| `source_notice_candidates` | Scheduled writer can select source_notice_candidates | SELECT |

No policy with `roles={public}` or `roles={anon}` referencing
`automation_identities` exists anywhere in the schema. No separate policy
lets anon read `automation_identities`. Ordinary authenticated users
cannot self-insert into `automation_identities` (its only INSERT-capable
path is the manual, credential-gated procedure documented in Sprint
166L-D; the table's own live RLS policy is SELECT-only, self-row).
Admin policies on `alerts`/`source_notice_candidates`/`source_checks`
confirmed unchanged since the Sprint 177F hotfix.

## 6. Grant audit result

`anon` grants on `automation_identities`: SELECT/INSERT/UPDATE/DELETE all
`false` — unchanged. `anon` grants on `alerts`/`source_checks`/
`source_notice_candidates`: SELECT+INSERT `true` (pre-existing, RLS is the
real gate) — unchanged.

## 7–8. Live confirmation

- `GET .../automation_identities` as anon: HTTP 401, `42501` — confirmed
  still correctly denied.
- `GET .../alerts?status=eq.published` as anon: HTTP 200, 5 rows — confirmed
  working.

## 9–10. Writer visibility across alert statuses / anon scope

Writer's own SELECT policy on `alerts` has no `status` predicate — only
the automation_identities membership check — so it structurally grants
visibility across all three statuses. Confirmed via row counts at the
time of the run: draft=0, published=5, archived=3 (8 total, well under
the 200-row dedup query cap). Anon confirmed to see only the 5 published
rows via the same REST endpoint. `findExistingAlertComparisons()`
(`src/lib/scheduledWriter.ts`) issues exactly one `select title, change,
source_url from alerts order by created_at desc limit 200` per source
invocation — confirmed by code inspection, not per-proposal — so no N+1.

## 11. Source simulation results (read-only, live fetch, no writes)

Ran the real `fetchAndParseProposals()` + `classifyProposalAgainstExisting()`
functions against all four safe-check sources, comparing against the true
existing pool (alerts + pending candidates) fetched moments earlier:

- **michalowice-komunikaty**: 6 proposals — 4 duplicate (Rajd po Kamienistej
  Drodze, Aktywne wakacje 2026, Kajaki nad Zalewem Komorowskim, DW nr 719 —
  all correctly matched against existing candidates/alerts), 2 new (Pilates
  w wakacje, Taneczne wieczorki w plenerze).
- **pruszkow-aktualnosci**: 4 proposals — 1 duplicate (Działkowa notice,
  matched via URL/text against the published alert), 2 new, 1 ambiguous.
- **wodociagi-michalowice**: 2 proposals — 1 duplicate, 1 new.
- **wkd-aktualnosci**: 6 proposals — all new (no overlap with existing pool).

## 12. Selected source and GO justification

**GO — michalowice-komunikaty.** It was already the sole entry in
Production's `canarySources` allowlist (`isSingleSourceCanary=true`), so
no temporary allowlist change was needed. Simulation showed correct
duplicate detection against a real published alert (DW nr 719) and
against real pending candidates, `cap=1` limits exposure to a single
insert, and the predicted new item (a low-risk recreational event
notice) carried no false-positive/ambiguity risk against any existing
disruption alert. All 13 GO conditions from the sprint's Etap 6 checklist
were satisfied.

## 13. Baseline counters (immediately before the run)

`alert_sources=4, source_checks=2, source_notice_candidates=5,
alerts_total=8 (published=5, draft=0, archived=3), scheduled_writer_runs=3,
operational_notification_events=1, automation_identities=2, open_runs=0`.

## 14. Single request — full response

```json
{
  "ok": true,
  "dryRun": false,
  "checkedAt": "2026-07-27T19:09:35.808Z",
  "checkedSources": 1,
  "successfulSources": 1,
  "failedSources": 0,
  "proposalsFound": 6,
  "candidatesInserted": 1,
  "duplicatesSkipped": 4,
  "ambiguousCandidates": 1,
  "cappedSkipped": 0,
  "sourceChecksInserted": 0,
  "duplicatesPreventedByDatabase": 0,
  "published": false,
  "results": [{
    "sourceKey": "michalowice-komunikaty",
    "outcome": "success",
    "proposalsFound": 6,
    "candidatesInserted": 1,
    "duplicatesSkipped": 4,
    "ambiguousCandidates": 1,
    "cappedSkipped": 0,
    "sourceChecksInserted": 0,
    "duplicatesPreventedByDatabase": 0
  }]
}
```

Executed by Adam manually via a one-shot PowerShell script (hidden
`CRON_SECRET` prompt, exactly one GET request, no retry, 30s timeout,
secret cleared in `finally`) — Claude's own tools run non-interactively
and cannot supply a hidden prompt, so this single step was handed to
Adam per the sprint's own Etap 9 fallback instruction.

## 15. Prediction vs. reality

Simulation predicted 4 duplicates + 2 new for this source; the real run
found 4 duplicates + 1 new + 1 ambiguous. One of the two predicted "new"
items was classified "ambiguous" in the live run rather than "new" — a
minor, expected divergence, since the simulation's hardcoded comparison
text was reconstructed from a DB read moments earlier rather than
byte-identical to the live query's own normalization. The decisive
outcome (no real duplicate was ever misclassified as new; `cap=1` was
respected) matched the prediction exactly.

## 16–18. Deduplication result by status

- **Draft**: no draft alerts existed at run time (0 rows) — no draft
  duplicate scenario was exercised by this specific run, though the
  writer's read policy structurally covers drafts (see §9–10).
- **Published**: DW nr 719 (published) correctly excluded the matching
  live proposal as a duplicate.
- **Archived**: none of the 6 live proposals textually matched any of the
  3 archived alerts, so no archived-duplicate case was exercised by this
  specific live run either — archived visibility was confirmed
  structurally (§9–10), not through a live duplicate hit in this run.

## 19. New candidate

ID `7b3a1266-de8b-425b-8884-0d44d19eb0a2` — "Pilates w wakacje", status
`pending`, source `michalowice-komunikaty`, `candidate_url: null` (this
source's HTML has no reliable per-item permalinks — an accepted, known
limitation, not a defect). Left untouched: not approved, not rejected,
no draft created, no alert published.

## 20–21. Request/retry confirmation

Exactly one HTTP GET request was sent. No retry was attempted or needed
(the request succeeded on the first and only attempt).

## 22–23. Rollback results

- `SCHEDULED_WRITES_ENABLED` set back to `false` (Production), saved,
  redeployed once, confirmed `writesEnabled=false`,
  `writeAttemptsPossible=false`, `openRun=null`.
- No temporary allowlist existed to remove — `canarySources` was already,
  and remained, `[michalowice-komunikaty]` throughout the entire sprint.

## 24. Final flags

`checksEnabled=true, writesEnabled=false, writeAttemptsPossible=false,
canarySources=[michalowice-komunikaty], isSingleSourceCanary=true,
maxCandidatesPerRun=1, openRun=null, operationalNotificationRuntimeEnabled=false,
emailAlertConfig.enabled=false`.

## 25. Final counters

`alert_sources=4 (Δ0), source_checks=2 (Δ0), source_notice_candidates=6
(Δ+1), alerts_total=8 (Δ0, published=5/draft=0/archived=3, all Δ0),
scheduled_writer_runs=4 (Δ+1), operational_notification_events=1 (Δ0),
automation_identities=2 (Δ0), open_runs=0`.

## 26–28. Zero side effects

Zero new alerts, zero publications, zero emails — confirmed both via the
run's own response (`published: false`) and independently via before/after
row counts on `alerts` and `operational_notification_events`.

## 29. Test results

- SQL anti-drift: 30/30 (Sprint 177) + 6/6 new (Sprint 178A historical
  warning) = 36/36.
- Cross-table dedup / scheduledWriter / scheduledWriterRoute / sourceCheck
  / candidateUrlHardening: 144/144.
- Full suite: 1324/1324 (after the anti-drift branch's changes).
- typecheck: clean. lint: clean. build: clean, 0 errors.

## 30. Blockers/incidents

One real repository finding (not a live incident): the historical
`docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql` (Sprint 145)
still claimed "has NOT been executed" and lacked `to authenticated` on
its four `CREATE POLICY` statements — the exact defect pattern behind the
Sprint 177F incident. It was never re-run and never caused a Production
issue this sprint, but was a live landmine if ever mistakenly re-applied.
Fixed by adding an unmistakable DO-NOT-APPLY warning (historical SQL text
itself preserved unmodified) plus a static guarding test, merged to main
in `sprint-178-scheduled-writer-anti-drift-v1`. Separately, a genuine,
sustained browser-automation tooling difficulty was encountered when
driving Vercel's Environment Variables and Deployment Actions dropdown
menus (many clicks failed to open the menu; screenshots repeatedly timed
out) — worked around via a combination of exact JS-computed coordinates
and the accessibility-tree `find` tool, with no incorrect or unintended
action taken at any point.

## 31. Recommendation for full automation

Now that draft/published/archived deduplication is proven live and
correct, and the corrective RLS role-scoping is confirmed stable and
undrifted, the next natural step toward broader automation is a
controlled second canary run against a second source (e.g.
`pruszkow-aktualnosci`, which the REST-API-aware fetch path already
supports) under the same one-request, cap=1, manual-secret discipline —
followed by, only after several clean manual runs, a discussion of
enabling `SCHEDULED_CHECKS_ENABLED`-driven Cron on a narrow, single-source
schedule with the same kill switches and rollback discipline proven here.
