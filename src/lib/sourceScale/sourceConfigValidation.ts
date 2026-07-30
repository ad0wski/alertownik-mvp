// Sprint 188A — National Source Scale Plan, foundation validators only.
//
// Pure validation of a SourceAdapterConfig before it is allowed to move
// past `classified` in the lifecycle (see sourceLifecycle.ts). No
// network access here — this only checks shape and safety of the
// configuration itself, the same split this codebase already keeps
// between config validation and live fetch (e.g. isDirectSafePermalink
// in trustedSourceAutoPublish.ts vs. the actual fetch in
// manualSourceCheckFetch.ts).

import { isDirectSafePermalink } from "@/lib/trustedSourceAutoPublish";
import type { SourceAdapterConfig } from "@/lib/sourceScale/sourceAdapterTypes";

export type SourceConfigValidationIssue =
  | "missing_official_url"
  | "unsafe_official_url"
  | "missing_api_url"
  | "unsafe_api_url"
  | "api_url_is_not_wordpress_shaped"
  | "missing_feed_url"
  | "unsafe_feed_url"
  | "missing_parser_id";

export interface SourceConfigValidationResult {
  valid: boolean;
  issues: SourceConfigValidationIssue[];
}

function isHttpUrl(value: string | undefined | null): boolean {
  if (!value || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** A safe *page* URL — same rule as candidate_url safety in
 *  trustedSourceAutoPublish.ts (http/https, never a /wp-json/ payload
 *  endpoint masquerading as a human-facing page). Reused, not
 *  reimplemented, so the two safety definitions can never silently
 *  drift apart. */
function isSafeHumanFacingUrl(value: string | undefined | null): boolean {
  return isDirectSafePermalink(value ?? undefined);
}

/** Validates a SourceAdapterConfig's shape and basic safety. Does not
 *  reach the network and does not judge whether the source is *good* —
 *  only whether it is well-formed enough to proceed to `testable` (see
 *  sourceReadinessScore.ts for the live-signal-based scoring that comes
 *  after this passes). */
export function validateSourceAdapterConfig(
  config: SourceAdapterConfig
): SourceConfigValidationResult {
  const issues: SourceConfigValidationIssue[] = [];

  if (!config.officialUrl || !config.officialUrl.trim()) {
    issues.push("missing_official_url");
  } else if (!isSafeHumanFacingUrl(config.officialUrl)) {
    issues.push("unsafe_official_url");
  }

  switch (config.type) {
    case "wordpress_rest": {
      if (!config.apiUrl || !config.apiUrl.trim()) {
        issues.push("missing_api_url");
      } else if (!isHttpUrl(config.apiUrl)) {
        issues.push("unsafe_api_url");
      } else if (!/\/wp-json\//.test(config.apiUrl)) {
        issues.push("api_url_is_not_wordpress_shaped");
      }
      break;
    }
    case "rss_atom": {
      if (!config.feedUrl || !config.feedUrl.trim()) {
        issues.push("missing_feed_url");
      } else if (!isHttpUrl(config.feedUrl)) {
        issues.push("unsafe_feed_url");
      }
      break;
    }
    case "html_custom": {
      if (!config.parserId || !config.parserId.trim()) {
        issues.push("missing_parser_id");
      }
      break;
    }
    case "public_api": {
      if (!config.apiUrl || !config.apiUrl.trim()) {
        issues.push("missing_api_url");
      } else if (!isHttpUrl(config.apiUrl)) {
        issues.push("unsafe_api_url");
      }
      break;
    }
    case "html_generic":
    case "pdf":
      // No adapter-specific fields beyond officialUrl to validate.
      break;
  }

  return { valid: issues.length === 0, issues };
}
