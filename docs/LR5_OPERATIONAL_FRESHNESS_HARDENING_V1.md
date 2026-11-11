# LR-5 — Operational Freshness Hardening (2026-11-11)

Closes the P0 found in `docs/LR4_OPERATIONAL_FRESHNESS_FINDINGS_V1.md`: the
scheduled writer withheld most real water notices as "ambiguous duplicates".

## Root cause

`writeCandidatesForSource` classified every proposal with
`classifyProposalAgainstExisting` → `classifyCandidateAgainstExisting`:
word overlap divided by the shorter text (`textSimilarity`), ≥ 0.6 ambiguous,
≥ 0.9 duplicate, with no look at place or date. Official notices of one kind
share a template ("…nastąpi przerwa w dostawie wody do posesji położonych w
miejscowości…"), so unrelated notices score 0.5–0.9 against each other.
"Ambiguous" proposals are counted in run history and never inserted.

Two smaller contributors:

- `buildCheckProposals` dropped any repeated title, so two different
  "Brak wody - Komorów" notices on one page collapsed into one.
- Proposals were processed in page order, so non-alert content could take
  the run's only slot.

## What changed

| Change | Where |
|---|---|
| Same-source dedup now skips a pair whose event dates or localities provably differ | `classifyProposalAgainstSameSourceItems` (`scheduledWriter.ts`) |
| Event date ignores the listing's leading post timestamp; "8 kwietnia br." takes the year of that timestamp | `extractEventDateIso` (`candidateWarnings.ts`) |
| All named pilot localities are read; "gmina Michałowice" is not a locality | `extractEventPlaces` (`candidateWarnings.ts`) |
| A repeat is the same title **and** the same permalink/text | `buildCheckProposals` (`sourceCheck.ts`) |
| Category-detected proposals are considered first (stable order inside each group) | `prioritizeActionableProposals` |
| Env override of the per-run limit is capped at 2 | `MAX_ALLOWED_CANDIDATES_PER_INVOCATION` |

Unchanged on purpose:

- An identical permalink is always a duplicate, checked before any veto.
- A date or locality missing on either side is "unknown" and never vetoes —
  that pair is scored exactly as before.
- Thresholds (0.9 / 0.6), boilerplate stripping and cross-source dedup.
- `classifyProposalAgainstExisting` itself, which the auto-publish gate
  (`evaluateAutoPublishEligibility`) still uses. Auto-publish is not loosened.
- Code default for the per-run limit stays 1. Production sets
  `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN=2`; setting it back to 1 (or
  removing it) is an instant, code-free rollback of the limit.

## Results on the real 2026 archive

`tests/e2e/writerHistoricalReplay2026.spec.ts` replays the real writer over
`tests/fixtures/michalowice-komunikaty-archive-2026.json` (180 notices, 43
water). Same timeline model for both columns; "before" was produced by
running the same spec against the original source.

Each water notice against all earlier ones (no timeline assumptions):

| | new | ambiguous | duplicate |
|---|---|---|---|
| Before | 3 | 36 | 4 |
| After | 40 | 3 | 0 |

The 3 that remain ambiguous share both the event day and a locality with
their match (e.g. two Komorów outages on 30.10 on different streets). That is
genuine uncertainty for these signals, not template similarity.

Replay, one run per day:

| | queued | never | never: dedup | never: posted by the gmina at/after the start | never: other |
|---|---|---|---|---|---|
| Before (limit 1) | 12 | 31 | 25 | 2 | 4 |
| After (limit 2) | 36 | 7 | 3 | 2 | 2 |

The two "other" cases after the fix: one notice squeezed out on a day with
five category notices (capacity), and the 05.03 emergency, which was posted
on the day of the failure itself — so in practice three of the seven are
upstream same-day notices that no schedule can deliver early.

Timing for notices with a known publication time (29 of 43): 21 queued
before the outage — 11 of them two or more days ahead, 10 only 1–3 hours
ahead (posted the afternoon before, picked up by the morning run). A second
daily run remains the P1 fix for that half.

## Known limits

- Two outages on the same day in the same village on different streets
  still read as ambiguous. Streets are not compared.
- Localities outside the six pilot names (Opacz, Pęcice) are "unknown", so
  for them only the date can separate notices.
- Ambiguous proposals are still only counted, not shown to the admin.
- With limit 2 a quiet day fills both slots with informational notices until
  the listing's backlog is exhausted.
