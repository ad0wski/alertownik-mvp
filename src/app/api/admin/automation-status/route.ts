import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/serverAuth";
import { isScheduledChecksEnabled } from "@/lib/cronCheckSources";
import {
  isWriteModeEnabled,
  getAllowedWriteSourceIds,
  getMaxCandidatesPerInvocation,
  isContentFingerprintEnabled,
} from "@/lib/scheduledWriter";
import { getConfiguredDatabaseEnvironmentTag } from "@/lib/databaseEnvironmentGuard";
import { buildAutomationStatus, type AutomationStatusSnapshot } from "@/lib/automationStatus";
import {
  buildRunHistorySnapshot,
  notConfiguredRunHistorySnapshot,
  type RunHistoryRow,
} from "@/lib/runHistoryStatus";
import type { RunOutcome } from "@/lib/scheduledWriterRunSafety";

// Sprint 164B — GET /api/admin/automation-status. Admin-only (same
// requireAdminSession gate as /api/admin/link-health), read-only,
// informational: reports whether the two independent write kill switches
// are on/off and whether credentials/secret are CONFIGURED — never their
// values. No candidate, alert, or source row is read, created, or
// modified by this route; it only inspects environment variable
// presence and the existing safe-check allowlist.
//
// Sprint 166D-2B — additionally reads (SELECT-only, via the caller's own
// admin-session-scoped client and the existing
// scheduled_writer_runs_admin_select RLS policy — no migration, no policy
// change) the most recent run history for THIS deployment's own
// environment_tag only (getConfiguredDatabaseEnvironmentTag() — never
// guessed, never a literal default). If that tag cannot be resolved, no
// query is attempted at all — the response honestly reports
// runHistory.configured === false rather than guessing. Only a fixed,
// explicit column list is ever selected (never a wildcard/star select), and
// error_summary is never among them — it is structurally impossible for
// this route to forward that column's contents to the browser because it
// is never read from the database in the first place.

export type AutomationStatusResponse =
  | { ok: true; status: AutomationStatusSnapshot }
  | { ok: false; error: string };

export async function GET(req: NextRequest): Promise<NextResponse<AutomationStatusResponse>> {
  const auth = await requireAdminSession<AutomationStatusResponse>(req);
  if (!auth.ok) return auth.response;

  // Read-only run history — only attempted when this deployment's own
  // environment_tag is actually configured; never guessed, never falls
  // back to a literal like "unknown" or "preview". A failed/empty query
  // degrades to the same honest "not configured"/empty snapshot as an
  // unconfigured tag — never surfaced as an error, matching this route's
  // existing "never throw, never leak detail" convention.
  const environmentTag = getConfiguredDatabaseEnvironmentTag();
  let runHistory = notConfiguredRunHistorySnapshot();
  if (environmentTag) {
    try {
      const { data, error } = await auth.client
        .from("scheduled_writer_runs")
        .select("id, started_at, finished_at, trigger, environment_tag, outcome, sources_checked, sources_failed")
        .order("started_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(5);

      if (!error && data) {
        const rows: RunHistoryRow[] = data.map((row) => ({
          id: row.id as string,
          startedAt: row.started_at as string,
          finishedAt: row.finished_at as string | null,
          trigger: row.trigger as RunHistoryRow["trigger"],
          environmentTag: row.environment_tag as string,
          outcome: row.outcome as RunOutcome | null,
          sourcesChecked: row.sources_checked as number,
          sourcesFailed: row.sources_failed as number,
        }));
        runHistory = buildRunHistorySnapshot(rows, environmentTag);
      }
    } catch {
      // Network/unexpected failure — fail closed to the same honest
      // "not configured" shape, never an error detail in the response.
      runHistory = notConfiguredRunHistorySnapshot();
    }
  }

  const status = buildAutomationStatus({
    checksEnabled: isScheduledChecksEnabled(process.env.SCHEDULED_CHECKS_ENABLED),
    writesEnabled: isWriteModeEnabled(process.env.SCHEDULED_WRITES_ENABLED),
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    writerCredentialsConfigured: Boolean(
      process.env.SUPABASE_SCHEDULED_WRITER_EMAIL && process.env.SUPABASE_SCHEDULED_WRITER_PASSWORD
    ),
    allowedWriteSourceIds: getAllowedWriteSourceIds(),
    maxCandidatesPerRun: getMaxCandidatesPerInvocation(),
    fingerprintProtectionEnabled: isContentFingerprintEnabled(),
    runHistory,
  });

  return NextResponse.json({ ok: true, status });
}
