# Sprint 154 — Public Beta Data Freshness Audit v1

**Read-only.** No INSERT/UPDATE/DELETE was executed. Query method:
one `GET` request to the public Supabase REST endpoint using the
existing `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon key) — the same
access level and RLS scope (`status = 'published'` only) the public
homepage itself uses. No service_role, no admin session, no Supabase
MCP (not available this session).

Audit run: 2026-07-13.

## Raw result

4 published rows total (all rows currently visible to an anonymous
public visitor):

| Slug | Category | starts_at | ends_at | Computed status |
|---|---|---|---|---|
| `wkd-ograniczenia-predkosci-2026-06-29` | transport | 2026-06-28 | **NULL** | ACTIVE/LIVE |
| `wkd-rozklad-jazdy-od-2026-06-29` | transport | 2026-06-29 | 2026-08-30 | ACTIVE/LIVE |
| `pruszkow-przerwa-cieplo-ciepla-woda-2026-07-04` | water | 2026-07-04 | 2026-07-09 | ENDED |
| `pruszkow-utrudnienia-komorowska-prusa-2026-07-06` | transport | 2026-07-05 | 2026-07-07 | ENDED |

## Findings

1. **Active alerts: 2.** Both transport/WKD. This matches what the
   live homepage shows (confirmed via browser smoke test the same
   session): "Wszystkich alertów: 4", 2 shown live, "Pokaż zakończone
   (2)" collapsed.
2. **Ended alerts: 2.** Both already correctly excluded from the
   "live" section by the app's own client-side status computation
   (`STATUS_ORDER` bucketing in `AlertList.tsx`) — no code bug, no
   stale data incorrectly presented as current.
3. **No alert has a `starts_at` in the future** — nothing in the
   "upcoming" bucket right now.
4. **One alert has no end date**: `wkd-ograniczenia-predkosci-2026-06-29`
   (`ends_at = NULL`), active since 2026-06-28 — 15 days as of this
   audit, with no defined expiration. Not necessarily wrong (some
   ongoing situations genuinely have no known end date), but it is
   the one record worth a human look: is the underlying situation
   (WKD speed restriction) still actually true today, or should it
   now get an end date / be archived?
5. **Oldest active alert**: the same record, `starts_at = 2026-06-28`.
   No alert is old enough on its own to call "stale data dominating
   the homepage" — the opposite risk is more visible here: the
   dataset is thin (4 total records, 2 categories represented:
   transport + water), not stale. This is a content-coverage
   observation, not a freshness defect.
6. **No obvious archival candidate.** Both ended alerts are still
   `status = 'published'` in the database (by design — the app shows
   them collapsed under "Zakończone" rather than requiring archival
   for every past event) rather than `status = 'archived'`. This
   matches existing product behavior and is not a bug.

## Recommendations

- **For Adam**: review whether the WKD speed-restriction alert
  (`wkd-ograniczenia-predkosci-2026-06-29`) is still accurate as of
  today and either set a concrete `ends_at` or leave it open-ended if
  the restriction is genuinely indefinite — this is a domain-accuracy
  judgment call Claude cannot make.
- **For Adam**: consider whether 2 active categories (transport,
  water) out of the 6 the app advertises (transport, water, power,
  waste, roads, municipal) is enough content for a public beta, or
  whether more source-checking is needed first — this is a scope/
  content decision, not a code gap.
- No code change is needed as a result of this audit — the app's
  existing live/ended bucketing behaves correctly against the real
  data.

## What this audit does not cover

- Draft/archived rows are invisible to the anon key by RLS design —
  intentionally not queried here, since a public-beta freshness audit
  should only ever look at what a real visitor sees.
- No admin-only fields (source_id, internal notes) were requested or
  are shown above.
