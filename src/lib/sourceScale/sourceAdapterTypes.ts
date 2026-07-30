// Sprint 188A — National Source Scale Plan, foundation types only.
//
// Declarative description of "how to fetch and parse this source", so a
// batch of similar sources can share one adapter type instead of one
// bespoke module each. Field shapes are deliberately modeled on what
// already exists and works in this codebase (officialSourceChecklist.ts's
// apiUrl convention, manualSourceCheckFetch.ts's WordPress REST fetch,
// powiatPruszkowskiFetch.ts's bounded two-stage fetch) — this is a
// generalization of proven patterns, not a speculative new design.
//
// `html_custom` is the deliberate escape hatch for sources whose markup
// needs bespoke code (mirrors today's Michałowice/WKD/Powiat Pruszkowski
// parsers) — see docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md §3.2. Adding a new
// *type* here is still a code change; adding a new *instance* of an
// existing type is pure configuration.

export type SourceAdapterType =
  | "wordpress_rest"
  | "rss_atom"
  | "html_generic"
  | "html_custom"
  | "pdf"
  | "public_api";

export const SOURCE_ADAPTER_TYPES: readonly SourceAdapterType[] = [
  "wordpress_rest",
  "rss_atom",
  "html_generic",
  "html_custom",
  "pdf",
  "public_api",
] as const;

/** Whether this adapter type has a real, implemented fetch+parse path in
 *  this codebase today, or is a declared-but-not-yet-implemented target
 *  (see src/lib/sourceParsers/feedParser.ts and pdfParser.ts, both
 *  placeholders — docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md §2.4). Kept here,
 *  not inferred, so a batch-onboarding tool can refuse a batch that
 *  targets an unimplemented adapter type instead of silently producing
 *  sources that will never yield a candidate. */
export const IMPLEMENTED_ADAPTER_TYPES: readonly SourceAdapterType[] = [
  "wordpress_rest",
  "html_generic",
  "html_custom",
];

export function isAdapterTypeImplemented(type: SourceAdapterType): boolean {
  return IMPLEMENTED_ADAPTER_TYPES.includes(type);
}

interface BaseAdapterConfig {
  /** Human-facing link shown as "Otwórz źródło" — always present,
   *  independent of which URL is actually fetched (mirrors
   *  OfficialSourceCheck.officialUrl). */
  officialUrl: string;
}

export interface WordpressRestAdapterConfig extends BaseAdapterConfig {
  type: "wordpress_rest";
  /** e.g. "https://example.pl/wp-json/wp/v2/posts?categories=1&per_page=6" */
  apiUrl: string;
  /** Name of the shared relevance-keyword set this source's posts are
   *  filtered through (see REST_PARSERS_BY_SOURCE_ID in pageParser.ts for
   *  today's per-source equivalent). A batch of sources on the same CMS
   *  type can still need different keyword sets per topic. */
  keywordSetId: string;
}

export interface RssAtomAdapterConfig extends BaseAdapterConfig {
  type: "rss_atom";
  feedUrl: string;
}

export interface HtmlGenericAdapterConfig extends BaseAdapterConfig {
  type: "html_generic";
}

export interface HtmlCustomAdapterConfig extends BaseAdapterConfig {
  type: "html_custom";
  /** Identifies which bespoke parser module handles this source (e.g.
   *  "powiat-pruszkowski") — resolved by a registry the caller owns, not
   *  by this module, to avoid a runtime import cycle between generic
   *  types and specific parser implementations. */
  parserId: string;
}

export interface PdfAdapterConfig extends BaseAdapterConfig {
  type: "pdf";
}

export interface PublicApiAdapterConfig extends BaseAdapterConfig {
  type: "public_api";
  apiUrl: string;
}

export type SourceAdapterConfig =
  | WordpressRestAdapterConfig
  | RssAtomAdapterConfig
  | HtmlGenericAdapterConfig
  | HtmlCustomAdapterConfig
  | PdfAdapterConfig
  | PublicApiAdapterConfig;

export type FetchOutcomeStatus = "ok" | "failed";

/** Fail-closed by construction: a `failed` outcome carries no candidates
 *  and a diagnostic code, never a thrown exception — matching this
 *  codebase's existing convention (scheduledWriterRunSafety.ts's
 *  FetchDiagnosticCode, describePageFetchFailure in pageParser.ts). */
export type RawFetchResult =
  | { status: "ok"; rawBody: string }
  | { status: "failed"; diagnosticCode: string };
