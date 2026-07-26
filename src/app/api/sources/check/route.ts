import { NextRequest, NextResponse } from "next/server";
import { getSafeCheckSource, UNSUPPORTED_SOURCE_ERROR, type CheckProposal } from "@/lib/sourceCheck";
import { requireAdminSession } from "@/lib/serverAuth";
import { fetchAndParseManualCheck } from "@/lib/manualSourceCheckFetch";

// Sprint 134 (A2) — manual Source Check API for allowlisted safe official
// sources (Sprint 139: exactly two — Gmina Michałowice komunikaty + WKD
// aktualności). Twin of /api/sources/fetch-preview with one deliberate hardening:
// the client sends only a sourceKey — the URL comes exclusively from the
// server-side allowlist (src/lib/sourceCheck.ts), so this route can never
// be pointed at an arbitrary address.
//
// This route only PROPOSES candidates. It performs no database writes:
// saving a candidate (status `pending`) and logging the check happen in the
// admin's browser through their authenticated Supabase session, under the
// existing admin-only RLS — zero new secrets, zero service_role (see
// Obsidian: Manual Candidate Create API Design § Autoryzacja). No cron
// calls this; the only trigger is the admin's button on /admin/sources.
//
// Sprint 167 — the actual fetch/parse/retry logic now lives in
// fetchAndParseManualCheck (src/lib/manualSourceCheckFetch.ts), which
// applies the same bounded-retry policy (one retry, transient failures
// only) the scheduled writer's own fetchAndParseProposals already uses —
// see that module's header for the full rationale. Every admin-facing
// message this route returns is unchanged from before this sprint.

export type SourceCheckApiResponse =
  | {
      ok: true;
      source: { key: string; name: string; url: string; category: string };
      pageTitle: string;
      fetchedAt: string;
      proposals: CheckProposal[];
    }
  | { ok: false; error: string };

export async function POST(req: NextRequest): Promise<NextResponse<SourceCheckApiResponse>> {
  const auth = await requireAdminSession<SourceCheckApiResponse>(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const sourceKey = typeof body.sourceKey === "string" ? body.sourceKey.trim() : "";
  const source = getSafeCheckSource(sourceKey);
  if (!source) {
    return NextResponse.json(
      { ok: false, error: UNSUPPORTED_SOURCE_ERROR },
      { status: 422 }
    );
  }

  const result = await fetchAndParseManualCheck({ officialUrl: source.officialUrl, apiUrl: source.apiUrl });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.message });
  }

  return NextResponse.json({
    ok: true,
    source: {
      key: source.id,
      name: source.name,
      url: source.officialUrl,
      category: source.category,
    },
    pageTitle: result.pageTitle,
    fetchedAt: new Date().toISOString(),
    proposals: result.proposals,
  });
}
