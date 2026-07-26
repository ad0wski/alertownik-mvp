import { createHash, timingSafeEqual } from "crypto";
import {
  parsePageHtml,
  parseWordpressRestPosts,
  isWordpressRestPostArray,
  type PageParseResult,
  type WordpressRestPost,
} from "@/lib/sourceParsers/pageParser";
import {
  SAFE_CHECK_SOURCE_IDS,
  getSafeCheckSource,
  buildCheckProposals,
  type SafeCheckSourceId,
} from "@/lib/sourceCheck";

// Sprint 142 — Protected Cron-Compatible Dry-Run Endpoint v1.
//
// Pure, testable layer behind GET /api/cron/check-sources
// (src/app/api/cron/check-sources/route.ts). Everything that decides WHO is
// allowed to trigger a check and WHAT gets checked lives here as functions
// with no Next.js/Request types, so tests run on fixture HTML and fake
// tokens with zero live-site dependency and zero real secrets.
//
// Hard scope for this module (see docs/SCHEDULED_CHECKS_ARCHITECTURE_V1.md):
// this is a DRY RUN. It fetches allowlisted sources and classifies the
// result — it never persists a candidate or a check-history row, never
// invokes the candidate verifier, and never touches any draft/publish
// helper. There is no import of any Supabase write helper anywhere in this
// file, on purpose: a grep for "supabase" here should find nothing.

// ── Authentication ────────────────────────────────────────────────────────────

/**
 * Constant-time comparison via fixed-length SHA-256 digests, so neither the
 * length nor the content of `provided` can be inferred from timing —
 * `crypto.timingSafeEqual` itself throws on unequal-length buffers, which a
 * naive `timingSafeEqual(Buffer.from(a), Buffer.from(b))` would leak through
 * that exception; hashing first sidesteps that entirely.
 */
function safeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export type CronAuthResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "unauthorized" };

/**
 * Two distinct, deliberately different failure shapes (per the Sprint 142
 * spec):
 *  - "not_configured": CRON_SECRET isn't set on the server at all. This is
 *    an operator/deployment fact, not a caller secret — safe to say plainly
 *    ("endpoint not configured yet"), and it fails closed: no check runs.
 *  - "unauthorized": CRON_SECRET *is* configured but the caller's bearer
 *    token is missing or wrong. The response for this case must be
 *    generic and must not hint at whether the secret exists or what's
 *    different about the token.
 *
 * `expectedSecret` is passed in (never read from process.env inside this
 * pure function) so tests can inject a fake local value without touching
 * real environment variables.
 */
export function checkCronAuth(
  authorizationHeader: string | null,
  expectedSecret: string | undefined
): CronAuthResult {
  if (!expectedSecret) {
    return { ok: false, reason: "not_configured" };
  }

  if (!authorizationHeader) {
    return { ok: false, reason: "unauthorized" };
  }

  const match = /^Bearer\s+(.+)$/.exec(authorizationHeader.trim());
  if (!match) {
    return { ok: false, reason: "unauthorized" };
  }

  const provided = match[1].trim();
  if (!provided || !safeEqual(provided, expectedSecret)) {
    return { ok: false, reason: "unauthorized" };
  }

  return { ok: true };
}

// ── Kill switch ───────────────────────────────────────────────────────────────

/**
 * Belt-and-suspenders gate independent of authentication: even a perfectly
 * valid CRON_SECRET must not run a check while this is unset. Defaults to
 * disabled — the only enabling value is the literal string "true". No
 * value is set anywhere in this repo or in any environment as part of
 * Sprint 142; this exists so that configuring CRON_SECRET alone (a future
 * sprint) is not by itself enough to make the endpoint active.
 */
export function isScheduledChecksEnabled(
  flagValue: string | undefined
): boolean {
  return flagValue === "true";
}

// ── Source resolution (allowlist only, never an arbitrary URL) ───────────────

/**
 * Resolves which allowlisted sources to check this run.
 *  - No filter → every source on SAFE_CHECK_SOURCE_IDS (the server-controlled
 *    default a real cron invocation would use — Vercel Cron doesn't send a
 *    query string, so this is the path that actually runs on a schedule).
 *  - A sourceKey filter → strictly validated against the existing allowlist
 *    via getSafeCheckSource; an unknown key resolves to an empty list, never
 *    to a fetch of anything. There is no code path in this function that can
 *    turn caller input into a URL that isn't already in the allowlist.
 */
export function resolveCronSources(sourceKeyFilter?: string | null) {
  if (!sourceKeyFilter) {
    return SAFE_CHECK_SOURCE_IDS.map((id) => getSafeCheckSource(id)!).filter(Boolean);
  }
  const match = getSafeCheckSource(sourceKeyFilter);
  return match ? [match] : [];
}

// ── Per-source dry-run result ─────────────────────────────────────────────────

export type CronCheckOutcome =
  | "success"
  | "no_proposals"
  | "fetch_error"
  | "parse_error"
  | "timeout";

/** Short, non-sensitive codes only — never a raw error message or stack. */
export type CronDiagnosticCode =
  | "http_4xx"
  | "http_5xx"
  | "non_html_content_type"
  | "network_error"
  | "timeout_10s"
  | "parse_exception";

export interface CronSourceResult {
  sourceKey: SafeCheckSourceId;
  sourceName: string;
  outcome: CronCheckOutcome;
  proposalCount: number;
  hasDateSignalCount: number;
  durationMs: number;
  diagnostic?: CronDiagnosticCode;
}

/** Classifies a completed parse into the dry-run result shape — no HTML,
 *  no excerpts, no titles leave this function. */
export function summarizeParseResult(
  sourceKey: SafeCheckSourceId,
  sourceName: string,
  parse: PageParseResult,
  durationMs: number
): CronSourceResult {
  const proposals = buildCheckProposals(parse);
  return {
    sourceKey,
    sourceName,
    outcome: proposals.length > 0 ? "success" : "no_proposals",
    proposalCount: proposals.length,
    hasDateSignalCount: proposals.filter((p) => p.hasDate).length,
    durationMs,
  };
}

export function errorResult(
  sourceKey: SafeCheckSourceId,
  sourceName: string,
  outcome: Extract<CronCheckOutcome, "fetch_error" | "parse_error" | "timeout">,
  diagnostic: CronDiagnosticCode,
  durationMs: number
): CronSourceResult {
  return {
    sourceKey,
    sourceName,
    outcome,
    proposalCount: 0,
    hasDateSignalCount: 0,
    durationMs,
    diagnostic,
  };
}

// ── Top-level dry-run summary ─────────────────────────────────────────────────

export interface CronDryRunSummary {
  ok: true;
  dryRun: true;
  checkedAt: string;
  checkedSources: number;
  successfulSources: number;
  failedSources: number;
  totalProposalCount: number;
  savedCandidates: 0;
  savedSourceChecks: 0;
  published: false;
  message: string;
  results: CronSourceResult[];
}

export const DRY_RUN_MESSAGE =
  "Dry-run: nic nie zostało zapisane w bazie, żaden kandydat ani historia " +
  "sprawdzenia nie powstały, nic nie zostało opublikowane.";

export function buildDryRunSummary(
  results: CronSourceResult[],
  checkedAt: string = new Date().toISOString()
): CronDryRunSummary {
  return {
    ok: true,
    dryRun: true,
    checkedAt,
    checkedSources: results.length,
    successfulSources: results.filter((r) => r.outcome === "success" || r.outcome === "no_proposals").length,
    failedSources: results.filter(
      (r) => r.outcome === "fetch_error" || r.outcome === "parse_error" || r.outcome === "timeout"
    ).length,
    totalProposalCount: results.reduce((sum, r) => sum + r.proposalCount, 0),
    savedCandidates: 0,
    savedSourceChecks: 0,
    published: false,
    message: DRY_RUN_MESSAGE,
    results,
  };
}

export const CRON_FETCH_TIMEOUT_MS = 10_000;

// ── Shared per-source fetch + parse (used by every cron/dry-run route) ────────
//
// Moved here (Sprint 153) so a second route — the Michałowice-only cron
// wrapper — can reuse the exact same fetch/parse/error-classification logic
// with zero duplication, rather than each route.ts file reimplementing it.
// Next.js route.ts files may only export HTTP method handlers and the small
// set of special route config values, so this cannot live in a route.ts.

function classifyFetchError(err: unknown): CronDiagnosticCode {
  if (err instanceof Error && err.name === "AbortError") return "timeout_10s";
  return "network_error";
}

// Sprint 173 — dry-run twin of the fix in scheduledSourceFetch.ts: without
// this, a dry-run preview of Wodociągi Michałowice or Pruszków aktualności
// would fetch their officialUrl as HTML and report a misleading result
// (zero candidates or a permanent error) instead of previewing what a real
// scheduled run would actually see via their REST API.
async function checkOneSourceRest(
  sourceKey: SafeCheckSourceId,
  name: string,
  apiUrl: string,
  parseRestPosts: (posts: WordpressRestPost[]) => PageParseResult
): Promise<CronSourceResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CRON_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Alertownik-Monitor/1.0 (scheduled dry-run check)",
        Accept: "application/json",
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const diagnostic: CronDiagnosticCode = response.status >= 500 ? "http_5xx" : "http_4xx";
      return errorResult(sourceKey, name, "fetch_error", diagnostic, Date.now() - startedAt);
    }

    const raw = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(raw.slice(0, 2_000_000));
    } catch {
      return errorResult(sourceKey, name, "parse_error", "parse_exception", Date.now() - startedAt);
    }
    if (!isWordpressRestPostArray(json)) {
      return errorResult(sourceKey, name, "parse_error", "parse_exception", Date.now() - startedAt);
    }

    const parse = parseRestPosts(json);
    return summarizeParseResult(sourceKey, name, parse, Date.now() - startedAt);
  } catch (err) {
    clearTimeout(timeoutId);
    const diagnostic = classifyFetchError(err);
    const outcome = diagnostic === "timeout_10s" ? "timeout" : "fetch_error";
    return errorResult(sourceKey, name, outcome, diagnostic, Date.now() - startedAt);
  }
}

async function checkOneSourceHtml(
  sourceKey: SafeCheckSourceId,
  name: string,
  officialUrl: string
): Promise<CronSourceResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CRON_FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const response = await fetch(officialUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Alertownik-Monitor/1.0 (scheduled dry-run check)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const diagnostic: CronDiagnosticCode = response.status >= 500 ? "http_5xx" : "http_4xx";
      return errorResult(sourceKey, name, "fetch_error", diagnostic, Date.now() - startedAt);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return errorResult(sourceKey, name, "fetch_error", "non_html_content_type", Date.now() - startedAt);
    }

    const raw = await response.text();
    html = raw.slice(0, 500_000);
  } catch (err) {
    clearTimeout(timeoutId);
    const diagnostic = classifyFetchError(err);
    const outcome = diagnostic === "timeout_10s" ? "timeout" : "fetch_error";
    return errorResult(sourceKey, name, outcome, diagnostic, Date.now() - startedAt);
  }

  try {
    const parse = parsePageHtml(html, officialUrl);
    return summarizeParseResult(sourceKey, name, parse, Date.now() - startedAt);
  } catch {
    return errorResult(sourceKey, name, "parse_error", "parse_exception", Date.now() - startedAt);
  }
}

export async function checkOneSource(
  sourceKey: SafeCheckSourceId,
  name: string,
  officialUrl: string,
  apiUrl?: string,
  parseRestPosts?: (posts: WordpressRestPost[]) => PageParseResult
): Promise<CronSourceResult> {
  return apiUrl
    ? checkOneSourceRest(sourceKey, name, apiUrl, parseRestPosts ?? parseWordpressRestPosts)
    : checkOneSourceHtml(sourceKey, name, officialUrl);
}
