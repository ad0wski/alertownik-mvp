import { guardedFetch } from "@/lib/ssrfGuard";
import type { LinkHealthResult } from "@/lib/linkHealthShared";

// Sprint 164A — Link Health Checker v1. SERVER-ONLY (imports ssrfGuard.ts,
// which imports Node's `dns`/`net` — never import this file from a "use
// client" component; import from src/lib/linkHealthShared.ts instead for
// types/pure helpers/copy).
//
// Live HTTP reachability check for a source's own URL, distinct from the
// existing Source Health Dashboard (src/lib/sourceHealth.ts, Sprint 137),
// which only summarizes MANUAL check history (source_checks rows) — it
// never actually contacts a source's server. This module answers a
// different question: "does this link currently respond?" — status code,
// timeout, redirect behavior — computed live, on admin request, never
// persisted (no schema change in this sprint; see
// docs/SPRINT_164A_AUTOMATION_LINK_HEALTH_SAFE_FOUNDATION_V1.md §"Schema
// gap" for the prepared-but-unexecuted forward/rollback/verify SQL that
// would let a future sprint persist this instead of recomputing it live
// every time).
//
// All requests go through guardedFetch (src/lib/ssrfGuard.ts) — the same
// SSRF-hardened fetch already used by /api/sources/fetch-preview: blocks
// private/loopback/link-local/metadata targets, re-validates every
// redirect hop, fixed timeout, fixed non-forwarded User-Agent. HEAD is
// tried first (no response body to read at all); a small set of servers
// reject HEAD outright, so a single GET retry follows — its body is
// never read, only cancelled, since only the status code is needed here.

export type {
  LinkHealthOutcome,
  LinkHealthResult,
  LinkHealthTarget,
  LinkHealthRow,
  LinkHealthSummary,
} from "@/lib/linkHealthShared";
export {
  summarizeLinkHealth,
  MAX_LINK_HEALTH_TARGETS_PER_REQUEST,
  LINK_HEALTH_DISCLAIMER,
  LINK_HEALTH_BLOCKED_NOTE,
} from "@/lib/linkHealthShared";

const HEALTH_CHECK_TIMEOUT_MS = 8_000;

const SSRF_BLOCKED_REASONS = new Set([
  "invalid_url",
  "unsupported_protocol",
  "credentials_in_url",
  "blocked_hostname",
  "private_ip",
  "dns_resolution_failed",
]);

function classifyGuardedFetchFailure(reason: string, checkedAt: string): LinkHealthResult {
  if (SSRF_BLOCKED_REASONS.has(reason)) {
    return { outcome: "blocked", httpStatus: null, reasonCode: reason, finalUrl: null, checkedAt };
  }
  // timeout, fetch_error, redirect_without_location, invalid_redirect_target,
  // too_many_redirects — all treated as a source-side reachability problem,
  // not a security block.
  return { outcome: "needs_attention", httpStatus: null, reasonCode: reason, finalUrl: null, checkedAt };
}

function classifyStatus(status: number): LinkHealthResult["outcome"] {
  return status >= 200 && status < 400 ? "healthy" : "needs_attention";
}

/** Checks one URL's live reachability. Never reads a response body beyond
 *  cancelling it — this function only ever needs a status code. */
export async function checkUrlHealth(url: string): Promise<LinkHealthResult> {
  const checkedAt = new Date().toISOString();

  let result = await guardedFetch(url, { timeoutMs: HEALTH_CHECK_TIMEOUT_MS, method: "HEAD" });
  if (!result.ok && result.reason === "fetch_error") {
    // Some servers reject HEAD (405/501) at the TCP/HTTP layer in a way
    // that surfaces as a generic fetch error rather than a clean status —
    // one GET retry, body never read, closes that gap without weakening
    // the "don't download full pages" intent for the common case.
    result = await guardedFetch(url, { timeoutMs: HEALTH_CHECK_TIMEOUT_MS, method: "GET" });
  }

  if (!result.ok) {
    return classifyGuardedFetchFailure(result.reason, checkedAt);
  }

  result.response.body?.cancel().catch(() => {});

  const status = result.response.status;
  return {
    outcome: classifyStatus(status),
    httpStatus: status,
    reasonCode: `http_${status}`,
    finalUrl: result.finalUrl,
    checkedAt,
  };
}
