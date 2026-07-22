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
  DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR,
} from "@/lib/databaseEnvironmentGuard";
import { fetchAndParseProposals } from "@/lib/scheduledSourceFetch";
import type { SafeCheckSourceId } from "@/lib/sourceCheck";

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
  const results = await Promise.all(
    sources.map(async (source) => {
      const sourceKey = source.id as SafeCheckSourceId;
      try {
        const fetched = await fetchAndParseProposals(source.officialUrl);
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
        };
      }
    })
  );

  const failedOutcomes = new Set(["fetch_error", "timeout", "parse_error", "write_error"]);

  return NextResponse.json({
    ok: true,
    dryRun: false,
    checkedAt: new Date().toISOString(),
    checkedSources: results.length,
    successfulSources: results.filter((r) => !failedOutcomes.has(r.outcome)).length,
    failedSources: results.filter((r) => failedOutcomes.has(r.outcome)).length,
    proposalsFound: results.reduce((sum, r) => sum + r.proposalsFound, 0),
    candidatesInserted: results.reduce((sum, r) => sum + r.candidatesInserted, 0),
    duplicatesSkipped: results.reduce((sum, r) => sum + r.duplicatesSkipped, 0),
    ambiguousCandidates: results.reduce((sum, r) => sum + r.ambiguousCandidates, 0),
    cappedSkipped: results.reduce((sum, r) => sum + r.cappedSkipped, 0),
    sourceChecksInserted: results.reduce((sum, r) => sum + r.sourceChecksInserted, 0),
    duplicatesPreventedByDatabase: results.reduce((sum, r) => sum + r.duplicatesPreventedByDatabase, 0),
    published: false,
    message:
      "Zapisano wyłącznie kandydatów ze statusem 'pending' i wpisy historii sprawdzeń — " +
      "żaden alert nie został utworzony ani opublikowany.",
    results,
  });
}
