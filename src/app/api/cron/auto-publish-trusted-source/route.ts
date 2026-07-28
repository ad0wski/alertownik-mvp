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
import { isAutoPublishEnabled, runTrustedSourceAutoPublish } from "@/lib/trustedSourceAutoPublish";
import { randomUUID } from "crypto";

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
//   5. The (not yet applied — see docs/sql/PROPOSED_SPRINT_180C_TRUSTED_
//      SOURCE_AUTO_PUBLISH_RLS_V1.sql) database-level INSERT/UPDATE
//      policies — even if every layer above were somehow bypassed, an
//      unmigrated Production database still rejects every write with
//      42501. RLS remains the actual enforcement boundary, not this route.
//
// Every actual decision (which candidate, whether it's eligible, what
// fields to publish) lives in trustedSourceAutoPublish.ts, testable there
// with a fully in-memory fake writer — this route only wires the real
// Supabase-backed writer in and manages the shared run-history lock.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const environmentGuard = checkDatabaseEnvironmentGuard();
  if (!environmentGuard.ok) {
    return NextResponse.json({ ok: false, error: DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR }, { status: 503 });
  }

  if (
    !isScheduledChecksEnabled(process.env.SCHEDULED_CHECKS_ENABLED) ||
    !isAutoPublishEnabled(process.env.SCHEDULED_AUTO_PUBLISH_ENABLED)
  ) {
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
  const openResult = await history.openRun(runId, "manual", environmentTag).catch(() => ({ opened: false }));
  if (!openResult.opened) {
    return NextResponse.json(
      { ok: false, error: "Poprzednie uruchomienie wciąż trwa.", reason: "lock_held" },
      { status: 503 }
    );
  }

  const writer = createSupabaseScheduledWriter(signIn.client);

  try {
    const outcome = await runTrustedSourceAutoPublish(writer);

    await history
      .closeRun(
        runId,
        buildRunHistoryCloseUpdate({
          finishedAt: new Date().toISOString(),
          outcome: "success",
          sourcesChecked: 0,
          sourcesFailed: 0,
          candidatesInserted: 0,
          duplicatesSkipped: outcome.skipped.filter((s) => s.reason === "duplicate").length,
          ambiguousCandidates: outcome.skipped.filter((s) => s.reason === "ambiguous").length,
          cappedSkipped: 0,
          duplicatesPreventedByDatabase: 0,
          errorSummary:
            outcome.status === "insert_failed" || outcome.status === "mark_converted_failed"
              ? outcome.status
              : null,
        })
      )
      .catch(() => ({ ok: false }));

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      status: outcome.status,
      published: outcome.status === "published",
      candidateId: outcome.candidateId ?? null,
      alertId: outcome.alertId ?? null,
      skipped: outcome.skipped,
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
