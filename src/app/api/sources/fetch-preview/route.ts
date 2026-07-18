import { NextRequest, NextResponse } from "next/server";
import {
  parsePageHtml,
  describePageFetchFailure,
  type PageCandidate,
} from "@/lib/sourceParsers/pageParser";
import { requireAdminSession } from "@/lib/serverAuth";
import { guardedFetch, readLimitedText } from "@/lib/ssrfGuard";

// ── Public types ──────────────────────────────────────────────────────────────

export type SourceCandidate = PageCandidate;

export type FetchPreviewResponse =
  | {
      ok: true;
      pageTitle: string;
      url: string;
      fetchedAt: string;
      candidates: SourceCandidate[];
      rawText: string;
      /** Detected via <link rel="alternate" type="application/rss|atom+xml">
       *  in the page's own <head> — lightweight discovery only, no feed is
       *  ever fetched or parsed here. */
      feedUrl?: string;
    }
  | { ok: false; error: string };

// ── Route handler ─────────────────────────────────────────────────────────────
// HTML parsing itself lives in src/lib/sourceParsers/pageParser.ts (Sprint 76)
// — kept separate from this route so it's a pure, unit-testable function and
// so the "page" strategy is a swappable piece of src/lib/sourceParsers'
// strategy abstraction (see that directory's index.ts).
//
// Sprint 161 — this route accepts an arbitrary admin-supplied URL, which
// makes it the one server-side fetch in the app that isn't restricted to a
// server-owned allowlist. It is now gated behind requireAdminSession and the
// actual fetch goes through guardedFetch (src/lib/ssrfGuard.ts), which
// blocks private/loopback/link-local/metadata targets and re-validates every
// redirect hop instead of trusting the first check alone.

const MAX_RESPONSE_BYTES = 2_000_000;

export async function POST(req: NextRequest): Promise<NextResponse<FetchPreviewResponse>> {
  const auth = await requireAdminSession<FetchPreviewResponse>(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Nieprawidlowe zadanie." }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ ok: false, error: "Brak URL." }, { status: 422 });
  }
  if (url.length > 2000) {
    return NextResponse.json({ ok: false, error: "URL jest za dlugi." }, { status: 422 });
  }

  const result = await guardedFetch(url);
  if (!result.ok) {
    if (result.reason === "timeout") {
      return NextResponse.json({
        ok: false,
        error: "Strona nie odpowiada (timeout 10 s). Sprawdz URL lub sprobuj pozniej.",
      });
    }
    if (result.reason === "invalid_url" || result.reason === "unsupported_protocol") {
      return NextResponse.json(
        { ok: false, error: "Nieprawidlowy URL. Obslugiwane sa tylko adresy http i https." },
        { status: 422 }
      );
    }
    if (
      result.reason === "private_ip" ||
      result.reason === "blocked_hostname" ||
      result.reason === "credentials_in_url" ||
      result.reason === "dns_resolution_failed" ||
      result.reason === "invalid_redirect_target" ||
      result.reason === "redirect_without_location" ||
      result.reason === "too_many_redirects"
    ) {
      // Deliberately generic — never confirms/denies why a target was
      // rejected, so this can't be used to fingerprint internal network
      // layout via response differences.
      return NextResponse.json(
        { ok: false, error: "Ten adres nie moze zostac sprawdzony." },
        { status: 422 }
      );
    }
    console.error("[sources/fetch-preview] fetch error:", result.reason);
    return NextResponse.json({
      ok: false,
      error: "Nie udalo sie pobrac strony. Sprawdz URL lub polaczenie sieciowe.",
    });
  }

  const { response, finalUrl } = result;

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
      error: `Strona zwrocila typ ${typeName} zamiast HTML. Mozna otworzyc reczenie.`,
    });
  }

  const raw = await readLimitedText(response, MAX_RESPONSE_BYTES);
  const html = raw.slice(0, 500_000);

  const { title, candidates, rawText, feedUrl } = parsePageHtml(html, finalUrl);

  return NextResponse.json({
    ok: true,
    pageTitle: title,
    url: finalUrl,
    fetchedAt: new Date().toISOString(),
    candidates,
    rawText,
    feedUrl,
  });
}
