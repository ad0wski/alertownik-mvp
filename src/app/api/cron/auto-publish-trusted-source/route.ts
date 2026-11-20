import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth, isScheduledChecksEnabled } from "@/lib/cronCheckSources";
import {
  getScheduledWriterCredentials,
  signInScheduledWriter,
  createSupabaseScheduledWriter,
} from "@/lib/scheduledWriter";
import {
  checkDatabaseEnvironmentGuard,
  getConfiguredDatabaseEnvironmentTag,
  DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR,
} from "@/lib/databaseEnvironmentGuard";
import { createSupabaseScheduledWriterHistory, buildRunHistoryCloseUpdate } from "@/lib/scheduledWriterHistory";
import { resolveRunTrigger } from "@/lib/scheduledWriterRunSafety";
import { randomUUID } from "crypto";
import { isAnyAutomationStepOn, resolveAutomationCycleModes, runAutomationCycle } from "@/lib/autoAlertsCycle";
import { isOperationalNotificationRuntimeEnabled } from "@/lib/operationalNotificationRuntimeConfig";
import { createSupabaseOperationalNotificationLedger } from "@/lib/operationalNotificationLedgerSupabase";
import { createConfiguredNotificationAdapter } from "@/lib/notificationAdapterFactory";
import { notifyAutomationEvent } from "@/lib/operationalNotificationOrchestrator";

// Sprint 180C — Trusted Source Auto-Publish v1.
//
// GET /api/cron/auto-publish-trusted-source — a SEPARATE route from
// /api/cron/write-candidates, on purpose, for the same reason write-
// candidates was kept separate from the dry-run check-sources route
// (Sprint 147's own file-header comment): a bug or misconfiguration in
// one can never affect the other. This route never fetches a source page,
// never creates a candidate, and never touches SCHEDULED_WRITES_ENABLED —
// it only ever considers PRE-EXISTING pending candidates from the
// auto-publish allowlist and, at most, converts exactly one of them to a
// published alert.
//
// INDEPENDENT KILL SWITCHES (per CLAUDE.md Security Rule #10, Sprint
// 180C amendment — every condition must hold simultaneously; today only
// the first two are, everything else defaults closed):
//   0. Database/environment pairing guard (Sprint 165B) — same as every
//      other cron route.
//   1. SCHEDULED_CHECKS_ENABLED = "true" — the existing, shared "is
//      scheduled automation on at all" switch.
//   2. SCHEDULED_AUTO_PUBLISH_ENABLED = "true" — a NEW, independent
//      switch. Deliberately NOT SCHEDULED_WRITES_ENABLED: auto-publish
//      must be controllable without also toggling candidate creation, and
//      vice versa (CLAUDE.md's own explicit requirement).
//   3. CRON_SECRET-authenticated bearer token.
//   4. Scheduled-writer technical account credentials + a successful
//      automation_identities-gated sign-in.
//   5. The database-level INSERT/UPDATE policies from docs/sql/PROPOSED_
//      SPRINT_180C_TRUSTED_SOURCE_AUTO_PUBLISH_RLS_V1.sql — even if every
//      layer above were somehow bypassed, these policies (not this route)
//      are the actual enforcement boundary: a row that doesn't already
//      satisfy them is rejected with 42501, full stop. P0-2H.1 — live-
//      reconfirmed applied against Production on 2026-11-08 via
//      `pg_policies`; re-verify live before relying on this comment rather
//      than assuming either state indefinitely.
//
// Every actual decision (which candidate, whether it's eligible, what
// fields to publish) lives in trustedSourceAutoPublish.ts, testable there
// with a fully in-memory fake writer — this route only wires the real
// Supabase-backed writer in and manages the shared run-history lock.
//
// AUTO ALERTS V1 — this route now runs one automation cycle
// (src/lib/autoAlertsCycle.ts): stale-writer check, auto-archive of ended
// alerts, then the stricter V1 auto-publish gate (src/lib/autoAlertsV1.ts,
// michalowice-komunikaty only). No new cron. Each step has its own switch,
// all OFF by default:
//   - SCHEDULED_AUTO_PUBLISH_ENABLED=true  → live auto-publish (V1 gate)
//   - SCHEDULED_AUTO_ARCHIVE_ENABLED=true  → live auto-archive
//   - SCHEDULED_AUTOMATION_DRY_RUN=true    → BOTH steps evaluate and log
//     decisions to automation_decisions, with zero alert/candidate writes;
//     wins over the two live flags.
// The legacy runTrustedSourceAutoPublish() is no longer called by any route.
// Nothing here sends a push notification.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const environmentGuard = checkDatabaseEnvironmentGuard();
  if (!environmentGuard.ok) {
    return NextResponse.json({ ok: false, error: DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR }, { status: 503 });
  }

  const modes = resolveAutomationCycleModes();
  if (!isScheduledChecksEnabled(process.env.SCHEDULED_CHECKS_ENABLED) || !isAnyAutomationStepOn(modes)) {
    return NextResponse.json({ ok: false, error: "Automatyczna publikacja jest wyłączona." }, { status: 503 });
  }

  const auth = checkCronAuth(req.headers.get("authorization"), process.env.CRON_SECRET);
  if (!auth.ok) {
    if (auth.reason === "not_configured") {
      return NextResponse.json({ ok: false, error: "Endpoint nieskonfigurowany." }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const credentials = getScheduledWriterCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, error: "Automatyczna publikacja nie jest jeszcze skonfigurowana." }, { status: 503 });
  }

  const signIn = await signInScheduledWriter(credentials);
  if (!signIn.ok) {
    return NextResponse.json({ ok: false, error: "Automatyczna publikacja nie jest jeszcze skonfigurowana." }, { status: 503 });
  }

  const history = createSupabaseScheduledWriterHistory(signIn.client);
  const environmentTag = getConfiguredDatabaseEnvironmentTag() ?? "unknown";
  const runId = randomUUID();
  // P0-2B — same fix as write-candidates/route.ts: previously hardcoded
  // "manual" regardless of caller, even though Vercel Cron (vercel.json)
  // is this route's only configured caller. See resolveRunTrigger's own
  // doc comment (scheduledWriterRunSafety.ts).
  const trigger = resolveRunTrigger(req.headers.get("x-vercel-cron-schedule"));
  const openResult = await history.openRun(runId, trigger, environmentTag).catch(() => ({ opened: false }));
  if (!openResult.opened) {
    return NextResponse.json(
      { ok: false, error: "Poprzednie uruchomienie wciąż trwa.", reason: "lock_held" },
      { status: 503 }
    );
  }

  const writer = createSupabaseScheduledWriter(signIn.client);

  try {
    const cycle = await runAutomationCycle(writer, { modes, runId });
    const publishSkips = cycle.publish.decisions.filter((d) => d.decision === "skipped");
    const summary =
      `pub:${cycle.publish.mode}/${cycle.publish.status} arch:${cycle.archive.mode}/${cycle.archive.status}` +
      ` archived:${cycle.archive.archived.length} would_archive:${cycle.archive.wouldArchive.length}` +
      ` failed:${cycle.archive.failed.length} review:${cycle.notifications.length}`;

    await history
      .closeRun(
        runId,
        buildRunHistoryCloseUpdate({
          finishedAt: new Date().toISOString(),
          outcome: cycle.hadFailure ? "partial_failure" : "success",
          sourcesChecked: 0,
          sourcesFailed: 0,
          candidatesInserted: 0,
          duplicatesSkipped: publishSkips.filter((d) => d.reason === "duplicate").length,
          ambiguousCandidates: publishSkips.filter((d) => d.reason === "ambiguous").length,
          cappedSkipped: cycle.publish.decisions.filter((d) => d.decision === "deferred").length,
          duplicatesPreventedByDatabase: 0,
          errorSummary: summary.slice(0, 200),
        })
      )
      .catch(() => ({ ok: false }));

    if (
      cycle.notifications.length > 0 &&
      isOperationalNotificationRuntimeEnabled(process.env.OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED)
    ) {
      const ledger = createSupabaseOperationalNotificationLedger(signIn.client);
      const adapter = createConfiguredNotificationAdapter();
      for (const n of cycle.notifications) {
        await notifyAutomationEvent(ledger, adapter, {
          environmentTag,
          eventType: n.eventType,
          scheduledWriterRunId: runId,
          summary: n.summary,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      modes,
      writerStale: cycle.writerStale,
      publish: {
        status: cycle.publish.status,
        published: cycle.publish.status === "published",
        alertId: cycle.publish.alertId ?? null,
        decisions: cycle.publish.decisions,
        decisionLogFailures: cycle.publish.decisionLogFailures,
      },
      archive: cycle.archive,
      notifications: cycle.notifications.map((n) => n.eventType),
    });
  } catch {
    await history
      .closeRun(
        runId,
        buildRunHistoryCloseUpdate({
          finishedAt: new Date().toISOString(),
          outcome: "total_failure",
          sourcesChecked: 0,
          sourcesFailed: 0,
          candidatesInserted: 0,
          duplicatesSkipped: 0,
          ambiguousCandidates: 0,
          cappedSkipped: 0,
          duplicatesPreventedByDatabase: 0,
          errorSummary: "unexpected_error",
        })
      )
      .catch(() => ({ ok: false }));

    return NextResponse.json({ ok: false, error: "Nieoczekiwany błąd." }, { status: 500 });
  }
}
