import { NextRequest, NextResponse } from "next/server";
import {
  checkCronAuth,
  isScheduledChecksEnabled,
  resolveCronSources,
  buildDryRunSummary,
  checkOneSource,
} from "@/lib/cronCheckSources";
import type { SafeCheckSourceId } from "@/lib/sourceCheck";

// Sprint 142 — Protected Cron-Compatible Dry-Run Endpoint v1.
//
// GET (not POST) because Vercel Cron invokes its targets with a GET
// request — matching that convention means this route can be wired to
// vercel.json's `crons` array later with zero handler changes, once
// Sprint 143/144's approval gates are cleared. Nothing about that wiring
// happens in this sprint: no vercel.json exists, no CRON_SECRET is set in
// any environment, and this route performs ZERO database writes — see
// docs/SCHEDULED_CHECKS_ARCHITECTURE_V1.md and
// docs/PROTECTED_CRON_DRY_RUN_ENDPOINT_V1.md.
//
// This file intentionally never imports any Supabase persistence helper or
// the candidate verifier — a dry run has no reason to touch any of them,
// and their absence here is itself part of the zero-write guarantee (see
// tests/e2e/cronCheckSourcesRoute.spec.ts's static import audit).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Kill switch first — cheapest check, and independent of whether the
  // caller's token would otherwise be valid. Disabled by default; no value
  // is configured anywhere as part of this sprint.
  if (!isScheduledChecksEnabled(process.env.SCHEDULED_CHECKS_ENABLED)) {
    return NextResponse.json(
      { ok: false, error: "Zaplanowane sprawdzenia są wyłączone." },
      { status: 503 }
    );
  }

  const auth = checkCronAuth(req.headers.get("authorization"), process.env.CRON_SECRET);
  if (!auth.ok) {
    if (auth.reason === "not_configured") {
      return NextResponse.json(
        { ok: false, error: "Endpoint nieskonfigurowany." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const sourceKeyFilter = req.nextUrl.searchParams.get("sourceKey");
  const sources = resolveCronSources(sourceKeyFilter);

  const results = await Promise.all(
    sources.map((source) => checkOneSource(source.id as SafeCheckSourceId, source.name, source.officialUrl))
  );

  return NextResponse.json(buildDryRunSummary(results));
}
