import { NextRequest, NextResponse } from "next/server";
import {
  checkCronAuth,
  isScheduledChecksEnabled,
  buildDryRunSummary,
  checkOneSource,
} from "@/lib/cronCheckSources";
import { getSafeCheckSource, type SafeCheckSourceId } from "@/lib/sourceCheck";

// Sprint 153 — Michałowice-only cron wrapper.
//
// Vercel's official vercel.json `crons[].path` spec ("must start with `/`",
// https://vercel.com/docs/project-configuration/vercel-json#crons) never
// documents query-string support, and every example in Vercel's docs uses a
// plain or dynamic-segment path — never `?sourceKey=...`. Rather than rely on
// undocumented behavior for the first real Production cron wiring, this
// route hardcodes the single source instead of accepting a query filter, so
// vercel.json can point at a bare path with zero ambiguity.
//
// Same fail-closed kill switch, same CRON_SECRET auth, same zero-write
// dry-run summary as /api/cron/check-sources — this file only fixes the
// source selection and reuses checkOneSource from src/lib/cronCheckSources.ts
// so the fetch/parse logic itself is never duplicated.

const MICHALOWICE_SOURCE_KEY: SafeCheckSourceId = "michalowice-komunikaty";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const source = getSafeCheckSource(MICHALOWICE_SOURCE_KEY);
  if (!source) {
    return NextResponse.json(
      { ok: false, error: "Endpoint nieskonfigurowany." },
      { status: 503 }
    );
  }

  const result = await checkOneSource(MICHALOWICE_SOURCE_KEY, source.name, source.officialUrl);

  return NextResponse.json(buildDryRunSummary([result]));
}
