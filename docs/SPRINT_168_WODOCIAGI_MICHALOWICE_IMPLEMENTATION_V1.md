# Sprint 168 — Wodociągi Michałowice source added (implementation)

**Status: implemented, tested, locally verified. Not merged to `main`, not deployed.**

Follow-up to `docs/SPRINT_168_SOURCE_COVERAGE_INVESTIGATION_V1.md`, which
identified Wodociągi Michałowice as the highest-confidence next candidate
but did not implement it. This document covers the implementation session:
what was built, why, what was rejected, and how to repair it if the
upstream site changes.

---

## 1. Source added

| | |
|---|---|
| Name | Wodociągi Michałowice — awarie i przerwy |
| id | `wodociagi-michalowice` (already existed in the checklist since an earlier sprint; only its `officialUrl`/`apiUrl` and check-eligibility changed) |
| Human-facing URL (`officialUrl`) | `https://wodociagimichalowice.pl/category/aktualnosci/` |
| Actual fetch target (`apiUrl`) | `https://wodociagimichalowice.pl/wp-json/wp/v2/posts?categories=1&per_page=6` |
| Category | `water` |
| Localities | Komorów, Nowa Wieś, Granica, Michałowice, Reguły |

## 2. Why the REST API, not HTML scraping

`wodociagimichalowice.pl` is a standard WordPress site. It exposes its own
posts as structured JSON via the standard, publicly documented
`/wp-json/wp/v2/posts` REST endpoint — verified live during this sprint:

- `wp-json/`, `wp-json/wp/v2/posts`, `wp-json/wp/v2/categories` all return
  `HTTP 200` with clean JSON, no authentication of any kind.
- Category `1` = "Aktualności" (294 total posts at investigation time,
  confirmed via the `X-WP-Total`/`X-WP-TotalPages` response headers).
- 20 sample posts were read in full: ~15/20 are genuine water-interruption
  notices ("Przerwa w dostawie wody"), a few are office-hours/pricing
  announcements, and exactly one is a generic educational/PR post ("Woda
  z kranu – zdrowo, ekologicznie i z korzyścią dla portfela") that must
  never be surfaced as an operational notice.

Per the sprint's own instruction ("Preferuj REST API tylko wtedy, gdy jest
stabilne i zwraca wymagane dane"), the REST API was preferred over parsing
the rendered `/category/aktualnosci/` HTML: it is official structured
data (not a scrape), and it is far more stable across WordPress theme
changes than hand-written HTML selectors would be. `officialUrl` still
points admins at the human-readable category archive page — that's what
"Otwórz źródło" opens — but the actual fetch, done by
`fetchAndParseManualCheck`, calls `apiUrl` instead whenever it is set.

## 3. Architecture — no parallel system

Per the sprint's explicit constraint ("Nie twórz osobnego systemu obok
istniejących parserów"), the WordPress REST support was added directly
into the existing pipeline, not alongside it:

- **`src/lib/sourceParsers/pageParser.ts`** — new `parseWordpressRestPosts()`
  function, living in the same file as the existing `extractNewsListItems`
  (Michałowice's custom CMS) and `extractBlogPostItems` (WKD's Joomla
  markup) passes. It returns the exact same `PageParseResult`/
  `PageCandidate` shape those passes do, reuses the same `stripTags`/
  `decodeEntities`/`detectDateInText` helpers, and — like every other
  extraction pass — owns its own domain-specific relevance filter rather
  than pushing that judgment onto the generic safety layer. A new
  `isWordpressRestPostArray()` type guard fails closed on any JSON shape
  that isn't an array (a single object, an error payload, a
  plugin-reshaped response) rather than guessing.
- **`src/lib/sourceCheck.ts`** — unchanged pipeline. `buildCheckProposals()`
  still applies the same universal safety filters (min length 60 chars,
  boilerplate rejection, 6-proposal cap, title dedup) to WordPress-sourced
  candidates exactly as it does to HTML-sourced ones — no special-casing.
- **`src/lib/manualSourceCheckFetch.ts`** — extended, not replaced. The
  Sprint 167 single-attempt fetch function was renamed to
  `attemptManualCheckHtmlFetch` and a new sibling,
  `attemptWordpressRestFetch`, was added for the JSON branch. A small
  dispatcher picks between them based on whether the resolved target has
  an `apiUrl`. The existing bounded-retry policy (`fetchAndParseManualCheck`
  — exactly one retry, transient failures only: `http_5xx`, `network_error`,
  `timeout_10s`; permanent failures `http_4xx`/`parse_exception` never
  retry) wraps both branches identically — this sprint added zero new
  retry logic, only a second thing to retry.
- **`src/app/api/sources/check/route.ts`** — one-line call-site change to
  pass both `officialUrl` and `apiUrl` through.
- **`src/lib/officialSourceChecklist.ts`** — new optional `apiUrl?: string`
  field on `OfficialSourceCheck`; only this one source sets it.

No new route, no new table, no new fetch pipeline, no cron, no writer.

## 4. Relevance filter (why the PR post gets rejected)

`OPERATIONAL_NOTICE_KEYWORDS_RX` in `pageParser.ts` is a deterministic
Polish keyword regex (przerwa/awaria/brak wody/wyłączenie/nieczynny/prace
na sieci/remont sieci/płukanie sieci/jakość wody, with word-ending
wildcards to catch Polish inflection — e.g. `awari[a-złńóśźż]*` matches
awaria/awarii/awarią/awarie). A post's title+excerpt combined text must
match at least one term to become a candidate at all. This is intentionally
narrower than "any WordPress post" — it is the sprint's answer to the same
failure mode its own investigation already flagged in the rejected
`roboty-drogowe` candidate (a general news feed producing off-topic
proposals). The educational "Woda z kranu" post contains none of these
terms and is excluded before it ever reaches `buildCheckProposals`.

### Accepted example (fixture, invented — not a real post)
> **Przerwa w dostawie wody** — Wodociągi Michałowice informują, że w dniu
> 23 lipca 2026 roku w godzinach od 9:00 do 14:00 wystąpi przerwa w
> dostawie wody w miejscowości Komorów w rejonie ul. Krakowskiej, z powodu
> prac na sieci wodociągowej.

### Rejected example (the actual real post's title, seen live)
> **Woda z kranu – zdrowo, ekologicznie i z korzyścią dla portfela** — an
> educational/PR article about tap water with no operational content.
> Contains no keyword match → never proposed.

## 5. Test coverage

- `tests/e2e/wordpressRestParser.spec.ts` (13 tests) — pure-function
  fixture tests of `parseWordpressRestPosts`/`isWordpressRestPostArray`:
  a real outage notice is proposed with correct date detection; a
  headingless post still proposes from its body; the educational PR post
  (and a mixed batch containing one) is excluded; near-duplicate notices
  are flagged by the existing `findSimilarText` dedup heuristic while
  genuinely different notices are not; posts with no detectable date, an
  empty posts array, and a post missing every optional field never throw;
  extra/unexpected plugin-added JSON fields never break extraction; Polish
  diacritics delivered as numeric HTML entities decode correctly.
- `tests/e2e/manualSourceCheckWordpressRest.spec.ts` (9 tests) — fetch/retry
  behavior of the REST branch specifically: single success, empty-array
  success, permanent 404 (no retry), transient 503 (retries once), network
  error (retries once), malformed JSON body (fails closed, no retry),
  non-array JSON shape (fails closed, no retry), timeout (retries once),
  and a post with unexpected extra plugin fields still parses.
- Existing suites re-run unchanged and still green: `sourceCheck.spec.ts`
  (allowlist now expects 3 ids), `manualSourceCheckFetchRetry.spec.ts`,
  `scheduledSourceFetchRetry.spec.ts`, `adminApiRouteAuth.spec.ts`.
- `npm run typecheck`, `npm run lint`, `npm run build` all pass with zero
  errors/warnings.
- Local dev-server smoke test: public `/`, `/login` → 200; admin `/admin`,
  `/admin/sources` shell → 200 (client-side auth-gated); unauthenticated
  `POST /api/sources/check` with `sourceKey: "wodociagi-michalowice"` →
  `401 { ok:false, error:"Wymagane logowanie." }`, confirming the route
  fails closed before ever reaching the fetch/parse logic — no live
  request was made to the real WordPress site during this session's app
  testing (only earlier, separate manual `curl` investigation calls were).

## 6. Enabling in the admin UI

`"wodociagi-michalowice"` was added to `SAFE_CHECK_SOURCE_IDS`
(`src/lib/sourceCheck.ts`), which is the only thing `getSafeCheckSource()`
checks. `OfficialSourceChecklist.tsx` already renders `<SourceApiCheckPanel>`
purely based on that allowlist membership — zero UI component changes were
needed for the "Sprawdź teraz przez aplikację" button to appear on this
source's card.

## 7. Limitations and risks

- **WordPress REST API could be disabled or reshaped.** Some WP sites
  disable `wp-json` (security plugins) or a future core/plugin update
  could rename fields. `isWordpressRestPostArray` fails closed on any
  non-array response; a malformed-JSON or reshaped-array response still
  degrades to a clean, admin-facing Polish error message, never a crash
  or false proposals.
- **Category id `1` could be reassigned.** If the site's category
  structure changes, `apiUrl`'s `categories=1` filter could silently
  start returning the wrong (or zero) posts. Nothing in this
  implementation detects that automatically — see the repair procedure
  below.
- **The keyword filter is necessarily imperfect.** It is a deliberate,
  reviewable, deterministic heuristic, not a content-understanding model.
  A genuine notice using unusual phrasing could theoretically be missed;
  this fails safe (nothing shown, not something wrong shown) and matches
  every other extraction pass's approach in this codebase.
- **Pruszków (`pruszkow-aktualnosci`) was investigated again this sprint
  and NOT added** — see §8.

## 8. Pruszków re-verification (Step 6) — inconclusive, not added

A local `curl` re-fetch of
`https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/` (previously
documented as HTTP 403/bot-blocked, Sprint 73/77) returned `HTTP 200`
(168 439 bytes) this session. However, the response headers show the site
is now Cloudflare-fronted with active bot-management signals
(`cf-cache-status: DYNAMIC`, `Server: cloudflare`, `CF-RAY`,
`X-turbo-charged-by: LiteSpeed`, `Report-To`/`Nel` telemetry) — and,
notably, the same response also advertises `wp-json` REST discovery
(`Link: <https://www.pruszkow.pl/wp-json/>; rel="https://api.w.org/"`),
meaning Pruszków is *also* WordPress and the same REST-API technique built
this sprint would likely apply cleanly there too, if the site is reachable.

A single successful fetch from this local development machine is weak
evidence that Vercel's actual production outbound requests (different IP
range, different fingerprint) would be treated the same way by
Cloudflare's bot detection — Cloudflare's blocking decisions are commonly
IP-reputation- and fingerprint-based, not fixed per-UA rules. Per the
sprint's own explicit instruction ("nie dodawaj źródła, jeśli nie ma
stabilnej listy prawdziwych komunikatów"), the honest, safe conclusion is:
**still unconfirmed — do not add Pruszków this sprint.** A future sprint
should re-check specifically from a deployed Preview/Production
environment (e.g. a one-off authenticated admin check) before concluding
anything has changed. If it does turn out to be reachable, the WordPress
REST API path built this sprint (`parseWordpressRestPosts`,
`attemptWordpressRestFetch`, the `apiUrl` field) should need little to no
new code — only a new `apiUrl`/`officialUrl` pair and its own keyword
relevance filter tuned to Pruszków's content (heating/hot-water notices
per its existing `whatToCheck` note, not water-network notices).

## 9. Parser-repair procedure (if this source ever breaks)

If the "Sprawdź teraz przez aplikację" button on Wodociągi Michałowice
starts returning nothing (or an error) where notices are known to exist,
check in this order:

1. **Is `wp-json/wp/v2/posts` still `HTTP 200` and JSON?**
   `curl -s https://wodociagimichalowice.pl/wp-json/wp/v2/posts?per_page=1`
   — if this 404s or returns HTML, the REST API itself was disabled;
   fall back to an HTML extraction pass against
   `/category/aktualnosci/` instead (mirror `extractNewsListItems`).
2. **Is category `1` still "Aktualności"?**
   `curl -s https://wodociagimichalowice.pl/wp-json/wp/v2/categories` and
   check the `id`/`slug`/`name` for the aktualności category — update the
   `categories=` query param in `officialSourceChecklist.ts`'s `apiUrl`
   if it changed.
3. **Do `title.rendered`/`excerpt.rendered` still exist on post objects?**
   Fetch one live post and inspect its JSON shape. If WordPress/a plugin
   restructured the response (e.g. `excerpt` removed, `content` now
   required), update `parseWordpressRestPosts` accordingly — it already
   falls back from `excerpt.rendered` to `content.rendered` when the
   former is empty.
4. **Are proposals suddenly all off-topic, or all missing?**
   Re-read 15–20 live sample posts by hand (as this sprint did) and
   adjust `OPERATIONAL_NOTICE_KEYWORDS_RX` if the site's own wording
   pattern shifted — this is the one piece of this implementation that is
   a judgment call, not a structural fact, and is expected to need
   occasional human review over time.

## 10. What this session did NOT do

No Environment Variable was changed. No Production SQL was run. No cron
was touched. No writer identity was touched. No email/Resend was touched.
No alert was auto-published — the manual check API only ever proposes;
saving a candidate and publishing remain separate, explicit admin actions
in the browser. No request was made to any Production write endpoint. No
merge to `main` was performed.

## 11. Branch

Continued on `sprint-168-source-coverage-investigation-v1` (not merged to
`main`), building directly on the prior investigation commit.
