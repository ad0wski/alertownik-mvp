import { parsePageHtml, describePageFetchFailure } from "@/lib/sourceParsers/pageParser";
import { buildCheckProposals, type CheckProposal } from "@/lib/sourceCheck";
import { readLimitedText } from "@/lib/ssrfGuard";
import {
  classifyFetchFailure,
  MAX_FETCH_ATTEMPTS,
  RETRY_DELAY_MS,
  type FetchDiagnosticCode,
} from "@/lib/scheduledWriterRunSafety";

// Sprint 167 — reliability hardening for the admin's manual
// "Sprawdź teraz przez aplikację" check (POST /api/sources/check).
//
// Extracted from that route so the same bounded-retry policy the
// scheduled-writer's fetchAndParseProposals (scheduledSourceFetch.ts)
// already uses — and that this codebase already reviewed and tested —
// applies here too, for exactly the same reason: a momentary 5xx, a
// timeout, or a generic network blip on Michałowice's or WKD's site
// should not force the admin to click the button again by hand. A
// permanent failure (4xx, wrong content type) still fails on the first
// attempt, exactly as before this sprint — retrying it would waste a
// request for zero chance of success.
//
// Deliberately NOT a reuse of fetchAndParseProposals itself: that
// function's failure shape only carries a diagnostic bucket (http_4xx/
// http_5xx), which is enough for the scheduled writer's own generic,
// count-only run history, but this route's admin-facing UI has always
// shown a richer, situation-specific Polish message (the 401/403
// bot-block explanation, the 404 "check the URL" explanation, etc. —
// see pageParser.describePageFetchFailure and the route's own existing
// timeout/content-type copy). This module preserves every one of those
// exact messages — only the retry behavior is new.

const CHECK_FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;

export interface ManualCheckFetchSuccess {
  ok: true;
  pageTitle: string;
  proposals: CheckProposal[];
}

export interface ManualCheckFetchFailure {
  ok: false;
  diagnostic: FetchDiagnosticCode;
  /** Already-composed, admin-facing Polish message — identical wording to
   *  this route's pre-Sprint-167 single-attempt behavior. */
  message: string;
}

async function attemptManualCheckFetch(
  officialUrl: string
): Promise<ManualCheckFetchSuccess | ManualCheckFetchFailure> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHECK_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(officialUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Alertownik-Monitor/1.0 (admin source check)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        diagnostic: response.status >= 500 ? "http_5xx" : "http_4xx",
        message: describePageFetchFailure(response.status),
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      const typeName = contentType.split(";")[0].trim() || "nieznany";
      return {
        ok: false,
        diagnostic: "non_html_content_type",
        message: `Źródło zwróciło typ ${typeName} zamiast HTML. Sprawdź stronę ręcznie w przeglądarce.`,
      };
    }

    const raw = await readLimitedText(response, MAX_RESPONSE_BYTES);
    const html = raw.slice(0, 500_000);
    const parse = parsePageHtml(html, officialUrl);
    return { ok: true, pageTitle: parse.title, proposals: buildCheckProposals(parse) };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      diagnostic: isTimeout ? "timeout_10s" : "network_error",
      message: isTimeout
        ? "Źródło nie odpowiada (timeout 10 s). Spróbuj później albo sprawdź stronę ręcznie."
        : "Nie udało się pobrać strony źródła. Spróbuj później albo sprawdź stronę ręcznie.",
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Same bounded-retry policy as fetchAndParseProposals: exactly one retry,
 *  transient failures only (http_5xx, timeout_10s, network_error), never a
 *  third attempt. `delayMs` is overridable only for tests — the real route
 *  always uses the default RETRY_DELAY_MS. */
export async function fetchAndParseManualCheck(
  officialUrl: string,
  delayMs: number = RETRY_DELAY_MS
): Promise<ManualCheckFetchSuccess | ManualCheckFetchFailure> {
  let lastResult = await attemptManualCheckFetch(officialUrl);
  let attempts = 1;
  while (
    !lastResult.ok &&
    classifyFetchFailure(lastResult.diagnostic) === "transient" &&
    attempts < MAX_FETCH_ATTEMPTS
  ) {
    await delay(delayMs);
    lastResult = await attemptManualCheckFetch(officialUrl);
    attempts++;
  }
  return lastResult;
}
