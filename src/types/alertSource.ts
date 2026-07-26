import type { AlertCategory } from "./alert";
import type { FetchDiagnosticCode } from "@/lib/scheduledWriterRunSafety";

export type AlertSourceType = "website" | "pdf" | "rss" | "other";

export interface AlertSource {
  id: string;
  name: string;
  /** Nullable in the database — a source can be registered before its
   *  official URL is known (see docs/sql seed data). Every consumer must
   *  handle the null case explicitly, never assume a string. */
  url: string | null;
  category: AlertCategory;
  sourceType: AlertSourceType;
  isActive: boolean;
  notes?: string;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertSourceInput {
  name: string;
  url: string;
  category: AlertCategory;
  sourceType: AlertSourceType;
  notes?: string;
}

// Sprint 172 (proposed — requires PROPOSED_SPRINT_172_SOURCE_CHECK_FAILURE_
// PERSISTENCE_V1.sql to be applied before "failed" can actually be written;
// see docs/SPRINT_172_SOURCE_HEALTH_PERSISTENCE_V1.md). "failed" represents
// a manual check attempt that could not complete (fetch/parse error), as
// opposed to a completed check that simply found nothing.
export type SourceCheckResult =
  | "no_changes"
  | "found_notice"
  | "alert_created"
  | "needs_followup"
  | "failed";

export interface SourceCheck {
  id: string;
  sourceId: string;
  checkedAt: string;
  result: SourceCheckResult;
  notes?: string;
  relatedAlertId?: string;
  createdBy?: string;
  createdAt: string;
  /** Sprint 172 (proposed): set only when result === "failed". Matches
   *  FetchDiagnosticCode — never a raw exception or stack trace. */
  errorCode?: FetchDiagnosticCode;
  /** Sprint 172 (proposed): set only when result === "failed". The same
   *  already-curated, admin-facing Polish message the check panel showed
   *  at the time, capped at 200 chars. Never raw HTML, a stack trace, a
   *  token, a cookie, or an Authorization header value. */
  errorSummary?: string;
}

export interface SourceCheckInput {
  sourceId: string;
  result: SourceCheckResult;
  notes?: string;
  relatedAlertId?: string;
  errorCode?: FetchDiagnosticCode;
  errorSummary?: string;
}
