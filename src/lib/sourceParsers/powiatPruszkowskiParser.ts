// Pure HTML-parsing logic for Powiat Pruszkowski's "Wiadomości" listing on
// the gov.pl self-government portal (samorzad.gov.pl) — Sprint 183A.
//
// Sprint 170's audit found this source's markup deterministic (Liferay
// "gov.pl" template) but declined to implement it: the genuinely
// operational items (road closures/detours) are published on the listing
// as a bare title with NO `intro` teaser, while every PR/event item has a
// generous one — colliding with the shared MIN_PROPOSAL_TEXT_LENGTH=60
// safety filter used by every source. Rather than lower that shared
// threshold, this module supports fetching the article's own body
// (`<div class="editor-content">`) for exactly the short items that pass
// a cheap, source-specific topic pre-filter first — see
// powiatPruszkowskiFetch.ts for the bounded, fail-closed orchestration
// that calls these pure functions.
//
// No fetch here — this file only turns already-fetched HTML strings into
// structured data, exactly like pageParser.ts's other extraction passes.

import { stripTags } from "./pageParser";

export interface PowiatListItem {
  title: string;
  /** Absent when the listing published no teaser for this item — this is
   *  the real, observed shape for genuine operational notices here, not a
   *  parsing failure. */
  intro?: string;
  /** Absolute, same-origin permalink to the article page. */
  url: string;
}

// Sprint 183A — this source covers the whole Powiat Pruszkowski (which
// includes towns outside Alertownik's own pilot area, e.g. Piastów), and
// its "Wiadomości" feed mixes genuine road/traffic disruptions with PR,
// event, and even weather-warning content (the last explicitly Out of
// Scope per docs/NEXT_MILESTONES.md — "National news, weather... content").
// This regex is deliberately narrow: it targets only wording that indicates
// an actual road/traffic disruption, closure, detour, or works notice —
// verified against a live sample (Sprint 170 + Sprint 183A re-check) to
// include the genuine road items and exclude PR/event/strategy/weather
// content that shares no vocabulary with these terms.
export const POWIAT_PRUSZKOWSKI_NOTICE_KEYWORDS_RX =
  /utrudni[a-złńóśźż]*|zamkni[ęe][a-złńóśźż]*|objazd[a-złńóśźż]*|remont[a-złńóśźż]*\s+(?:na\s+)?drog[a-złńóśźż]*|rozbudow[a-złńóśźż]*\s+drog[a-złńóśźż]*|organizacj[a-złńóśźż]*\s+ruch[a-złńóśźż]*|drog[a-złńóśźż]*\s+powiatow[a-złńóśźż]*|zamknięt[a-złńóśźż]*\s+uli[a-złńóśźż]*/i;

export function isPowiatNoticeRelevant(text: string): boolean {
  return POWIAT_PRUSZKOWSKI_NOTICE_KEYWORDS_RX.test(text);
}

/** A gov.pl article permalink is trusted only when it resolves to an
 *  absolute http(s) URL on the same host as the listing page itself —
 *  fails closed (returns null) on a malformed/relative href or on any
 *  cross-origin surprise, matching this codebase's existing "fail closed
 *  on unexpected shape" convention (see pageParser.ts's safePostPermalink). */
function safeResolveArticleUrl(href: string, baseUrl: string): string | null {
  let resolved: URL;
  let base: URL;
  try {
    base = new URL(baseUrl);
    resolved = new URL(href, base);
  } catch {
    return null;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
  if (resolved.hostname !== base.hostname) return null;
  return resolved.toString();
}

// Scopes extraction to the listing's own article-list container so nav
// menus and footer links (which share the same `/web/powiat-pruszkowski/`
// path prefix) are never mistaken for notice items. Falls back to the
// widest plausible boundary (`</article>`) if the pagination nav isn't
// found, so a template tweak degrades to "no items" rather than a crash.
function scopeToListing(html: string): string {
  const start = html.match(/<div[^>]*class="[^"]*\bart-prev\b[^"]*"[^>]*>/i);
  if (!start || start.index === undefined) return "";
  const rest = html.slice(start.index + start[0].length);
  const end = rest.match(/<nav[^>]*class="[^"]*\bpagination\b[^"]*"|<\/article>/i);
  return end && end.index !== undefined ? rest.slice(0, end.index) : rest;
}

const MAX_LISTING_ITEMS = 10;

/** Turns the already-fetched Wiadomości listing HTML into structured
 *  items. Never throws — a page that doesn't match the expected template
 *  (site redesign) yields an empty list rather than a parse exception, so
 *  a template change degrades to "nothing found this run", never a crash
 *  that would take down the whole scheduled check. */
export function extractPowiatWiadomosciListItems(html: string, baseUrl: string): PowiatListItem[] {
  const scoped = scopeToListing(html);
  if (!scoped) return [];

  const items: PowiatListItem[] = [];
  const liRx = /<li>\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/li>/gi;
  let m: RegExpExecArray | null;

  while ((m = liRx.exec(scoped)) !== null) {
    if (items.length >= MAX_LISTING_ITEMS) break;

    const href = m[1];
    const inner = m[2];

    const titleMatch = inner.match(/<div class="title">([\s\S]*?)<\/div>/i);
    if (!titleMatch) continue;
    const title = stripTags(titleMatch[1]).replace(/\s+/g, " ").trim();
    if (!title) continue;

    const url = safeResolveArticleUrl(href, baseUrl);
    if (!url) continue;

    const introMatch = inner.match(/<div class="intro">([\s\S]*?)<\/div>/i);
    const intro = introMatch ? stripTags(introMatch[1]).replace(/\s+/g, " ").trim() : undefined;

    items.push({ title, intro: intro || undefined, url });
  }

  return items;
}

/** Turns an already-fetched article page into its plain-text body (the
 *  `<div class="editor-content">` block only — no navigation, breadcrumbs,
 *  footer, or gallery chrome). Returns null when the expected container
 *  isn't found or is empty, so callers fail closed rather than saving a
 *  candidate backed by page chrome. */
export function extractPowiatArticleBodyText(html: string): string | null {
  const m = html.match(
    /<div class="editor-content">([\s\S]*?)<\/div>\s*(?:<h3|<div class="gallery"|<\/article>)/i
  );
  if (!m) return null;
  const text = stripTags(m[1]).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}
