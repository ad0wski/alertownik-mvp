import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  checkCronAuth,
  isScheduledChecksEnabled,
  resolveCronSources,
} from "@/lib/cronCheckSources";
import {
  isWriteModeEnabled,
  getScheduledWriterCredentials,
  signInScheduledWriter,
  getRegistrySourceId,
  getAllowedWriteSourceIds,
  createSupabaseScheduledWriter,
  writeCandidatesForSource,
} from "@/lib/scheduledWriter";
import {
  checkDatabaseEnvironmentGuard,
  getConfiguredDatabaseEnvironmentTag,
  DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR,
} from "@/lib/databaseEnvironmentGuard";
import { fetchAndParseProposals } from "@/lib/scheduledSourceFetch";
import { createSupabaseScheduledWriterHistory, buildRunHistoryCloseUpdate } from "@/lib/scheduledWriterHistory";
import { REST_PARSERS_BY_SOURCE_ID } from "@/lib/sourceParsers/pageParser";
import type { SafeCheckSourceId } from "@/lib/sourceCheck";
import type { RunOutcome } from "@/lib/scheduledWriterRunSafety";
import { isOperationalNotificationRuntimeEnabled } from "@/lib/operationalNotificationRuntimeConfig";
import { createSupabaseOperationalNotificationLedger } from "@/lib/operationalNotificationLedgerSupabase";
import { createConfiguredNotificationAdapter } from "@/lib/notificationAdapterFactory";
import { attemptOperationalNotification } from "@/lib/operationalNotificationOrchestrator";

// Sprint 166G-1 — off by default (OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED
// is not set in any environment as part of this sprint). See
// docs/SPRINT_166G_RUNTIME_LEDGER_INTEGRATION_AUDIT_AND_DESIGN_V1.md for
// the full design. This helper is called strictly AFTER history.closeRun()
// has already resolved (both call sites below) — never before — and can
// never affect this route's own response: attemptOperationalNotification
// already swallows every failure internally, and this wrapper's own
// try/catch is defense in depth against a failure constructing the ledger
// or adapter themselves (neither performs I/O during construction today).
async function runOperationalNotification(input: {
  environmentTag: string;
  runOutcome: RunOutcome;
  scheduledWriterRunId: string | null;
  sourcesFailed: number;
  sourcesChecked: number;
  writerClient: SupabaseClient;
}): Promise<void> {
  if (!isOperationalNotificationRuntimeEnabled(process.env.OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED)) {
    return;
  }
  try {
    const ledger = createSupabaseOperationalNotificationLedger(input.writerClient);
    const adapter = createConfiguredNotificationAdapter();
    await attemptOperationalNotification(ledger, adapter, {
      environmentTag: input.environmentTag,
      runOutcome: input.runOutcome,
      scheduledWriterRunId: input.scheduledWriterRunId,
      sourcesFailed: input.sourcesFailed,
      sourcesChecked: input.sourcesChecked,
    });
  } catch {
    // Never propagate — see file header comment above.
  }
}

// Sprint 147 — Scheduled Writer Foundation v1.
//
// GET /api/cron/write-candidates — the write-capable counterpart to the
// Sprint 142 dry-run endpoint (/api/cron/check-sources, UNCHANGED by this
// file — its own dry-run behavior and security model are preserved
// exactly as they are). Kept as a SEPARATE route, on purpose: the two
// endpoints share no kill switch and no auth failure mode, so a bug or
// misconfiguration in one can never affect the other. This was chosen
// over folding a "write mode" query parameter into the existing dry-run
// route because the dry-run route's entire safety story rests on
// "this route can never write" being true by inspection (no Supabase
// import at all, enforced by its own static-import test) — adding any
// conditional write path to that file would weaken that guarantee for
// every future reader, for the sake of one route instead of two. See
// docs/SCHEDULED_WRITER_FOUNDATION_V1.md §D for the full comparison.
//
// DEFAULT-DISABLED AT FOUR INDEPENDENT LAYERS (all must be true; today,
// none are) — see src/lib/scheduledWriter.ts's file header for the full
// explanation of layers 1-3, and src/lib/databaseEnvironmentGuard.ts for
// layer 0:
//   0. Sprint 165B — the database-environment pairing guard: the running
//      Vercel environment and the explicitly-configured
//      SUPABASE_ENVIRONMENT_TAG must both be known and must match. No
//      value is configured anywhere as part of Sprint 165B, so this layer
//      alone already blocks every environment today, independent of
//      layers 1-3. Checked first (cheapest, no I/O).
//   1. SCHEDULED_CHECKS_ENABLED = "true"  (existing switch, Sprint 142)
//   2. SCHEDULED_WRITES_ENABLED = "true"  (new, this sprint — separate)
//   3. SUPABASE_SCHEDULED_WRITER_EMAIL / SUPABASE_SCHEDULED_WRITER_PASSWORD
//      configured AND that account is a member of
//      public.automation_identities.
//
// This route never imports any alert-publishing, Builder/draft, or
// candidate-approval helper, never constructs a privileged bypass-RLS
// client, and never references the admin membership table — all actual
// insert/select logic lives in src/lib/scheduledWriter.ts, testable there
// with a fully in-memory fake writer (no network mocking needed).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Layer 0 (Sprint 165B): environment/database pairing guard — cheapest
  // check (no I/O), so it runs first. A generic error, identical shape to
  // the kill-switch response below, so a caller cannot distinguish "wrong
  // environment pairing" from "kill switch off" from the response alone.
  const environmentGuard = checkDatabaseEnvironmentGuard();
  if (!environmentGuard.ok) {
    return NextResponse.json({ ok: false, error: DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR }, { status: 503 });
  }

  // Layer 1 + 2: two independent kill switches, both required.
  if (
    !isScheduledChecksEnabled(process.env.SCHEDULED_CHECKS_ENABLED) ||
    !isWriteModeEnabled(process.env.SCHEDULED_WRITES_ENABLED)
  ) {
    return NextResponse.json({ ok: false, error: "Tryb zapisu jest wyłączony." }, { status: 503 });
  }

  const auth = checkCronAuth(req.headers.get("authorization"), process.env.CRON_SECRET);
  if (!auth.ok) {
    if (auth.reason === "not_configured") {
      return NextResponse.json({ ok: false, error: "Endpoint nieskonfigurowany." }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  // Layer 3: technical-account credentials + a successful sign-in against
  // policies that require automation_identities membership. Neither the
  // presence/absence of credentials nor the sign-in failure reason is
  // ever distinguished in the response — both return the same generic
  // message, so a caller cannot learn which specific precondition failed.
  const credentials = getScheduledWriterCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, error: "Tryb zapisu nie jest jeszcze skonfigurowany." }, { status: 503 });
  }

  const signIn = await signInScheduledWriter(credentials);
  if (!signIn.ok) {
    return NextResponse.json({ ok: false, error: "Tryb zapisu nie jest jeszcze skonfigurowany." }, { status: 503 });
  }

  // Sprint 166C, Stage 2b — atomic run history + concurrency lock. A single
  // call attempts to atomically open a new run row for this
  // (trigger, environmentTag) scope — see
  // docs/sql/PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql (NOT YET
  // EXECUTED) for the partial-unique-index + SECURITY DEFINER function
  // pair this now targets. `opened: false` covers both a genuine
  // lock-still-held conflict and any unexpected error calling the
  // function — this route treats both identically: fail closed, no
  // source fetch, no candidate write, ever. There is no separate
  // SELECT-then-decide step here on purpose — that TOCTOU-prone pattern
  // is exactly what this stage replaced.
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
  const sourceKeyFilter = req.nextUrl.searchParams.get("sourceKey");
  // Server-side source restriction, independent of the caller: even a
  // bare call (no ?sourceKey=, which would otherwise resolve every
  // allowlisted source including WKD) is narrowed down to only the
  // sources Adam has explicitly allowed for writing
  // (SCHEDULED_WRITER_ALLOWED_SOURCE_IDS — defaults to Michałowice only).
  // This cannot be widened by anything in the request itself.
  const allowedWriteSourceIds = new Set(getAllowedWriteSourceIds());
  const sources = resolveCronSources(sourceKeyFilter).filter((source) => allowedWriteSourceIds.has(source.id));

  // Sprint 149 hardening: one source's failure must never take down the
  // whole batch response. fetchAndParseProposals already turns network/
  // parse failures into a plain result object (never throws) — but
  // writeCandidatesForSource's own Supabase calls could still throw at
  // the network layer (DNS/connection failure, not just a Postgrest
  // error, which already resolves as { ok: false } without throwing).
  // Wrapping each source's whole pipeline in try/catch means a database
  // network error degrades to the same safe, honest per-source failure
  // shape as a source-page fetch failure — never an uncaught exception
  // that could turn this route's response into a framework error page.
  //
  // Sprint 166C: the whole block is now also wrapped so the run-history
  // row opened above is always closed — on the normal path (results
  // computed) or on a genuinely unexpected top-level error — releasing
  // the lock either way. A history/lock failure itself is still never
  // allowed to fail the request (see the .catch(() => ...) calls below).
  try {
    const results = await Promise.all(
      sources.map(async (source) => {
        const sourceKey = source.id as SafeCheckSourceId;
        try {
          const fetched = await fetchAndParseProposals({
            officialUrl: source.officialUrl,
            apiUrl: source.apiUrl,
            parseRestPosts: REST_PARSERS_BY_SOURCE_ID[source.id],
          });
          if (!fetched.ok) {
            return {
              sourceKey,
              sourceName: source.name,
              outcome: fetched.outcome,
              diagnostic: fetched.diagnostic,
              proposalsFound: 0,
              candidatesInserted: 0,
              duplicatesSkipped: 0,
              ambiguousCandidates: 0,
              cappedSkipped: 0,
              sourceChecksInserted: 0,
              duplicatesPreventedByDatabase: 0,
              blockedSyntheticContent: 0,
            };
          }

          const registrySourceId = getRegistrySourceId(sourceKey);
          const written = await writeCandidatesForSource(writer, {
            sourceKey,
            sourceName: source.name,
            sourceUrl: source.officialUrl,
            proposals: fetched.proposals,
            registrySourceId,
            writerUserId: signIn.userId,
          });

          return {
            sourceKey,
            sourceName: source.name,
            outcome: fetched.proposals.length > 0 ? ("success" as const) : ("no_proposals" as const),
            proposalsFound: fetched.proposals.length,
            ...written,
          };
        } catch {
          // Deliberately no exception detail in the response (no stack
          // trace, no error message) — same "safe, generic diagnostic
          // only" principle already applied to sign-in failures above.
          return {
            sourceKey,
            sourceName: source.name,
            outcome: "write_error" as const,
            diagnostic: "unexpected_error",
            proposalsFound: 0,
            candidatesInserted: 0,
            duplicatesSkipped: 0,
            ambiguousCandidates: 0,
            cappedSkipped: 0,
            sourceChecksInserted: 0,
            duplicatesPreventedByDatabase: 0,
            blockedSyntheticContent: 0,
          };
        }
      })
    );

    const failedOutcomes = new Set(["fetch_error", "timeout", "parse_error", "write_error"]);
    const sourcesFailed = results.filter((r) => failedOutcomes.has(r.outcome)).length;
    const sourcesChecked = results.length;
    const totalCandidatesInserted = results.reduce((sum, r) => sum + r.candidatesInserted, 0);
    const totalDuplicatesSkipped = results.reduce((sum, r) => sum + r.duplicatesSkipped, 0);
    const totalAmbiguousCandidates = results.reduce((sum, r) => sum + r.ambiguousCandidates, 0);
    const totalCappedSkipped = results.reduce((sum, r) => sum + r.cappedSkipped, 0);
    const totalDuplicatesPreventedByDatabase = results.reduce(
      (sum, r) => sum + r.duplicatesPreventedByDatabase,
      0
    );
    const totalBlockedSyntheticContent = results.reduce((sum, r) => sum + r.blockedSyntheticContent, 0);

    const outcome =
      sourcesFailed === 0
        ? ("success" as const)
        : sourcesFailed === sourcesChecked
          ? ("total_failure" as const)
          : ("partial_failure" as const);

    // Sprint 191 — a testContentGuard.ts block is never itself a source
    // failure (the source fetch/write both succeeded; a proposal was just
    // withheld), so it never changes `outcome` above. It still must stay
    // visible in run history (existing scheduled_writer_runs.error_summary
    // field, ≤200 chars, count only — never the blocked title/text itself)
    // rather than only ever appearing in this response's JSON body, which
    // an operator would have to have captured at request time to see.
    const errorSummaryParts: string[] = [];
    if (outcome !== "success") errorSummaryParts.push(`${sourcesFailed}/${sourcesChecked} sources failed`);
    if (totalBlockedSyntheticContent > 0) {
      errorSummaryParts.push(`${totalBlockedSyntheticContent} blocked (test/placeholder content)`);
    }

    await history
      .closeRun(
        runId,
        buildRunHistoryCloseUpdate({
          finishedAt: new Date().toISOString(),
          outcome,
          sourcesChecked,
          sourcesFailed,
          candidatesInserted: totalCandidatesInserted,
          duplicatesSkipped: totalDuplicatesSkipped,
          ambiguousCandidates: totalAmbiguousCandidates,
          cappedSkipped: totalCappedSkipped,
          duplicatesPreventedByDatabase: totalDuplicatesPreventedByDatabase,
          // Counts only — never a raw source URL, error message, or
          // stack trace, matching this route's existing "generic
          // diagnostic only" convention throughout.
          errorSummary: errorSummaryParts.length > 0 ? errorSummaryParts.join("; ") : null,
        })
      )
      .catch(() => ({ ok: false }));

    await runOperationalNotification({
      environmentTag,
      runOutcome: outcome,
      scheduledWriterRunId: runId,
      sourcesFailed,
      sourcesChecked,
      writerClient: signIn.client,
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      checkedAt: new Date().toISOString(),
      checkedSources: sourcesChecked,
      successfulSources: sourcesChecked - sourcesFailed,
      failedSources: sourcesFailed,
      proposalsFound: results.reduce((sum, r) => sum + r.proposalsFound, 0),
      candidatesInserted: totalCandidatesInserted,
      duplicatesSkipped: totalDuplicatesSkipped,
      ambiguousCandidates: totalAmbiguousCandidates,
      cappedSkipped: totalCappedSkipped,
      sourceChecksInserted: results.reduce((sum, r) => sum + r.sourceChecksInserted, 0),
      duplicatesPreventedByDatabase: totalDuplicatesPreventedByDatabase,
      blockedSyntheticContent: totalBlockedSyntheticContent,
      published: false,
      message:
        "Zapisano wyłącznie kandydatów ze statusem 'pending' i wpisy historii sprawdzeń — " +
        "żaden alert nie został utworzony ani opublikowany.",
      results,
    });
  } catch {
    // Genuinely unexpected top-level failure (should not normally happen —
    // every per-source path above already catches its own errors). Still
    // closes the run (releasing the lock) with an honest total_failure
    // outcome, and still never leaks exception detail in the response,
    // matching every other error path in this route.
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

    await runOperationalNotification({
      environmentTag,
      runOutcome: "total_failure",
      scheduledWriterRunId: runId,
      sourcesFailed: 0,
      sourcesChecked: 0,
      writerClient: signIn.client,
    });

    return NextResponse.json({ ok: false, error: "Nieoczekiwany błąd." }, { status: 500 });
  }
}
