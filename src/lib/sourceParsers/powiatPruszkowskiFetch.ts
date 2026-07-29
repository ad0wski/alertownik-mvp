// Sprint 183A — bounded, fail-closed orchestration for Powiat Pruszkowski's
// two-stage check: the listing page never carries enough text for genuine
// road/traffic items (Sprint 170 finding — see powiatPruszkowskiParser.ts's
// header), so a SMALL, capped number of article pages are fetched to fill
// in the missing body — only for items that already pass the cheap topic
// pre-filter on the listing text alone, never for every item on the page.
//
// This is the one new fetch-capable module this source needs; both the
// cron dry-run (cronCheckSources.ts) and the manual admin check
// (manualSourceCheckFetch.ts) call buildPowiatWiadomosciParse with their
// own already-fetched listing HTML, so the multi-fetch/cap/timeout logic
// itself exists in exactly one place.

import { detectDateInText } from "@/lib/candidateWarnings";
import { MIN_PROPOSAL_TEXT_LENGTH } from "@/lib/sourceCheck";
import type { PageCandidate, PageParseResult } from "./pageParser";
import {
  extractPowiatWiadomosciListItems,
  extractPowiatArticleBodyText,
  isPowiatNoticeRelevant,
} from "./powiatPruszkowskiParser";

export const POWIAT_PRUSZKOWSKI_SOURCE_ID = "powiat-pruszkowski-wiadomosci";

// Hard caps — never grow without a deliberate review, matching Sprint 183A's
// GO decision ("ogranicz liczbę dodatkowych requestów"). At most one listing
// fetch plus this many article fetches happen per check, ever.
export const MAX_ARTICLE_BODY_FETCHES = 3;
export const ARTICLE_FETCH_TIMEOUT_MS = 8_000;
export const MAX_LISTING_ITEMS_CONSIDERED = 8;

export type ArticleBodyFetcher = (url: string) => Promise<string | null>;

/** Real network fetch for one article page, capped in size and time.
 *  Returns null on ANY failure (non-2xx, non-HTML, timeout, network error)
 *  — callers always treat null as "skip this item", never retry or guess. */
export async function defaultFetchArticleBody(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Alertownik-Monitor/1.0 (scheduled dry-run check)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;
    const raw = await response.text();
    return raw.slice(0, 500_000);
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Sprint 184A — the length-only trigger below (`length >= MIN_PROPOSAL_
 * TEXT_LENGTH`) had a real gap, found via a live re-check on Day 16: both
 * genuine road notices sampled that day had bare titles that happened to
 * be ≥60 chars on their own (this listing carries no structural date
 * field at all, on the item or the article page — see
 * powiatPruszkowskiParser.ts's header), so the article-body fetch built
 * specifically to enrich bare-title items never fired for either, and the
 * resulting candidate would have carried title-only text with no date
 * signal at all — exactly the shape auto-publish's own "complete required
 * fields" condition must reject.
 *
 * Hydration is now needed whenever the listing text is too short OR no
 * event date can be detected in it — a long title that still doesn't say
 * *when* something happens is not more useful to a reviewer than a short
 * one. Kept as its own named predicate (rather than inlined) since Part 2
 * of Sprint 184A's brief also names three more triggers (locality,
 * category, "co zrobić" completeness) meant to extend this same predicate
 * once this source's parser tracks those signals structurally — today it
 * doesn't, so only the two currently detectable triggers are wired in.
 */
export function needsArticleHydration(listText: string): boolean {
  return listText.length < MIN_PROPOSAL_TEXT_LENGTH || !detectDateInText(listText);
}

/**
 * Takes the already-fetched Wiadomości listing HTML and produces the same
 * PageParseResult shape every other source's parser produces, so the
 * result flows through the exact same buildCheckProposals() safety
 * filtering (min length, boilerplate, count cap, title dedup) as every
 * other source — no parallel pipeline, no separate cap logic downstream.
 *
 * Per item, in order:
 *  1. Cheap topic pre-filter on listing text alone (title + intro, if any)
 *     — NO article fetch happens for anything that fails this check. This
 *     is what keeps PR/event/weather content out without ever touching the
 *     network for it.
 *  2. If the listing text alone is long enough AND already contains a
 *     detectable event date, use it as-is — no extra request needed.
 *  3. Otherwise attempt exactly one article-body fetch, bounded by
 *     MAX_ARTICLE_BODY_FETCHES total per run. A fetch failure, a missing
 *     body container, a still-too-short combined result, or — new this
 *     sprint — a combined result that STILL has no detectable date after
 *     fetching, always drops the item. This function never proposes a
 *     candidate backed by only a generic title, and never proposes one
 *     with no date signal at all (Part 2/6: no date, no auto-publish
 *     eligibility, ever — enforced here by not proposing the candidate in
 *     the first place, one step earlier than the auto-publish gate would
 *     have caught it anyway).
 */
export async function buildPowiatWiadomosciParse(
  listingHtml: string,
  baseUrl: string,
  fetchArticleBody: ArticleBodyFetcher = defaultFetchArticleBody
): Promise<PageParseResult> {
  const items = extractPowiatWiadomosciListItems(listingHtml, baseUrl).slice(
    0,
    MAX_LISTING_ITEMS_CONSIDERED
  );

  const candidates: PageCandidate[] = [];
  let bodyFetchesUsed = 0;

  for (const item of items) {
    const listText = [item.title, item.intro].filter(Boolean).join("\n").trim();
    if (!isPowiatNoticeRelevant(listText)) continue;

    if (!needsArticleHydration(listText)) {
      candidates.push({
        heading: item.title.slice(0, 120),
        text: listText,
        hasDate: true,
        url: item.url,
      });
      continue;
    }

    if (bodyFetchesUsed >= MAX_ARTICLE_BODY_FETCHES) continue;
    bodyFetchesUsed++;

    const bodyHtml = await fetchArticleBody(item.url);
    if (!bodyHtml) continue;

    const bodyText = extractPowiatArticleBodyText(bodyHtml);
    if (!bodyText) continue;

    const combined = [item.title, bodyText].filter(Boolean).join("\n").trim();
    if (combined.length < MIN_PROPOSAL_TEXT_LENGTH) continue;
    if (!detectDateInText(combined)) continue;

    candidates.push({
      heading: item.title.slice(0, 120),
      text: combined,
      hasDate: true,
      url: item.url,
    });
  }

  return {
    title: "Powiat Pruszkowski — Wiadomości",
    candidates,
    rawText: candidates
      .map((c) => (c.heading ? c.heading + "\n" : "") + c.text)
      .join("\n\n")
      .slice(0, 5000),
  };
}
