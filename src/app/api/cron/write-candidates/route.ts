import { NextRequest, NextResponse } from "next/server";
import { parsePageHtml } from "@/lib/sourceParsers/pageParser";
import {
  checkCronAuth,
  isScheduledChecksEnabled,
  resolveCronSources,
  CRON_FETCH_TIMEOUT_MS,
} from "@/lib/cronCheckSources";
import { buildCheckProposals } from "@/lib/sourceCheck";
import {
  isWriteModeEnabled,
  getScheduledWriterCredentials,
  signInScheduledWriter,
  getRegistrySourceId,
  getAllowedWriteSourceIds,
  createSupabaseScheduledWriter,
  writeCandidatesForSource,
} from "@/lib/scheduledWriter";
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
// DEFAULT-DISABLED AT THREE INDEPENDENT LAYERS (all must be true; today,
// none are) — see src/lib/scheduledWriter.ts's file header for the full
// explanation of each:
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

interface FetchOutcomeFailure {
  ok: false;
  outcome: "fetch_error" | "timeout";
  diagnostic: string;
}

interface FetchOutcomeSuccess {
  ok: true;
  proposals: ReturnType<typeof buildCheckProposals>;
}

async function fetchAndParseProposals(officialUrl: string): Promise<FetchOutcomeFailure | FetchOutcomeSuccess> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CRON_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(officialUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Alertownik-Monitor/1.0 (scheduled writer)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return { ok: false, outcome: "fetch_error", diagnostic: response.status >= 500 ? "http_5xx" : "http_4xx" };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return { ok: false, outcome: "fetch_error", diagnostic: "non_html_content_type" };
    }
    const raw = await response.text();
    const html = raw.slice(0, 500_000);
    const parse = parsePageHtml(html, officialUrl);
    return { ok: true, proposals: buildCheckProposals(parse) };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      outcome: isTimeout ? "timeout" : "fetch_error",
      diagnostic: isTimeout ? "timeout_10s" : "network_error",
    };
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const results = await Promise.all(
    sources.map(async (source) => {
      const sourceKey = source.id as SafeCheckSourceId;
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
    })
  );

  const failedOutcomes = new Set(["fetch_error", "timeout", "parse_error"]);

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
    published: false,
    message:
      "Zapisano wyłącznie kandydatów ze statusem 'pending' i wpisy historii sprawdzeń — " +
      "żaden alert nie został utworzony ani opublikowany.",
    results,
  });
}
