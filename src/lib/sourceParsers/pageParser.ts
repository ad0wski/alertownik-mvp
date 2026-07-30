// Pure HTML-parsing logic for the "official web page" source strategy —
// no fetch, no Next.js types, so it's directly unit-testable. Extracted
// from api/sources/fetch-preview/route.ts (Sprint 74/75) so the route can
// stay a thin HTTP/error-handling wrapper around this.

import { detectDateInText } from "@/lib/candidateWarnings";

export interface PageCandidate {
  heading?: string;
  text: string;
  hasDate: boolean;
  /** Direct public permalink to the source article, when the parser has
   *  one available (currently: WordPress REST passes — see
   *  extractWordpressRestCandidates below). Absent for HTML-scraped
   *  sources, which have no reliable per-item link in their markup. */
  url?: string;
}

export interface PageParseResult {
  title: string;
  candidates: PageCandidate[];
  rawText: string;
  /** Detected via <link rel="alternate" type="application/rss|atom+xml">
   *  in the page's own <head> — lightweight discovery only, the feed
   *  itself is never fetched or parsed. */
  feedUrl?: string;
}

// ── HTML parsing helpers ──────────────────────────────────────────────────────

// Sprint 183A — samorzad.gov.pl's WYSIWYG editor output (verified live in
// Powiat Pruszkowski article bodies) uses named HTML4 acute-accent entities
// (e.g. "rob&oacute;t" for "robót") rather than the numeric/UTF-8 forms every
// other source in this codebase has used so far. Previously these fell
// through to the catch-all "unknown named entity → space" rule below,
// silently breaking words ("rob t"). Added narrowly — the specific family
// actually observed, not a general HTML entity table — to keep this
// function's behavior easy to reason about.
const NAMED_ENTITIES: Record<string, string> = {
  aacute: "á", Aacute: "Á",
  eacute: "é", Eacute: "É",
  iacute: "í", Iacute: "Í",
  oacute: "ó", Oacute: "Ó",
  uacute: "ú", Uacute: "Ú",
  yacute: "ý", Yacute: "Ý",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, "...")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => NAMED_ENTITIES[name] ?? " ");
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface Block {
  type: "heading" | "para";
  level?: number;
  text: string;
}

function extractBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const tagRx = /<(h[1-3]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;

  while ((m = tagRx.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const text = stripTags(m[2]).replace(/\s+/g, " ").trim();
    if (!text || text.length < 5) continue;

    if (tag.startsWith("h")) {
      blocks.push({ type: "heading", level: parseInt(tag[1], 10), text });
    } else if (text.length > 40) {
      blocks.push({ type: "para", text });
    }
  }

  return blocks;
}

function buildCandidates(blocks: Block[]): PageCandidate[] {
  const candidates: PageCandidate[] = [];
  let i = 0;

  while (i < blocks.length && candidates.length < 8) {
    const b = blocks[i];

    if (b.type === "heading") {
      const paras: string[] = [];
      let j = i + 1;
      while (j < blocks.length && blocks[j].type === "para" && paras.length < 3) {
        paras.push(blocks[j].text.slice(0, 600));
        j++;
      }
      if (paras.length > 0) {
        const text = paras.join("\n\n");
        candidates.push({
          heading: b.text.slice(0, 120),
          text,
          hasDate: detectDateInText(b.text) || detectDateInText(text),
        });
        i = j;
        continue;
      }
      i++;
    } else {
      if (b.text.length > 80) {
        const text = b.text.slice(0, 800);
        candidates.push({ text, hasDate: detectDateInText(text) });
      }
      i++;
    }
  }

  return candidates;
}

// ── CMS news-list extraction (Sprint 138) ────────────────────────────────────

// Municipal CMS listing pages (michalowice.pl among them) render each notice
// as a <div class="news-item"> block with NO <h1-3>/<p> tags anywhere on the
// page, so the generic heading/paragraph extractor above sees an empty page —
// verified against the live Michałowice komunikaty markup in Sprint 138. Each
// block carries the notice date in <div class="date">, the title as a link
// inside <div class="h3 …">, and a teaser in <div class="description-body">.
// This targeted pass reads those fields directly; "czytaj więcej" link chrome
// sits outside description-body and is never captured.

const MAX_NEWS_ITEMS = 8;

function extractNewsListItems(html: string): PageCandidate[] {
  // Each split segment starts inside one news-item and runs until the next
  // one opens, so the FIRST date/title/body match in a segment belongs to
  // that item — no need to balance nested <div>s with regex.
  const segments = html.split(/<div[^>]*class="[^"]*\bnews-item\b[^"]*"[^>]*>/i);
  const items: PageCandidate[] = [];

  for (const seg of segments.slice(1)) {
    if (items.length >= MAX_NEWS_ITEMS) break;

    const dateMatch = seg.match(/<div[^>]*class="[^"]*\bdate\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const titleMatch = seg.match(
      /<div[^>]*class="[^"]*\b(?:h3|title)[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
    );
    const bodyMatch = seg.match(
      /<div[^>]*class="[^"]*\bdescription-body\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );

    const heading = titleMatch
      ? stripTags(titleMatch[1]).replace(/\s+/g, " ").trim().slice(0, 120) || undefined
      : undefined;
    const date = dateMatch ? stripTags(dateMatch[1]).replace(/\s+/g, " ").trim() : "";
    const body = bodyMatch ? stripTags(bodyMatch[1]).replace(/\s+/g, " ").trim().slice(0, 600) : "";

    const text = [date, body].filter(Boolean).join("\n");
    // Empty shells (image-only teasers, malformed blocks) carry nothing an
    // admin could review — skip instead of proposing noise.
    if (!heading && text.length < 40) continue;

    items.push({
      heading,
      text,
      hasDate: detectDateInText(`${heading ?? ""} ${text}`),
    });
  }

  return items;
}

// ── Joomla blog-listing extraction (Sprint 139) ──────────────────────────────

// wkd.com.pl/aktualnosci (Joomla) renders each notice as a div carrying
// itemprop="blogPost", with the publish date in <p class="published"><time>,
// the title as a link inside <div class="item-header"><h2> and the teaser in
// <div class="item-introtext"> — a <div>, not a <p>, and with no <main> or
// <article> wrapper, so the generic heading/paragraph extractor pairs the
// <h2>s with nothing and drops them. Verified against the live WKD
// aktualności markup in Sprint 139. Same segment strategy as
// extractNewsListItems: the first date/title/teaser match after each
// blogPost open tag belongs to that item.

function extractBlogPostItems(html: string): PageCandidate[] {
  const segments = html.split(/<div[^>]*itemprop="blogPost"[^>]*>/i);
  const items: PageCandidate[] = [];

  for (const seg of segments.slice(1)) {
    if (items.length >= MAX_NEWS_ITEMS) break;

    const dateMatch = seg.match(/<time[^>]*>([\s\S]*?)<\/time>/i);
    const titleMatch = seg.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const bodyMatch = seg.match(
      /<div[^>]*class="[^"]*\bitem-introtext\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );

    const heading = titleMatch
      ? stripTags(titleMatch[1]).replace(/\s+/g, " ").trim().slice(0, 120) || undefined
      : undefined;
    const date = dateMatch ? stripTags(dateMatch[1]).replace(/\s+/g, " ").trim() : "";
    const body = bodyMatch ? stripTags(bodyMatch[1]).replace(/\s+/g, " ").trim().slice(0, 600) : "";

    const text = [date, body].filter(Boolean).join("\n");
    // Image-only teasers and malformed blocks carry nothing an admin could
    // review — skip instead of proposing noise (same rule as news-item pass).
    if (!heading && text.length < 40) continue;

    items.push({
      heading,
      text,
      hasDate: detectDateInText(`${heading ?? ""} ${text}`),
    });
  }

  return items;
}

// ── WordPress REST API extraction (Sprint 168) ───────────────────────────────

// wodociagimichalowice.pl (and potentially other municipal-adjacent sites
// on WordPress) exposes its own notices as structured JSON via the
// standard `/wp-json/wp/v2/posts` REST API — verified live in Sprint 168:
// 294 posts in category 1 ("Aktualności"), overwhelmingly genuine water-
// interruption notices ("Przerwa w dostawie wody") plus occasional
// office-hours/pricing announcements. Reading this JSON directly is
// preferred over scraping the rendered HTML archive page (more stable
// across theme/markup changes, official structured data, not a scrape)
// — see manualSourceCheckFetch.ts for the fetch branch that calls this.
//
// This pass owns its own domain-specific relevance filter (mirrors
// extractNewsListItems/extractBlogPostItems each owning their own
// domain-specific extraction) rather than pushing that decision onto the
// generic buildCheckProposals boilerplate filter, which knows nothing
// about "is this actually an operational notice" — only "is this too
// short / obviously chrome". A plain informational/PR post (e.g. an
// educational article about tap water) is deliberately excluded here:
// it would otherwise pollute the review queue with content this source
// isn't meant to surface, exactly the failure mode Sprint 168's own
// audit found unacceptable in a different candidate source
// (roboty-drogowe).

const OPERATIONAL_NOTICE_KEYWORDS_RX =
  /przerw[a-złńóśźż]*|awari[a-złńóśźż]*|brak wody|wyłącz[a-złńóśźż]*|nieczynn[a-złńóśźż]*|prac[a-złńóśźż]* (?:na )?sieci|remont[a-złńóśźż]* sieci|płuka[a-złńóśźż]* sieci|jakoś[cć] wody/i;

// Sprint 169 — pruszkow.pl's own "Aktualności dla Mieszkańców" WordPress
// category (id 371, verified live: 2843 posts) is a genuinely mixed general
// news feed — unlike Wodociągi's category, most posts are unrelated PR/
// cultural/event content (lost-pet appeals, exhibitions, workshops, a
// weekly "Co? Gdzie? Kiedy?" digest). This is exactly the failure mode
// Sprint 168's own investigation already rejected for `roboty-drogowe`
// (a general gmina news feed with zero on-topic posts in its sample).
// Pruszków's category is different in one respect that makes it viable:
// live sampling (20 posts) found a genuine, keyword-matchable subset of
// real operational notices (traffic/road changes, heat/hot-water
// interruptions, transit diversions, alarm-siren tests) that this regex
// targets specifically — narrower than Wodociągi's single-topic filter
// because Pruszków's checklist entry itself covers multiple topics
// (remonty, ciepło/woda, odpady, zamknięcia ulic — see its whatToCheck).
const PRUSZKOW_NOTICE_KEYWORDS_RX =
  /przerw[a-złńóśźż]*|utrudni[a-złńóśźż]*|remont[a-złńóśźż]*|objazd[a-złńóśźż]*|zamkni[ęe][a-złńóśźż]*|wyłącz[a-złńóśźż]*|awari[a-złńóśźż]*|zmian[ay] organizacj[a-złńóśźż]* ruchu|odbi[oó]r[a-złńóśźż]* odpad[a-złńóśźż]*|harmonogram[a-złńóśźż]* odpad[a-złńóśźż]*|ciepł[a-złńóśźż]* wod[a-złńóśźż]*|energi[a-złńóśźż]* ciepln[a-złńóśźż]*|syren[a-złńóśźż]* alarmow[a-złńóśźż]*/i;

// Etap F, Fala 5 (2026-07-30) — the water-biased OPERATIONAL_NOTICE_KEYWORDS_RX
// above misses most real transport/roads vocabulary (objazd, zawieszenie
// kursowania, zmiana rozkładu jazdy, naprawa nawierzchni) — confirmed live
// against this wave's own verified samples (MZK Grudziądz, ZDiZ Gdynia, MZK
// Koszalin, MPK Stargard). Rather than a per-site parser, this is one shared,
// broader relevance filter for the whole transport/roads topic — same
// pattern as PRUSZKOW_NOTICE_KEYWORDS_RX above, reused across all four of
// this wave's non-water sources.
const TRANSPORT_ROADS_NOTICE_KEYWORDS_RX =
  /przerw[a-złńóśźż]*|utrudni[a-złńóśźż]*|remont[a-złńóśźż]*|przebudow[a-złńóśźż]*|objazd[a-złńóśźż]*|zamkni[ęe][a-złńóśźż]*|wyłącz[a-złńóśźż]*|awari[a-złńóśźż]*|napraw[a-złńóśźż]*|zawieszeni[ea] kursowani[ea]|wznowieni[ea] kursowani[ea]|przywr[oó]ceni[ea]|zmian[ay] (?:w )?(?:rozkład[a-złńóśźż]*|tras[a-złńóśźż]*|organizacj[a-złńóśźż]* ruchu)|linia? sezonow[a-złńóśźż]*|kursowani[ea]/i;

export interface WordpressRestPost {
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  date?: string;
  link?: string;
  slug?: string;
}

/** True only for JSON that is genuinely "an array of WordPress REST API
 *  post objects" — anything else (a single object, an error payload, a
 *  plugin-shaped response) is rejected rather than guessed at, matching
 *  this codebase's existing "fail closed on unexpected shape" convention
 *  (see e.g. getRegistrySourceId in scheduledWriter.ts). */
export function isWordpressRestPostArray(json: unknown): json is WordpressRestPost[] {
  return Array.isArray(json);
}

/** A WordPress REST `link` field is trusted only when it's an absolute
 *  http(s) permalink — never the wp-json API endpoint itself (some sites'
 *  `link` values have been seen pointing back at their own REST resource
 *  rather than the public post) and never a relative/empty string a
 *  malformed or plugin-altered response could send. Anything that doesn't
 *  pass is treated as "no safe link" (undefined), matching this
 *  codebase's existing "fail closed on unexpected shape" convention (see
 *  isWordpressRestPostArray above) rather than risk saving a broken or
 *  misleading URL as candidate_url. */
function safePostPermalink(link: string | undefined): string | undefined {
  if (!link) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  if (parsed.pathname.startsWith("/wp-json/")) return undefined;
  return link;
}

/** Shared mechanics for every WordPress-REST extraction pass: strip tags,
 *  apply the pass's own relevance regex, detect dates. Each pass still owns
 *  its own keyword regex and result title — this only avoids duplicating
 *  the per-post extraction loop, not the relevance judgment itself. Robust
 *  to extra/unexpected fields (plugins routinely add their own top-level
 *  keys to WP REST responses) and to individual posts missing
 *  title/excerpt/content — those are skipped, never thrown on. */
function extractWordpressRestCandidates(
  posts: WordpressRestPost[],
  keywordsRx: RegExp
): PageCandidate[] {
  const candidates: PageCandidate[] = [];

  for (const post of posts) {
    const heading = stripTags(post.title?.rendered ?? "").trim();
    const bodySource = post.excerpt?.rendered || post.content?.rendered || "";
    const body = stripTags(bodySource).trim();

    const combined = `${heading} ${body}`.trim();
    if (!combined) continue;
    if (!keywordsRx.test(combined)) continue;

    candidates.push({
      heading: heading ? heading.slice(0, 120) : undefined,
      text: body || heading,
      hasDate: detectDateInText(combined),
      url: safePostPermalink(post.link),
    });
  }

  return candidates;
}

function candidatesToPageParseResult(title: string, candidates: PageCandidate[]): PageParseResult {
  return {
    title,
    candidates,
    rawText: candidates
      .map((c) => (c.heading ? c.heading + "\n" : "") + c.text)
      .join("\n\n")
      .slice(0, 5000),
  };
}

/** Turns already-fetched, already-JSON-parsed WordPress REST API post
 *  objects from wodociagimichalowice.pl into the same PageParseResult
 *  shape every other extraction pass produces, so it flows through the
 *  exact same buildCheckProposals() safety filtering (min length,
 *  boilerplate, count cap, title dedup) as HTML-sourced candidates — no
 *  parallel pipeline. */
export function parseWordpressRestPosts(posts: WordpressRestPost[]): PageParseResult {
  return candidatesToPageParseResult(
    "Wodociągi Michałowice — Aktualności",
    extractWordpressRestCandidates(posts, OPERATIONAL_NOTICE_KEYWORDS_RX)
  );
}

/** Same mechanics as parseWordpressRestPosts, for pruszkow.pl's own
 *  WordPress REST API — see PRUSZKOW_NOTICE_KEYWORDS_RX above for why this
 *  source needs its own, broader relevance filter. */
export function parsePruszkowRestPosts(posts: WordpressRestPost[]): PageParseResult {
  return candidatesToPageParseResult(
    "Miasto Pruszków — Aktualności dla Mieszkańców",
    extractWordpressRestCandidates(posts, PRUSZKOW_NOTICE_KEYWORDS_RX)
  );
}

/** Same mechanics as parseWordpressRestPosts, using
 *  TRANSPORT_ROADS_NOTICE_KEYWORDS_RX — shared by Etap F Fala 5's four
 *  transport/roads sources (see REST_PARSERS_BY_SOURCE_ID below). */
export function parseTransportRoadsRestPosts(posts: WordpressRestPost[]): PageParseResult {
  return candidatesToPageParseResult(
    "Transport / drogi — aktualności",
    extractWordpressRestCandidates(posts, TRANSPORT_ROADS_NOTICE_KEYWORDS_RX)
  );
}

// Sprint 173 — single source of truth for "which WordPress-REST relevance
// filter applies to which apiUrl-backed source", shared by both the manual
// check route (src/app/api/sources/check/route.ts) and the scheduled fetch
// layer (src/lib/scheduledSourceFetch.ts, src/lib/cronCheckSources.ts).
// Previously duplicated only in the manual route (Sprint 169); the
// scheduled path had no equivalent at all, which meant a hypothetical
// scheduled run would try to parse Wodociągi/Pruszków's officialUrl as
// plain HTML instead of using their REST APIs — exactly the thing those
// sources were built not to need. Centralizing here means a future new
// REST-backed source only needs one map updated, not two kept in sync by
// hand. Sources without an apiUrl never look this up.
export const REST_PARSERS_BY_SOURCE_ID: Record<string, (posts: WordpressRestPost[]) => PageParseResult> = {
  "wodociagi-michalowice": parseWordpressRestPosts,
  "pruszkow-aktualnosci": parsePruszkowRestPosts,
  "mzk-grudziadz": parseTransportRoadsRestPosts,
  "zdiz-gdynia": parseTransportRoadsRestPosts,
  "mzk-koszalin": parseTransportRoadsRestPosts,
  "mpk-stargard": parseTransportRoadsRestPosts,
};

// Lightweight RSS/Atom autodiscovery — only looks at the page's own <head>
// <link> tags already present in the HTML we already fetched. Never
// fetches or parses the feed itself.
function findFeedUrl(html: string, baseUrl: string): string | undefined {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch ? headMatch[1] : html.slice(0, 5000);

  const linkRx = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRx.exec(head)) !== null) {
    const tag = m[0];
    const isFeed = /type=["'](application\/rss\+xml|application\/atom\+xml)["']/i.test(tag);
    if (!isFeed) continue;
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    try {
      return new URL(hrefMatch[1], baseUrl).toString();
    } catch {
      continue;
    }
  }
  return undefined;
}

// HTTP status → admin-facing failure reason for a page fetch attempt. Pure
// function (no fetch call) so it's unit-testable without hitting a live
// site. 401/403 get their own message because Sprint 73 and Sprint 77 both
// independently confirmed pruszkow.pl returns 403 to an automated fetch
// while the page itself is genuinely live — the generic "check your URL"
// message would send an admin chasing a non-existent broken link instead of
// recognizing bot protection.
export function describePageFetchFailure(status: number): string {
  if (status === 401 || status === 403) {
    return `Strona zablokowała automatyczne pobieranie (HTTP ${status}) — to częste zabezpieczenie przed botami na stronach instytucji, niekoniecznie zepsuty link. Otwórz stronę ręcznie w przeglądarce i sprawdź treść tam.`;
  }
  if (status === 404) {
    return "Strona nie została znaleziona (HTTP 404). Sprawdź, czy adres URL jest aktualny — instytucje czasem zmieniają adresy stron.";
  }
  if (status >= 500) {
    return `Serwer źródła zwrócił błąd (HTTP ${status}) — to problem po stronie źródła, nie aplikacji. Spróbuj ponownie później.`;
  }
  return `Strona zwróciła błąd HTTP ${status}. Sprawdź, czy adres URL jest poprawny — otwórz go ręcznie w przeglądarce, żeby się przekonać.`;
}

export function parsePageHtml(html: string, baseUrl: string): PageParseResult {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]).trim().slice(0, 120) : "";
  const feedUrl = findFeedUrl(html, baseUrl);

  // Remove boilerplate sections before extracting content
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");

  // Prefer <main> or <article> if present, otherwise use the full stripped body
  const mainMatch =
    stripped.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ??
    stripped.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ??
    stripped.match(/<div[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  const content = mainMatch ? mainMatch[1] : stripped;

  // CMS list markup hides notices from the block extractor entirely
  // (div-only, see extractNewsListItems / extractBlogPostItems) — prefer a
  // targeted pass when it finds items, and search the whole stripped page
  // rather than `content`: the class="content" fallback match above can
  // truncate at the first nested </div> and lose items.
  const newsItems = extractNewsListItems(stripped);
  const listItems = newsItems.length > 0 ? newsItems : extractBlogPostItems(stripped);
  const blocks = extractBlocks(content);
  const candidates = listItems.length > 0 ? listItems : buildCandidates(blocks);

  const rawText = (
    listItems.length > 0
      ? listItems.map((c) => (c.heading ? c.heading + "\n" : "") + c.text).join("\n\n")
      : blocks
          .filter((b) => b.text.length > 30)
          .map((b) => (b.type === "heading" ? "\n" + b.text + "\n" : b.text))
          .join("\n")
  )
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 5000)
    .trim();

  return { title, candidates, rawText, feedUrl };
}
