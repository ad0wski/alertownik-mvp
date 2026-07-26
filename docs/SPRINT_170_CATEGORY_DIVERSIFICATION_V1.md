# Sprint 170 — category diversification audit (final attempt, no code change)

**Status: audit complete, no fifth source added. Source-expansion phase
formally closed with 4 active sources.**

Per this sprint's own explicit brief: "wykonać ostatnią ukierunkowaną próbę
dodania jednego źródła z nowej kategorii, a następnie zakończyć etap
rozszerzania źródeł niezależnie od wyniku." This document records that
attempt across all three assigned priorities and the reasoning for closing
the phase without a fifth source.

---

## 1. Priority 1 — odpady (waste), Gmina Michałowice

The existing `michalowice-odpady` checklist entry's constraint (scanned
PDF, no structured data) was not re-litigated — instead this sprint looked
for a genuinely new angle: the gmina's own waste page links to
**EcoHarmonogram**, a third-party waste-schedule app
(`pl.codever.ecoharmonogram` on Google Play). Investigated live:

- The gmina's `/mobilny-ecoharmonogram` sub-page only links to the Google
  Play Store listing — no web view, no public API, no per-gmina web
  endpoint discoverable from the official site.
- EcoHarmonogram is a closed mobile app; reverse-engineering its private
  backend (even if technically possible) would not be a publicly
  documented official endpoint, and is out of scope for this project's
  "official source only" standard.

**Conclusion: still not viable.** No new official RSS/API found — the
only real change here is *identifying why* no better option exists
(closed mobile app, not a web-accessible gap), which closes this
investigation thread rather than leaving it open.

## 2. Priority 2 — drogi (roads): a genuinely new official entity found

Unlike prior sprints, this sprint first identified the correct official
road authority rather than assuming one. Web search confirmed: **Starostwo
Powiatowe w Pruszkowie** (Powiat Pruszkowski), publishing through the
national **gov.pl** self-government portal at
`https://samorzad.gov.pl/web/powiat-pruszkowski` — genuinely official (a
government-run platform, not a commercial site). This is a different
entity from anything previously investigated (Sprint 168 only looked at
gmina Michałowice's own general news feed under `roboty-drogowe`).

An initial wrong-domain detour is recorded for transparency:
`powiat.pruszkow.pl` returns a TLS SNI error (misconfigured/parked),
`www.pruszkowski.pl` resolves to an unrelated personal homepage, and
`powiatpruszkowski.pl` is a commercial local-business directory — **none
of these are official** and were correctly rejected before landing on the
real `samorzad.gov.pl` domain via a web search.

### Technical findings

- `samorzad.gov.pl/web/powiat-pruszkowski/aktualnosci` (redirects to
  `/wiadomosci`) is a genuine, dedicated news listing — HTTP 200, no
  Cloudflare/bot-management signals, fetchable via plain server-side
  `fetch()` (verified: the full article list is present in the initial
  HTML response, not injected via a separate XHR/API call — confirmed via
  live browser network-request inspection, zero API/XHR calls observed).
- No RSS (`/rss.xml` redirects to the homepage, not a real feed) and no
  discoverable JSON REST API — this portal (Liferay-based "gov.pl"
  platform) requires HTML parsing, not REST/RSS.
- The listing markup is simple and deterministic:
  `<li><a href="/web/powiat-pruszkowski/SLUG"><picture>…</picture><div><div class="title">TITLE</div><div class="intro">DESCRIPTION</div></div></a></li>`
- Real, genuinely on-topic items were found live in the current 10-item
  listing: "Utrudnienia w ruchu - rozbudowa ul. Piłsudskiego w Piastowie",
  "Ostrzezenie hydrologiczne Wojewodztwo mazowieckie", "Uwaga kierowcy!
  Czasowe zamknięcia dróg powiatowych - Miasto Pruszków" — mixed with
  general PR/event content (an anniversary commemoration, a recreational
  program, an AI chatbot procurement announcement, a sports event, a
  strategy-document publication notice, an EU mobility-week campaign, a
  child health program).

### Why this candidate was NOT implemented despite being technically parseable

The three genuinely on-topic items above are published **without** a
`class="intro"` description — only a bare title (60, 49, and 69
characters respectively). By contrast, the six PR/event items all have
generous `intro` paragraphs (149–1225 characters). This is a real,
observed pattern on this specific portal — urgent/operational bulletins
here are published tersely; only promotional content gets a lead
paragraph.

This directly collides with this codebase's shared, deliberately generic
safety filter, `MIN_PROPOSAL_TEXT_LENGTH = 60`
(`sourceCheck.ts::buildCheckProposals`), which every source (this
sprint's candidate included) flows through unmodified. With only the bare
title available as `text` when there's no `intro`:

- "Ostrzezenie hydrologiczne Wojewodztwo mazowieckie" (49 chars) would be
  **silently dropped** — a genuine hydrological warning, exactly the kind
  of notice this project exists to surface.
- The other two barely clear the threshold (60 and 69 chars) — passing
  only by title-length coincidence, not because they're more relevant
  than the one that gets dropped.

Implementing this source as-is would mean roughly a third to a half of
its most valuable real signal disappears silently, with no error, no
visible failure — the admin would simply never see it, and would have no
way to know the source under-reports.  This fails the sprint's own
implicit quality bar (a real alert must reliably reach a reviewer) even
though every individual box on the technical checklist (official source,
real content exists, deterministic markup, correct links/dates-where-
present, correct Polish encoding) is otherwise checked.

**The honest fix would need one of:**
1. Fetching each matched article's own body text (a second, per-candidate
   HTTP request) to get real content length instead of relying on the
   list-page title alone — a genuine architecture change (every other
   source in this codebase does one fetch per check; this would
   introduce N+1 fetches), or
2. A source-specific override of the shared length threshold — a
   deliberate policy decision that changes a safety invariant shared by
   every other source, not something to slip in as a side effect of
   adding one source.

Both are legitimate future options but are explicitly **out of scope**
for "implement at most one source this sprint" — per this sprint's own
instruction not to force a source in, this candidate is documented as a
strong lead and left for a dedicated future sprint that explicitly
budgets for one of the two fixes above.

## 3. Priority 3 — prąd (power outages): re-confirmed still blocked, no new endpoint

Per this sprint's explicit constraint ("Możesz ponownie rozważyć odrzucone
źródło wyłącznie wtedy, gdy znajdziesz nowy oficjalny endpoint..."), PGE
Dystrybucja was not re-litigated in depth — only checked for a genuinely
different endpoint that might bypass the previously-found WAF block:
`mapa.pgedystrybucja.pl`, `gpw.pgedystrybucja.pl`, and a guessed
`/api/wylaczenia` path all failed to resolve/respond. **No new endpoint
found — still not viable, exactly as before.**

## 4. Decision — source-expansion phase closed

Per this sprint's explicit instruction (§17–18 of the brief), since no
candidate cleared the full quality bar:

- **No fifth source was added.** All existing four (`michalowice-komunikaty`,
  `wkd-aktualnosci`, `wodociagi-michalowice`, `pruszkow-aktualnosci`)
  remain unchanged.
- **No code was changed this sprint.** This document is the sole change.
- **The source-expansion phase (Sprints 168–170) is formally closed with
  4 active, safe, tested manual-check sources.**

## 5. Leads for a future return

Ranked by how close each came to clearing the bar:

1. **Powiat Pruszkowski / gov.pl roads listing** (§2) — closest candidate
   by far. Needs either a per-article body fetch or an explicit,
   deliberately-reviewed length-threshold policy decision. Real endpoint,
   real content, deterministic markup already identified — this is
   implementation work, not further investigation.
2. **PGE Dystrybucja** (§3) — would need PGE to expose a genuine public
   data feed (contacting them directly is outside a coding sprint's
   scope) or a different, non-blocked access path to be found.
3. **Gmina Michałowice waste schedule** (§1) — would need the gmina to
   publish structured data (not just a PDF + closed mobile app) — outside
   this project's control; revisit only if the gmina's own systems change.

## 6. What this session did NOT do

No Environment Variable was changed. No Production SQL was run. No cron
was touched. No writer identity was touched. No email/Resend was touched.
No alert was auto-published. No manual source check was run against
Production. No merge to `main` was performed. No source code files were
modified — every existing test, typecheck, lint, and build result from
Sprint 169's already-verified state remains unchanged and still passes.

## 7. Branch

`sprint-170-category-diversification-v1`, branched from `main` at
`67fb338`. Not merged to `main`.
