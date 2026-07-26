import {
  parsePageHtml,
  parseWordpressRestPosts,
  isWordpressRestPostArray,
  type WordpressRestPost,
  type PageParseResult,
} from "@/lib/sourceParsers/pageParser";
import { buildCheckProposals } from "@/lib/sourceCheck";
import { CRON_FETCH_TIMEOUT_MS } from "@/lib/cronCheckSources";
import { readLimitedText } from "@/lib/ssrfGuard";
import {
  classifyFetchFailure,
  MAX_FETCH_ATTEMPTS,
  RETRY_DELAY_MS,
  type FetchDiagnosticCode,
} from "@/lib/scheduledWriterRunSafety";

// Extracted from src/app/api/cron/write-candidates/route.ts (Sprint 166C)
// so the bounded-retry behavior is testable directly with a mocked
// global.fetch, without needing to also mock a full Supabase sign-in
// flow (Next.js route.ts files may only export the recognized HTTP-verb
// handlers and a small config allowlist — arbitrary helper exports are
// not supported there). Behavior is otherwise unchanged from the
// pre-Sprint-166C version of this function.
//
// Sprint 173 — this module previously only knew how to fetch a source's
// officialUrl as HTML, which meant it silently could never work for
// Wodociągi Michałowice or Pruszków aktualności (Sprints 168/169): both
// were deliberately built to be checked via their WordPress REST API
// instead, precisely because their rendered HTML doesn't yield real
// candidates (Wodociągi's homepage) or is bot-blocked (Pruszków). Before
// this sprint, a scheduled run covering those two sources would have
// fetched the wrong thing every single time — not a hypothetical bug,
// but a certainty, since that's exactly why they needed the REST path in
// the first place. This mirrors src/lib/manualSourceCheckFetch.ts's own
// apiUrl-aware dispatch (Sprint 168/169) so the scheduled path can now
// correctly cover all four current safe-check sources, not just the
// original two HTML-based ones — no code duplication between the two
// modules beyond what already existed, deliberately kept separate per
// this file's own established "isolated write-path modules" convention
// (see write-candidates/route.ts's header comment for why).

export interface FetchOutcomeFailure {
  ok: false;
  outcome: "fetch_error" | "timeout";
  diagnostic: FetchDiagnosticCode;
}

export interface FetchOutcomeSuccess {
  ok: true;
  proposals: ReturnType<typeof buildCheckProposals>;
}

/** Sprint 173 — accepts either a plain URL string (existing HTML-page
 *  sources, unchanged) or a full target with an apiUrl, mirroring
 *  ManualCheckFetchTarget in manualSourceCheckFetch.ts. `parseRestPosts`
 *  defaults to the water-topic filter (parseWordpressRestPosts) so a
 *  caller that only sets apiUrl without specifying a parser still gets a
 *  reasonable default — real call sites always pass the correct one via
 *  pageParser.REST_PARSERS_BY_SOURCE_ID. */
export interface ScheduledFetchTarget {
  officialUrl: string;
  apiUrl?: string;
  parseRestPosts?: (posts: WordpressRestPost[]) => PageParseResult;
}

const REST_FETCH_MAX_RESPONSE_BYTES = 2_000_000;

async function attemptWordpressRestFetch(
  apiUrl: string,
  parseRestPosts: (posts: WordpressRestPost[]) => PageParseResult = parseWordpressRestPosts
): Promise<FetchOutcomeFailure | FetchOutcomeSuccess> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CRON_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Alertownik-Monitor/1.0 (scheduled writer)",
        Accept: "application/json",
      },
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return { ok: false, outcome: "fetch_error", diagnostic: response.status >= 500 ? "http_5xx" : "http_4xx" };
    }
    const raw = await readLimitedText(response, REST_FETCH_MAX_RESPONSE_BYTES);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false, outcome: "fetch_error", diagnostic: "parse_exception" };
    }
    if (!isWordpressRestPostArray(json)) {
      return { ok: false, outcome: "fetch_error", diagnostic: "parse_exception" };
    }
    const parse = parseRestPosts(json);
    return { ok: true, proposals: buildCheckProposals(parse) };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      outcome: isTimeout ? "timeout" : "fetch_error",
      diagnostic: isTimeout ? "timeout_10s" : "network_error",
    };
  }
}

async function attemptFetchAndParseProposalsHtml(
  officialUrl: string
): Promise<FetchOutcomeFailure | FetchOutcomeSuccess> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CRON_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(officialUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Alertownik-Monitor/1.0 (scheduled writer)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return { ok: false, outcome: "fetch_error", diagnostic: response.status >= 500 ? "http_5xx" : "http_4xx" };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return { ok: false, outcome: "fetch_error", diagnostic: "non_html_content_type" };
    }
    const raw = await response.text();
    const html = raw.slice(0, 500_000);
    const parse = parsePageHtml(html, officialUrl);
    return { ok: true, proposals: buildCheckProposals(parse) };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      outcome: isTimeout ? "timeout" : "fetch_error",
      diagnostic: isTimeout ? "timeout_10s" : "network_error",
    };
  }
}

async function attemptFetchAndParseProposals(
  target: ScheduledFetchTarget
): Promise<FetchOutcomeFailure | FetchOutcomeSuccess> {
  return target.apiUrl
    ? attemptWordpressRestFetch(target.apiUrl, target.parseRestPosts)
    : attemptFetchAndParseProposalsHtml(target.officialUrl);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sprint 166C — bounded retry, transient failures only (see
 *  src/lib/scheduledWriterRunSafety.ts classifyFetchFailure). A permanent
 *  failure (4xx, wrong content type) is returned on the first attempt,
 *  exactly as before this sprint — retrying it would waste a request for
 *  zero chance of success. A transient failure (5xx, timeout, generic
 *  network error) gets exactly one more attempt, after a short fixed
 *  delay, then is reported honestly as a failure if it happens again.
 *  MAX_FETCH_ATTEMPTS bounds the total attempts (2) so this can never
 *  become a retry loop. `delayMs` is overridable only for tests — the
 *  real route always uses the default RETRY_DELAY_MS. */
export async function fetchAndParseProposals(
  target: string | ScheduledFetchTarget,
  delayMs: number = RETRY_DELAY_MS
): Promise<FetchOutcomeFailure | FetchOutcomeSuccess> {
  const resolved: ScheduledFetchTarget = typeof target === "string" ? { officialUrl: target } : target;
  let lastResult = await attemptFetchAndParseProposals(resolved);
  let attempts = 1;
  while (
    !lastResult.ok &&
    classifyFetchFailure(lastResult.diagnostic) === "transient" &&
    attempts < MAX_FETCH_ATTEMPTS
  ) {
    await delay(delayMs);
    lastResult = await attemptFetchAndParseProposals(resolved);
    attempts++;
  }
  return lastResult;
}
