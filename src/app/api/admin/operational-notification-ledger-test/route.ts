import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/serverAuth";
import {
  checkDatabaseEnvironmentGuard,
  getConfiguredDatabaseEnvironmentTag,
  DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR,
} from "@/lib/databaseEnvironmentGuard";
import { isOperationalNotificationLedgerTestEnabled } from "@/lib/operationalNotificationLedgerTestConfig";
import { getScheduledWriterCredentials, signInScheduledWriter } from "@/lib/scheduledWriter";
import { createSupabaseOperationalNotificationLedger } from "@/lib/operationalNotificationLedgerSupabase";
import { createConfiguredNotificationAdapter } from "@/lib/notificationAdapterFactory";
import {
  claimEventForSending,
  sendViaAdapter,
  finalizeOperationalNotificationEvent,
} from "@/lib/operationalNotificationOrchestrator";
import type { NotificationSendResult } from "@/lib/notificationAdapter";

// Sprint 166N-B — POST /api/admin/operational-notification-ledger-test.
//
// A narrow, admin-only, audited diagnostic that exercises exactly one real
// claim→finish cycle against the live operational_notification_events
// ledger RPCs, without depending on a real source ever failing and without
// creating a new scheduled_writer_runs row. Structurally parallel to the
// existing POST /api/admin/operational-email-test (Sprint 166E-2A) — see
// docs/SPRINT_166M_PRODUCTION_NOTIFICATION_CANARY_DESIGN_V1.md §4/5 for
// the full design this route implements.
//
// DEFAULT-DISABLED, AT EVERY LAYER, INDEPENDENTLY, mirroring
// write-candidates' own convention:
//   0. requireAdminSession — no unauthenticated or non-admin caller can
//      ever reach anything past this line.
//   1. checkDatabaseEnvironmentGuard() — same Layer 0 guard write-candidates
//      uses; this route can never run against a database it wasn't
//      explicitly paired with.
//   2. isOperationalNotificationLedgerTestEnabled() — its own dedicated
//      flag, OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED, deliberately
//      separate from OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED. Not set
//      anywhere as part of this sprint — default false everywhere.
//   3. getScheduledWriterCredentials() + signInScheduledWriter() — the
//      ledger RPCs are SECURITY DEFINER and check auth.uid() against
//      public.automation_identities; this route reuses the exact same
//      writer sign-in helper write-candidates uses (never a bypass-RLS
//      client, never the admin session itself, which is never a member of
//      automation_identities).
//
// The event this route claims uses a FIXED, existing OperationalNotificationEventType
// ("unexpected_error") rather than a new reserved diagnostic value — the
// real claim_operational_notification_event() RPC's own CHECK constraint
// enumerates a closed, fixed vocabulary (see
// docs/sql/PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql
// §5); adding a new value would be a schema change, out of scope for a
// code-only route and never done without the user's explicit request. The
// deliberately fixed, always-identical safe_summary and scopeKey
// ("ledger-test") make any such row unambiguous to a human admin reading
// the ledger, and the always-identical fingerprint IS the idempotency key:
// a second invocation within the ledger's own 6-hour cooldown window is
// suppressed exactly like a real duplicate, proving the dedup path works
// rather than merely asserting it does — no bespoke idempotency mechanism
// needed on top of the ledger's own.
//
// This route never imports writeCandidatesForSource, fetchAndParseProposals,
// or any Builder/alert-write helper — it cannot create a candidate or
// publish an alert no matter what. It always constructs the adapter via
// createConfiguredNotificationAdapter(), so it inherits the exact same
// OPERATIONAL_EMAIL_ALERTS_ENABLED gate as the real runtime path; running
// this diagnostic never bypasses that gate. Every response is a
// closed-vocabulary status string — never a raw error, stack trace, or
// ledger row content.

export type OperationalNotificationLedgerTestResponse =
  | { ok: true; status: "sent" | "disabled" | "abandoned" | "suppressed" }
  | { ok: false; status: "misconfigured" | "send_failed" }
  | { ok: false; error: string };

const LEDGER_TEST_SCOPE_KEY = "ledger-test";
const LEDGER_TEST_SAFE_SUMMARY =
  "Diagnostyczny test ledgera operacyjnego (Sprint 166N) — nie jest to prawdziwy incydent.";

function mapSendResultToResponse(sendResult: NotificationSendResult): OperationalNotificationLedgerTestResponse {
  switch (sendResult.status) {
    case "sent":
      return { ok: true, status: "sent" };
    case "send_failed":
      return { ok: false, status: "send_failed" };
    case "disabled":
    case "no_adapter_configured":
    case "suppressed_by_cooldown":
      return { ok: true, status: "abandoned" };
    default:
      return { ok: true, status: "abandoned" };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<OperationalNotificationLedgerTestResponse>> {
  const auth = await requireAdminSession<OperationalNotificationLedgerTestResponse>(req);
  if (!auth.ok) return auth.response;

  const environmentGuard = checkDatabaseEnvironmentGuard();
  if (!environmentGuard.ok) {
    return NextResponse.json({ ok: false, error: DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR }, { status: 503 });
  }

  if (!isOperationalNotificationLedgerTestEnabled(process.env.OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED)) {
    return NextResponse.json({ ok: true, status: "disabled" });
  }

  const credentials = getScheduledWriterCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, status: "misconfigured" }, { status: 503 });
  }

  const signIn = await signInScheduledWriter(credentials);
  if (!signIn.ok) {
    return NextResponse.json({ ok: false, status: "misconfigured" }, { status: 503 });
  }

  const environmentTag = getConfiguredDatabaseEnvironmentTag() ?? "unknown";

  try {
    const ledger = createSupabaseOperationalNotificationLedger(signIn.client);

    const claimResult = await claimEventForSending(ledger, {
      environmentTag,
      scopeKey: LEDGER_TEST_SCOPE_KEY,
      eventType: "unexpected_error",
      severity: "info",
      scheduledWriterRunId: null,
      sourceId: null,
      safeSummary: LEDGER_TEST_SAFE_SUMMARY,
    });

    if (!claimResult.claimed) {
      return NextResponse.json({ ok: true, status: "suppressed" });
    }

    const adapter = createConfiguredNotificationAdapter();
    const sendResult = await sendViaAdapter(adapter, {
      subject: "Alertownik — diagnostyczny test ledgera",
      textBody: LEDGER_TEST_SAFE_SUMMARY,
      fingerprint: `${environmentTag}:${LEDGER_TEST_SCOPE_KEY}:unexpected_error`,
    });

    await finalizeOperationalNotificationEvent(ledger, { eventId: claimResult.eventId, sendResult });

    return NextResponse.json(mapSendResultToResponse(sendResult));
  } catch {
    // Deliberately no exception detail in the response — same convention
    // as every other route in this codebase touching writer credentials.
    return NextResponse.json({ ok: false, error: "Nieoczekiwany błąd." }, { status: 503 });
  }
}
