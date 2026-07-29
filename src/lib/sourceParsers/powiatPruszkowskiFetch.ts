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
 *  2. If the listing text alone already clears MIN_PROPOSAL_TEXT_LENGTH,
 *     use it as-is — no extra request needed.
 *  3. Otherwise (the real, observed shape for genuine road notices here:
 *     bare title, no intro) attempt exactly one article-body fetch, bounded
 *     by MAX_ARTICLE_BODY_FETCHES total per run. A fetch failure, a missing
 *     body container, or a still-too-short combined result after fetching
 *     always drops the item — this function never proposes a candidate
 *     backed by only a generic title.
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

    if (listText.length >= MIN_PROPOSAL_TEXT_LENGTH) {
      candidates.push({
        heading: item.title.slice(0, 120),
        text: listText,
        hasDate: detectDateInText(listText),
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

    candidates.push({
      heading: item.title.slice(0, 120),
      text: combined,
      hasDate: detectDateInText(combined),
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
