// Parser strategy abstraction (Sprint 76) — maps a source's existing
// `source_type` column (website | pdf | rss | other, Sprint 42 schema,
// unchanged) onto which extraction strategy applies. This intentionally
// reuses the existing 4-value enum rather than adding a 5th DB value or a
// new column: "official_web_page" = website, "rss_or_feed" = rss,
// "pdf_document" = pdf, "manual_source" = other, and "unknown" is a
// defensive fallback for a missing/unrecognized value, not a stored state.
// See Research.md's Sprint 76 update for the full mapping writeup.

import type { AlertSourceType } from "@/types/alertSource";

export type ParserStrategy = "page" | "feed" | "pdf_manual" | "unknown";

export const PARSER_STRATEGY_LABELS: Record<ParserStrategy, string> = {
  page: "Parser: strona",
  feed: "Parser: RSS (wykrywanie)",
  pdf_manual: "Parser: PDF/manualny",
  unknown: "Parser: nieznany",
};

export function detectParserStrategy(sourceType?: AlertSourceType | string | null): ParserStrategy {
  switch (sourceType) {
    case "website":
      return "page";
    case "rss":
      return "feed";
    case "pdf":
      return "pdf_manual";
    case "other":
      return "page"; // best-effort: still try a page fetch rather than refusing outright
    default:
      return "unknown";
  }
}

export {
  parsePageHtml,
  describePageFetchFailure,
  type PageCandidate,
  type PageParseResult,
} from "./pageParser";
export { getFeedParserPlaceholder, type FeedParseResult } from "./feedParser";
export { getPdfManualInstructions, type PdfManualResult } from "./pdfParser";
