import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/serverAuth";
import { isScheduledChecksEnabled } from "@/lib/cronCheckSources";
import {
  isWriteModeEnabled,
  getAllowedWriteSourceIds,
  getMaxCandidatesPerInvocation,
  isContentFingerprintEnabled,
} from "@/lib/scheduledWriter";
import { buildAutomationStatus, type AutomationStatusSnapshot } from "@/lib/automationStatus";

// Sprint 164B — GET /api/admin/automation-status. Admin-only (same
// requireAdminSession gate as /api/admin/link-health), read-only,
// informational: reports whether the two independent write kill switches
// are on/off and whether credentials/secret are CONFIGURED — never their
// values. No candidate, alert, or source row is read, created, or
// modified by this route; it only inspects environment variable
// presence and the existing safe-check allowlist.

export type AutomationStatusResponse =
  | { ok: true; status: AutomationStatusSnapshot }
  | { ok: false; error: string };

export async function GET(req: NextRequest): Promise<NextResponse<AutomationStatusResponse>> {
  const auth = await requireAdminSession<AutomationStatusResponse>(req);
  if (!auth.ok) return auth.response;

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
  });

  return NextResponse.json({ ok: true, status });
}
