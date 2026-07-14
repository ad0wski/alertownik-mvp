# Sprint 155 — Open-Ended Alert Review v1

Read-only. Fetched via the public anon-key REST endpoint (same access
as the live homepage). No data changed.

## The record

`wkd-ograniczenia-predkosci-2026-06-29`

| Field | Value |
|---|---|
| Title | "Możliwe kilkuminutowe opóźnienia na linii WKD" |
| Category / severity | transport / info |
| Place | Linia WKD |
| starts_at | 2026-06-28 |
| ends_at | **NULL** |
| Change | "WKD poinformowała, że z powodu wysokich temperatur wprowadzono ograniczenia prędkości pociągów na linii WKD. Może to powodować kilkuminutowe opóźnienia w kursowaniu pociągów." |
| Action | "Przed podróżą sprawdź aktualny rozkład jazdy i komunikaty WKD..." |
| Source | WKD, https://wkd.com.pl/aktualnosci/3675-ograniczenia-predkosci-na-linii-wkd |
| source_id | **NULL** — not linked to the source registry |
| published_at | 2026-07-04 |

As of this review (2026-07-13), the alert has been live for 15 days
with no end date.

## Assessment

The underlying cause stated in the alert's own text is **heat-triggered
speed restrictions** — this is, by its nature, a condition-dependent
situation that real railway operators typically lift or reissue as
weather changes, not a fixed multi-week engineering restriction. A
15-day-old, still-open-ended notice about a heat-triggered condition
is exactly the kind of record likely to have quietly gone stale
without anyone re-checking the source — the app has no automated
monitoring, so nothing would catch this on its own.

This is reinforced by two structural facts:
- `ends_at` was never set, so the app's own status logic has no way
  to auto-retire it.
- `source_id` is `NULL`, meaning it isn't linked to the source
  registry's check-history tracking either — there's no record of
  when (or whether) this alert's source was last re-verified since
  publication on 2026-07-04.

## Recommendation

**Re-check the live source URL before public beta, and do one of the
following** (this is a judgment call for Adam — Claude is not making
this change):

1. If the speed restriction is confirmed still in effect on WKD's own
   page → keep it published, but set a concrete `ends_at` if WKD's
   notice gives one, or at minimum re-set `updated_at` after
   confirming, so there's a recent verification timestamp.
2. If WKD's notice has been updated or removed (restriction lifted) →
   archive this alert.
3. If the source page can't be checked right now → treat this as the
   single highest-priority item on the next source-check pass, ahead
   of routine weekly checks — it's already the oldest open-ended
   record in the dataset.

**Do not leave it open-ended without re-verification** through the
public beta period — of the app's 4 total published alerts, this is
the one most likely to visibly embarrass the "we check sources
before publishing" trust claim if it turns out to be outdated.
