# LR-4 — Operational Freshness Findings (2026-11-11)

Read-only analysis. No writer code, env, DB or RLS was changed.

## Verdict: RED

The scheduled writer, as it works today, would withhold most real water
notices from the review queue. The cause is duplicate detection, not cron
frequency and not the one-candidate cap.

## How the writer picks its one item per run

1. Fetch the main listing of `michalowice-komunikaty`.
2. `parsePageHtml` keeps the first 8 news items, in page order.
3. `buildCheckProposals` keeps the first 6, dropping any repeated title.
4. `writeCandidatesForSource` walks them in page order and, for each:
   - `duplicate` (similarity ≥ 0.9) → skipped,
   - `ambiguous` (similarity ≥ 0.6) → skipped, only counted in run history,
   - otherwise the first new one is inserted; the rest are counted as capped.

There is no category priority: a job offer listed above a water notice wins.
Real example: on 2026-11-07 the cron inserted "Obchody 108. rocznicy…"
instead of "Brak wody - Reguły" (published the previous afternoon); the water
notice only reached the queue through a manual run three hours later.

## The actual problem — templated notices look like duplicates

"Brak wody" notices share one template; only the locality, streets and date
change. Similarity is word overlap divided by the shorter text, with no
place/date check on the same-source path, so they score 0.5–0.7 against each
other.

Measured with the real `classifyProposalAgainstExisting`:

| Comparison | new | ambiguous | duplicate |
|---|---|---|---|
| Each of the 43 water notices of 2026 vs all earlier ones | 3 | 36 | 4 |
| 12 most recent water notices vs today's real Production pool | 8 | 4 | 0 |

Today's pool holds one water candidate and two water alerts, so the effect is
still partial (4 of 12). It grows with every water candidate or alert added.

The place/date veto already implemented for cross-source dedup
(`classifyProposalAgainstOtherSourceCandidates`) fixes most of it on the same
data: 39 new, 4 ambiguous, 0 duplicate.

## Historical replay on the real 2026 archive

In-memory replay of the real `buildCheckProposals` + writer loop, one run per
day at the observed 06:21 UTC, over 180 real notices (43 water).

Assumptions (the archive cannot tell us these): 14 water notices show only an
event date, so their publication time was set to 15 h or 40 h before the
event; water notices leave the main listing at the end of the event day;
listing order is newest first. Results are estimates, not measurements.

Water notices reaching the review queue (15 h / 40 h assumption):

| Variant | ≥12 h before | <12 h before | after start | never |
|---|---|---|---|---|
| A. current: cap 1, 1 run/day | 3 / 8 | 8 / 4 | 1 / 0 | **31 / 31** |
| B. cap 3 | 3 / 7 | 8 / 5 | 1 / 0 | 31 / 31 |
| C. actionable-first ordering | 3 / 8 | 8 / 4 | 1 / 0 | 31 / 31 |
| D. 2 runs/day | 4 / 8 | 4 / 1 | 5 / 4 | 30 / 30 |
| E. place/date veto in same-source dedup | 8 / 21 | 17 / 8 | 1 / 0 | 17 / 14 |
| F. veto + actionable-first + cap 2 | 9 / 23 | 22 / 9 | 1 / 0 | 11 / 11 |
| G. F + 2 runs/day | 18 / 32 | 13 / 0 | 7 / 6 | 5 / 5 |

Reading it:

- More candidates per run, ordering, or more cron runs do nothing on their own
  (A–D): the notices are rejected before the cap is ever reached.
- The veto is the change that matters (E).
- 7 of the 43 notices were published at or after the outage started
  (failures). No schedule delivers those early; a second daily run at least
  delivers them the same day (the "after start" column in G).
- "<12 h before" in practice means the candidate appears around 07:21 local
  time in winter and 08:21 in summer, for outages that start at 08:00–10:00.
  A human still has to review it, so one morning run is tight even when it
  works.

## Smallest sensible change (not implemented in LR-4)

1. Apply the existing place/date veto to same-source dedup.
2. Order proposals so those with a detected category come first, and raise the
   per-run cap from 1 to 2 (`SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN`).
3. Add a second daily run in the late afternoon, so notices published during
   office hours are queued the evening before the outage.
4. Stop dropping same-title notices within one page when their text differs
   (two "Brak wody - Komorów" notices on one day currently collapse to one).

Steps 1–2 and 4 are code-only. Step 3 is one more entry in `vercel.json`
(a cron change needs explicit approval under this repo's rules, and the plan's
cron limits should be confirmed first).

Auto-publish stays off throughout; none of this touches it.
