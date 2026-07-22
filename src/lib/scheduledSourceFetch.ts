import { parsePageHtml } from "@/lib/sourceParsers/pageParser";
import { buildCheckProposals } from "@/lib/sourceCheck";
import { CRON_FETCH_TIMEOUT_MS } from "@/lib/cronCheckSources";
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

export interface FetchOutcomeFailure {
  ok: false;
  outcome: "fetch_error" | "timeout";
  diagnostic: FetchDiagnosticCode;
}

export interface FetchOutcomeSuccess {
  ok: true;
  proposals: ReturnType<typeof buildCheckProposals>;
}

async function attemptFetchAndParseProposals(
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
  officialUrl: string,
  delayMs: number = RETRY_DELAY_MS
): Promise<FetchOutcomeFailure | FetchOutcomeSuccess> {
  let lastResult = await attemptFetchAndParseProposals(officialUrl);
  let attempts = 1;
  while (
    !lastResult.ok &&
    classifyFetchFailure(lastResult.diagnostic) === "transient" &&
    attempts < MAX_FETCH_ATTEMPTS
  ) {
    await delay(delayMs);
    lastResult = await attemptFetchAndParseProposals(officialUrl);
    attempts++;
  }
  return lastResult;
}
