# Sprint 168 — Source Coverage Investigation (audit only, no code change)

**Status: investigation complete, no source added.** After Sprint 167's
reliability hardening, this session investigated whether any of the
remaining 7 checklisted-but-manual-only official sources could safely
join the 2 (Michałowice komunikaty, WKD) that already have a working
in-app check today. **None qualified this session** — each remaining
source needs its own dedicated verification work, exactly as Sprint
138/139's own header comment already predicted ("each entry needs a
parse check + risk review first"). This is an honest "not yet," not a
stall: forcing a low-quality addition would work against the sprint's
own stated goal (reliable detection, convenient review — not noisy or
empty results).

---

## 1. Priority selection

Read `docs/NEXT_MILESTONES.md` (Gate 2 "Local Beta" — 3–5 data
categories, no stale data — is the current focus) and Adam's own stated
priority for this block: **reliable monitoring of real pilot sources**.
Today's two working sources (Michałowice + WKD) already do this well
(Sprint 167 just made them more resilient to transient failures). The
next highest-leverage step toward Gate 2's "3–5 data categories" is
**more sources**, not more polish on the two that already work — hence
this investigation.

## 2. Read-only audit of current state

- `main` / Production: unchanged since Sprint 167's closeout (`5e523be`,
  confirmed via git and this session's own earlier read).
- `SAFE_CHECK_SOURCE_IDS` (`src/lib/sourceCheck.ts`): still exactly
  `["michalowice-komunikaty", "wkd-aktualnosci"]`.
- `OFFICIAL_SOURCE_CHECKS` (`src/lib/officialSourceChecklist.ts`) lists
  9 sources total; 7 remain manual-checklist-only.

## 3. Candidates investigated (live HTTP fetch, read-only, no code path touched)

| Source | URL | Result |
|---|---|---|
| `michalowice-wylaczenia-pradu` | `.../dla-mieszkancow-i-inwestorow/wylaczenia-pradu` | HTTP 200, HTML — but **zero** notice-list markup of any kind (no `news-item`, no headings-with-paragraphs pattern). It's a static informational page that mostly redirects readers to PGE's own site, matching the checklist's own `whatToCheck` note. **Not viable as-is.** |
| `roboty-drogowe` | `.../dzieje-sie/aktualnosci` (general gmina news) | HTTP 200, **uses the exact same `news-item` CMS markup as the working `komunikaty` page** — parses cleanly, 6 well-formed proposals with real titles/dates. **But the actual content is unrelated to roads**: a "Mikroretencja" grant program, a tourism rally, nursery-school recruitment (twice), two children's summer-holiday events. This page is the gmina's *general* news feed, not a roads-specific one — the checklist's own risk note ("rozproszone źródło") is confirmed accurate. Adding it as a "roads" source today would mislabel its content and flood the review queue with off-topic proposals most of the time. **Not viable without a smarter category filter this sprint didn't have time to design.** |
| `wodociagi-michalowice` | `https://wodociagimichalowice.pl/` (homepage) | HTTP 200, but the generic block extractor (no CMS-specific pattern recognized) found **zero** proposals on the homepage itself. However, the homepage's own links reveal this site **is WordPress**, with genuine, exactly-on-topic posts already published there (`/2026/07/21/przerwa-w-dostawie-wody-196/` etc. — literally "water supply interruption" posts) and a dedicated archive at `/category/aktualnosci/`. **This is the most promising lead for a future sprint** — the content clearly exists and is exactly what this source is meant to surface; it just needs (a) checking the officialUrl against the actual `/category/aktualnosci/` listing instead of the bare homepage, and (b) a new targeted parser pass for WordPress's own post-listing markup (`pageParser.ts` currently only recognizes Michałowice's custom CMS pattern and WKD's Joomla `blogPost` pattern — no WordPress pattern exists yet). |
| `pruszkow-aktualnosci` | `.../mieszkancy/aktualnosci-mieszkaniec/` | HTTP 200 from this session's fetch (previously documented as HTTP 403/bot-blocked in the checklist's own `riskNote`, dated Sprint 73/77). **Not re-verified as safe to adopt** — a single successful fetch from one network path is not the same as confirming the bot-block is genuinely gone; the checklist's own historical note may still be accurate for Vercel's actual outbound IPs, which this session's fetch did not originate from. Flagging the discrepancy for a future session to re-check specifically from the deployed environment, not concluding anything from this one data point. |

## 4. Proposed exact scope for the next real coverage-expansion sprint

Not started this session — proposed for a dedicated future sprint,
mirroring Sprint 138/139's own proven methodology (one source at a time,
fixture-tested, reviewed for risk before being added):

1. **`wodociagi-michalowice` (highest-confidence next candidate):**
   - Update `officialUrl` in `officialSourceChecklist.ts` to point at
     `https://wodociagimichalowice.pl/category/aktualnosci/` (the actual
     listing page) rather than the bare homepage.
   - Add a new targeted extraction pass to `pageParser.ts` for
     WordPress's standard post-listing markup (typically `<article>`
     elements with `entry-title`/`entry-content` or similar classes —
     needs live inspection of the actual `/category/aktualnosci/` HTML,
     not assumed).
   - Fixture-test the new pattern the same way `extractNewsListItems`/
     `extractBlogPostItems` already are.
   - Add to `SAFE_CHECK_SOURCE_IDS` only after the fixture test proves
     clean, on-topic extraction.
2. **`pruszkow-aktualnosci`:** re-verify the bot-block status specifically
   from a Vercel-deployed request (e.g. a one-off authenticated admin
   check against a Preview deployment), not from this local session's
   network path, before concluding anything has changed.
3. **`roboty-drogowe`:** deprioritized — would need a content-relevance
   filter (e.g. keyword matching for road/traffic terms) to be useful
   without flooding the queue; not a quick win, and arguably better
   solved later by an AI-assisted relevance pass than hand-written
   keyword rules.

## 5. What this session did NOT do

No code was changed. No source was added to `SAFE_CHECK_SOURCE_IDS`. No
Environment Variable, SQL, Cron, writer, email, or Production path was
touched. All fetches were plain, unauthenticated `curl` requests to
already-public official government/utility pages (the same requests any
browser makes visiting these sites) — no admin session, no API route,
no candidate or check-history row was ever created.

## 6. Branch

Created linearly from `main` (`5e523be`):
```
git checkout main && git pull --ff-only origin main
git checkout -b sprint-168-source-coverage-investigation-v1
```
This document is the only change on this branch. Not merged to `main` —
awaiting Adam's direction on whether to proceed with §4's proposed scope
in a future sprint, or prioritize something else.
