# Sprint 169 — source expansion audit + Pruszków aktualności added

**Status: implemented, tested, locally verified. Not merged to `main`, not deployed.**

Follow-up to Sprint 168 (Wodociągi Michałowice via WordPress REST). This
sprint audited the next priority categories (power outages, waste, roads,
powiat pruszkowski) for a fourth safe manual-check source.

---

## 1. Audit — priority order and findings

### Priority 1: planowane i awaryjne wyłączenia prądu (power outages)

Official operator already identified in earlier sprints and present in the
checklist: **PGE Dystrybucja** (`pgedystrybucja.pl`). Not assumed fresh
this sprint — the existing `pge-planowane`/`pge-aktualne` checklist
entries and their `riskNote`s already record this. Live re-check this
sprint:

- `pgedystrybucja.pl/wylaczenia/planowane-wylaczenia` → HTTP 200, but the
  page body is a 230-byte near-empty shell (client-rendered SPA).
- `pgedystrybucja.pl/wp-json/` → HTTP 200 but the body is **not JSON** —
  it's an HTML page reading *"Żądana operacja została odrzucona. Skontaktuj
  się z administratorem."* (a WAF/edge-security rejection, not a real
  `wp-json` response — the 200 status is misleading).

**Conclusion: still not viable.** Confirms and strengthens the existing
`riskNote` ("Interfejs wymaga ręcznego wyboru rejonu") — PGE's site
actively rejects this kind of automated request behind a WAF, on top of
already requiring a manual region picker. Not a candidate this sprint or
without dedicated, separate investigation (e.g. contacting PGE for a
public data feed, which is out of scope for a coding sprint).

### Priority 2: odpady i zmiany harmonogramów odbioru (waste)

The existing `michalowice-odpady` checklist entry's own `whatToCheck`
already documents the real constraint: the schedule is a scanned PDF, not
structured data (`riskNote`: "PDF-y są skanowane — daty przepisuje się
ręcznie"). No RSS/API discovered on `michalowice.pl` (`/rss`, `/rss.xml`,
`/dzieje-sie/aktualnosci/rss` all 404). **Not viable this sprint** — PDF
diffing/OCR is a materially different, larger effort than this sprint's
scope, and waste-schedule *changes* (as opposed to the static annual
schedule) would more likely surface as ordinary gmina komunikaty, already
covered by the working `michalowice-komunikaty` source.

### Priority 3: drogi, remonty, utrudnienia (roads)

Already investigated and rejected in Sprint 168 (`roboty-drogowe` —
gmina's general news feed, zero on-topic posts in a 6-item sample: a
grant program, a tourism rally, nursery recruitment, children's events).
Not re-investigated this sprint; no new dedicated roads source was found
for Michałowice specifically. (Pruszków's own road/traffic notices are
covered as part of §2 below — see the multi-topic filter rationale.)

### Priority 4: komunikaty powiatu pruszkowskiego → implemented via Miasto Pruszków

The existing `pruszkow-aktualnosci` checklist entry (Miasto Pruszków, not
the powiat itself — the city is the highest-value point of contact for
the pilot's Pruszków locality) was historically documented as HTTP
403/bot-blocked (Sprint 73/77, re-confirmed inconclusive in Sprint 168).
This sprint's live re-check found the **rendered HTML page** still
returns a near-empty/blocked response for automated requests, but
**pruszkow.pl's own WordPress REST API is fully public and unblocked**:

- `pruszkow.pl/wp-json/` → HTTP 200, real JSON (Cloudflare-fronted but not
  blocking this request).
- `wp-json/wp/v2/categories` → category `371`, slug
  `aktualnosci-mieszkaniec`, name "Aktualności dla Mieszkańców", **2843
  posts** — exactly matches the checklist's existing human-facing URL
  path (`/mieszkancy/aktualnosci-mieszkaniec/`).
- 20 sample posts read in full: a genuine, keyword-matchable subset of
  real operational notices (road/traffic-organization changes, heat/
  hot-water interruptions, transit-line diversions, alarm-siren tests) —
  **7/20** — mixed with a majority of general municipal PR/event content
  (a weekly events digest, a lost-pet appeal, a subsidy-program update, a
  cultural exhibition, workshops, a competition announcement) — **13/20**.

**Implemented** as the fourth safe-check source, gated by its own
deterministic keyword filter — see §3.

---

## 2. Source added

| | |
|---|---|
| Name | Miasto Pruszków — aktualności |
| id | `pruszkow-aktualnosci` (pre-existing checklist entry; only `apiUrl`, `riskNote`, and check-eligibility changed) |
| Human-facing URL (`officialUrl`) | `https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/` (unchanged) |
| Actual fetch target (`apiUrl`) | `https://www.pruszkow.pl/wp-json/wp/v2/posts?categories=371&per_page=6` |
| Category | `municipal` |
| Localities | Pruszków |

## 3. Why a separate, broader keyword filter

Unlike Wodociągi's single-topic category (water only), Pruszków's
checklist entry itself already spans multiple topics per its own
`whatToCheck` ("remonty, przerwy w dostawie ciepła/ciepłej wody, zmiany w
odbiorze odpadów, wydarzenia zamykające ulice"), and its WordPress
category is a much more general municipal news feed — the same shape that
Sprint 168 already rejected for `roboty-drogowe`. The difference here:
live sampling showed a real, keyword-matchable operational subset, not
zero. `parsePruszkowRestPosts` (new sibling to `parseWordpressRestPosts`
in `pageParser.ts`, sharing all the same mechanics via a new internal
`extractWordpressRestCandidates` helper) applies its own
`PRUSZKOW_NOTICE_KEYWORDS_RX` — Polish stems for przerwa/utrudnienie/
remont/objazd/zamknięcie/wyłączenie/awaria, "zmiana organizacji ruchu",
"odbiór odpadów"/"harmonogram odpadów", "ciepła woda"/"energia cieplna",
and "syrena alarmowa" — validated against the same 20 real live post
titles: **7/20 correctly matched (100% of the genuinely operational
posts), 13/20 correctly excluded, zero false positives.**

### Accepted examples (fixtures, invented bodies — titles match real live posts)
- "Zmiana organizacji ruchu na drodze wojewódzkiej nr 719"
- "Przerwa w dostawie energii cieplnej i ciepłej wody"
- "Linia nr 3 — objazd ul. Bohaterów Wolności"
- "Głośne testy syren alarmowych"

### Rejected examples (real live post titles, no fixture body needed)
- "Co? Gdzie? Kiedy? Przegląd wydarzeń w Pruszkowie…" (weekly digest)
- "Kręciołek szuka jedynego domu i człowieka, któremu zaufa" (lost pet)
- "Od 20 lipca 2026 r. zmiany w programie „Czyste Powietrze”" (subsidy
  program change, not a service disruption)
- "TERENOWA WYSTAWA GŁAZÓW NARZUTOWYCH W MIEŚCIE" (cultural exhibit)

## 4. Architecture — dispatcher, no parallel system

Per the standing constraint ("Nie twórz osobnego systemu obok istniejących
parserów"), Sprint 169 extended the exact Sprint 168 pipeline rather than
adding a new one:

- **`pageParser.ts`**: `extractWordpressRestCandidates(posts, keywordsRx)`
  factors out the shared per-post extraction loop; `parseWordpressRestPosts`
  and the new `parsePruszkowRestPosts` are now both thin wrappers over it
  with their own regex and result title — each pass still owns its own
  relevance judgment, only the mechanics are shared.
- **`manualSourceCheckFetch.ts`**: `ManualCheckFetchTarget` gained an
  optional `parseRestPosts` field (a parser function), defaulting to
  `parseWordpressRestPosts` so Sprint 168 callers that never set it keep
  working unchanged. This module still knows nothing about specific
  sources — it only runs whichever parser it's handed.
- **`src/app/api/sources/check/route.ts`**: owns the actual "which source
  uses which parser" decision via a small `REST_PARSERS_BY_SOURCE_ID` map,
  next to its existing `getSafeCheckSource` wiring.
- **`officialSourceChecklist.ts` / `sourceCheck.ts`**: `apiUrl` added to
  the existing `pruszkow-aktualnosci` entry; `pruszkow-aktualnosci` added
  to `SAFE_CHECK_SOURCE_IDS`.

No new route, table, fetch pipeline, cron, or writer.

## 5. Test coverage

- `tests/e2e/pruszkowRestParser.spec.ts` (15 tests) — pure-function fixture
  tests of `parsePruszkowRestPosts`: 4 genuine-notice-types included (road
  org-change, heat/water interruption, transit diversion, siren test); 4
  off-topic categories excluded (weekly digest, lost pet, subsidy program,
  cultural event) plus a mixed-batch case; near-duplicate detection via
  the existing `findSimilarText` heuristic; robustness (no date, empty
  array, missing fields, extra plugin fields, distinct result title).
- `tests/e2e/manualSourceCheckPruszkowRest.spec.ts` (5 tests) — proves the
  dispatcher actually wires Pruszków's parser end-to-end (not just that
  the parser works in isolation): an off-topic post yields zero proposals
  through the full fetch path, a genuine post is proposed with the correct
  page title, and the existing retry/failure-mode behavior (404, 503,
  non-array JSON) applies identically to this branch.
- Existing suites updated and re-run green: `sourceCheck.spec.ts`
  (allowlist now expects 4 ids; the old "Pruszków must be rejected" case
  replaced with a "Pruszków resolves correctly" case),
  `sourceHealth.spec.ts` (API-supported count 3→4, note now names all
  four sources — its Sprint 168-hotfix dynamic derivation absorbed this
  automatically), `manualSourceCheckWordpressRest.spec.ts`,
  `manualSourceCheckFetchRetry.spec.ts`, `wordpressRestParser.spec.ts`,
  `adminApiRouteAuth.spec.ts`.
- `npm run typecheck`, `npm run lint`, `npm run build` all pass with zero
  errors/warnings.
- Local dev-server smoke test: public `/`, `/login` → 200; `/admin/sources`
  shell → 200; unauthenticated `POST /api/sources/check` with
  `sourceKey: "pruszkow-aktualnosci"` → 401 before any fetch/parse runs.

## 6. Limitations and risks

- **Cloudflare could still behave differently for Vercel's outbound
  traffic than for this local session**, even though this sprint's fetches
  succeeded cleanly (real JSON, no block). The `riskNote` on this
  checklist entry says so explicitly and points back to manual checking
  as the fallback if the in-app check starts failing in Preview/Production.
- **The keyword filter is a judgment call, not a structural fact** — same
  caveat as Wodociągi's. It is narrower than it could be (a few real
  transit-related posts like "Przywrócenie stałej trasy linii 5" were
  deliberately left unmatched to avoid over-matching generic "trasa"
  language) — an intentional under-inclusion, not a bug.
- **Category id `371` could be reassigned** if pruszkow.pl restructures
  its taxonomy — same repair procedure shape as Wodociągi's (Sprint 168
  docs §9): re-check `wp-json/wp/v2/categories` for the current
  aktualności-mieszkaniec category id.
- **Priority 1–3 categories (power, waste, roads/Michałowice) remain
  unaddressed** — see §1 for why each was rejected this sprint, and what
  would need to change for a future sprint to revisit them (a real PGE
  data feed, PDF-parsing infrastructure for waste, or a dedicated
  Michałowice roads source that doesn't yet exist).

## 7. Parser-repair procedure

Same shape as Sprint 168's (`docs/SPRINT_168_WODOCIAGI_MICHALOWICE_IMPLEMENTATION_V1.md`
§9), applied to Pruszków:

1. Check `https://www.pruszkow.pl/wp-json/wp/v2/posts?per_page=1` is still
   `HTTP 200` + JSON. If not, the REST API itself was disabled or blocked
   — this source would need to fall back to manual-only until re-verified
   from a deployed environment.
2. Check `https://www.pruszkow.pl/wp-json/wp/v2/categories` still has a
   category with slug `aktualnosci-mieszkaniec` — update
   `officialSourceChecklist.ts`'s `apiUrl` `categories=` param if the id
   changed.
3. Re-sample 15–20 live posts by hand and adjust
   `PRUSZKOW_NOTICE_KEYWORDS_RX` (`pageParser.ts`) if the site's own
   wording pattern shifted, or if the ratio of on-topic to off-topic posts
   has degraded enough that the filter needs tightening or loosening.

## 8. What this session did NOT do

No Environment Variable was changed. No Production SQL was run. No cron
was touched. No writer identity was touched. No email/Resend was touched.
No alert was auto-published. No request was made to any Production write
endpoint or manual source-check endpoint. No merge to `main` was
performed.

## 9. Branch

`sprint-169-source-expansion-v1`, branched from `main` at `edb45d0`
(post-168H hotfix). Not merged to `main`.
