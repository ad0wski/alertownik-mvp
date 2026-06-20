// Pure HTML-parsing logic for the "official web page" source strategy —
// no fetch, no Next.js types, so it's directly unit-testable. Extracted
// from api/sources/fetch-preview/route.ts (Sprint 74/75) so the route can
// stay a thin HTTP/error-handling wrapper around this.

import { detectDateInText } from "@/lib/candidateWarnings";

export interface PageCandidate {
  heading?: string;
  text: string;
  hasDate: boolean;
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
    .replace(/&[a-zA-Z]+;/g, " ");
}

function stripTags(html: string): string {
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
  const blocks = extractBlocks(content);
  const candidates = buildCandidates(blocks);

  const rawText = blocks
    .filter((b) => b.text.length > 30)
    .map((b) => (b.type === "heading" ? "\n" + b.text + "\n" : b.text))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 5000)
    .trim();

  return { title, candidates, rawText, feedUrl };
}
