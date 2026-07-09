import { NextRequest, NextResponse } from "next/server";
import {
  parsePageHtml,
  describePageFetchFailure,
} from "@/lib/sourceParsers/pageParser";
import {
  getSafeCheckSource,
  buildCheckProposals,
  UNSUPPORTED_SOURCE_ERROR,
  type CheckProposal,
} from "@/lib/sourceCheck";

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let html: string;
  try {
    const response = await fetch(source.officialUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Alertownik-Monitor/1.0 (admin source check)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        error: describePageFetchFailure(response.status),
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      const typeName = contentType.split(";")[0].trim() || "nieznany";
      return NextResponse.json({
        ok: false,
        error: `Źródło zwróciło typ ${typeName} zamiast HTML. Sprawdź stronę ręcznie w przeglądarce.`,
      });
    }

    const raw = await response.text();
    html = raw.slice(0, 500_000);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({
        ok: false,
        error: "Źródło nie odpowiada (timeout 10 s). Spróbuj później albo sprawdź stronę ręcznie.",
      });
    }
    console.error("[sources/check] fetch error:", err);
    return NextResponse.json({
      ok: false,
      error: "Nie udało się pobrać strony źródła. Spróbuj później albo sprawdź stronę ręcznie.",
    });
  }

  const parse = parsePageHtml(html, source.officialUrl);
  const proposals = buildCheckProposals(parse);

  return NextResponse.json({
    ok: true,
    source: {
      key: source.id,
      name: source.name,
      url: source.officialUrl,
      category: source.category,
    },
    pageTitle: parse.title,
    fetchedAt: new Date().toISOString(),
    proposals,
  });
}
