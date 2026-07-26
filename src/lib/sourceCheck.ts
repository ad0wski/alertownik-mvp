import {
  OFFICIAL_SOURCE_CHECKS,
  type OfficialSourceCheck,
} from "@/lib/officialSourceChecklist";
import type { PageParseResult } from "@/lib/sourceParsers/pageParser";
import type { SourceCheckResult } from "@/types/alertSource";
import { trimAtWord } from "@/lib/candidateWarnings";

// Sprint 134 (A2) — deterministic layer of the manual Source Check API.
//
// The /api/sources/check route is a thin fetch wrapper around this module:
// everything that decides WHAT gets checked and WHAT comes back as a
// candidate proposal lives here as pure functions, so tests run on fixture
// HTML with zero live-site dependencies (same split as pageParser vs
// fetch-preview, Sprint 76).
//
// Hard scope rules for this stage (see Obsidian: Automation Implementation
// Plan § A2/A4): only allowlisted safe sources (Sprint 139: exactly two),
// manual trigger only, the API only PROPOSES — saving a candidate always
// happens in the admin's browser through their authenticated session
// (status `pending`, human review required). No cron, no autopublish.

// ── Safe-source allowlist ─────────────────────────────────────────────────────

// The entries themselves come from the canonical checklist config
// (officialSourceChecklist.ts) so name/URL/category can never drift between
// the checklist card and the API. Growing this list is a deliberate
// per-source decision, not a config tweak — each source needs a parse check
// + risk review first (e.g. PGE needs a manual region picker and its site
// actively rejects automated requests behind a WAF — still unsuitable).
// Sprint 134 started with Michałowice; Sprint 139 added WKD after verifying
// the live page fetches cleanly (HTTP 200 for our UA) and its Joomla
// blogPost markup parses deterministically (pageParser.extractBlogPostItems,
// fixture-tested). Sprint 168 added Wodociągi Michałowice after verifying
// its WordPress REST API returns clean, structured JSON (294 posts in the
// "Aktualności" category, overwhelmingly genuine water-interruption
// notices) and that a deterministic keyword filter
// (pageParser.parseWordpressRestPosts) separates operational notices from
// generic informational/PR posts — fixture-tested
// (tests/e2e/wordpressRestParser.spec.ts,
// tests/e2e/manualSourceCheckWordpressRest.spec.ts). Sprint 169 added
// Pruszków aktualności: the historical HTTP 403 (Sprint 73/77) turned out
// to apply only to the rendered HTML page — pruszkow.pl's own WordPress
// REST API is publicly reachable, and pageParser.parsePruszkowRestPosts
// applies its own, broader keyword filter (road/traffic, heat/hot-water,
// waste-schedule, alarm-siren notices) to separate operational content
// from this source's much larger share of general municipal PR/event
// posts — fixture-tested (tests/e2e/pruszkowRestParser.spec.ts,
// tests/e2e/manualSourceCheckPruszkowRest.spec.ts).
export const SAFE_CHECK_SOURCE_IDS = [
  "michalowice-komunikaty",
  "wkd-aktualnosci",
  "wodociagi-michalowice",
  "pruszkow-aktualnosci",
] as const;

export type SafeCheckSourceId = (typeof SAFE_CHECK_SOURCE_IDS)[number];

export function getSafeCheckSource(key: string): OfficialSourceCheck | null {
  if (!(SAFE_CHECK_SOURCE_IDS as readonly string[]).includes(key)) return null;
  return OFFICIAL_SOURCE_CHECKS.find((s) => s.id === key) ?? null;
}

// ── Candidate proposals ───────────────────────────────────────────────────────

export interface CheckProposal {
  /** Heading of the notice, or the trimmed first words when headingless. */
  title: string;
  /** Short display excerpt (≤300 chars, word-trimmed). */
  excerpt: string;
  /** Fuller text to persist as the candidate's raw_text. */
  rawText: string;
  /** Whether a date was detected in the block (pageParser heuristic). */
  hasDate: boolean;
}

// Exported so tests pin the caps by name instead of magic numbers.
export const MAX_CHECK_PROPOSALS = 6;
export const MIN_PROPOSAL_TEXT_LENGTH = 60;

// Consent-banner / page-chrome fragments that can survive tag stripping on
// municipal CMS pages. A proposal whose text matches is dropped — an admin
// should never be asked to review a cookie banner as a notice. Genuine
// notices don't talk about cookies or privacy policies, so a false positive
// here is theoretical; determinism matters more.
const BOILERPLATE_RX = [
  /używa\s+plik[óo]w\s+cookie/i,
  /polityk[aęi]\s+(?:prywatno[śs]ci|cookies)/i,
  /deklaracja\s+dost[ęe]pno[śs]ci/i,
  /^czytaj\s+więcej$/i,
];

function looksLikeBoilerplate(text: string): boolean {
  return BOILERPLATE_RX.some((re) => re.test(text));
}

// Turns a parsed page into candidate proposals. Deliberately dumb and
// deterministic: no fetching, no scoring, no AI — the admin reads each
// proposal and decides. Duplicate/stale warnings are applied client-side
// with the existing candidateWarnings helpers, where the admin's session
// can see current candidates and alerts.
//
// Sprint 138 defensive layer: too-short fragments and boilerplate are
// skipped, repeated titles are proposed once (CMS list pages sometimes pin
// the same notice twice), and the count is capped — so a broken or
// boilerplate-heavy page degrades to fewer/zero proposals, never to junk.
export function buildCheckProposals(parse: PageParseResult): CheckProposal[] {
  const proposals: CheckProposal[] = [];
  const seenTitles = new Set<string>();

  for (const c of parse.candidates) {
    if (proposals.length >= MAX_CHECK_PROPOSALS) break;
    const text = c.text.trim();
    if (text.length < MIN_PROPOSAL_TEXT_LENGTH) continue;
    if (looksLikeBoilerplate(text)) continue;

    const title = (c.heading?.trim() || trimAtWord(text, 80)).trim();
    const titleKey = title.toLowerCase().replace(/\s+/g, " ");
    if (seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);

    proposals.push({
      title,
      excerpt: trimAtWord(text, 300),
      rawText: text,
      hasDate: c.hasDate,
    });
  }

  return proposals;
}

// Suggested source_checks result for logging this check in history —
// "nothing found" is a loggable result too (checklist policy since 129).
export function suggestCheckResult(proposalCount: number): SourceCheckResult {
  return proposalCount > 0 ? "found_notice" : "no_changes";
}

// ── Registry matching ─────────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

// Finds the alert_sources registry row matching an official checklist URL,
// so an API check can attach source_id to saved candidates and log to the
// check history. Match is by normalized host+path (www. and trailing
// slashes ignored) — no match is fine: candidates save with source_id null
// and history logging is simply unavailable until the source is registered.
//
// alert_sources.url is nullable (a source can be registered before its
// official URL is known) — a registry row with no URL can never match any
// officialUrl, so it's skipped rather than compared.
export function findMatchingRegistrySource<T extends { url: string | null }>(
  registrySources: T[],
  officialUrl: string
): T | null {
  const target = normalizeUrl(officialUrl);
  return registrySources.find((s) => s.url !== null && normalizeUrl(s.url) === target) ?? null;
}

// ── Copy (kept here so tests can pin it against automation-promise drift) ────

// 422 copy for /api/sources/check — the supported-source names are built
// from the allowlist + canonical checklist config, so this message can
// never drift from what the API actually accepts.
export const UNSUPPORTED_SOURCE_ERROR =
  "To źródło nie jest jeszcze obsługiwane przez check w aplikacji. " +
  `Na tym etapie działają wyłącznie: ${SAFE_CHECK_SOURCE_IDS.map(
    (id) => `„${OFFICIAL_SOURCE_CHECKS.find((s) => s.id === id)?.name ?? id}”`
  ).join(" oraz ")}. ` +
  "Pozostałe źródła sprawdzaj ręcznie w przeglądarce (checklista).";

export const MANUAL_CHECK_DISCLAIMER =
  "Check jest ręczny — uruchamiasz go przyciskiem, nic nie sprawdza się samo. " +
  "Znalezione propozycje wymagają Twojego przeglądu; zapis kandydata i publikacja " +
  "to zawsze osobne, ręczne decyzje (publikacja wyłącznie z Kreatora).";

export const CHECK_BUTTON_LABEL = "Sprawdź teraz przez aplikację";
