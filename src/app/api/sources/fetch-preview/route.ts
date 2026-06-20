import { NextRequest, NextResponse } from "next/server";
import { parsePageHtml, type PageCandidate } from "@/lib/sourceParsers/pageParser";

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

export async function POST(req: NextRequest): Promise<NextResponse<FetchPreviewResponse>> {
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

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ ok: false, error: "Nieprawidlowy URL." }, { status: 422 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json(
      { ok: false, error: "Obslugiwane sa tylko adresy http i https." },
      { status: 422 }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let html: string;
  try {
    const response = await fetch(url, {
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
        error: `Strona zwróciła błąd HTTP ${response.status}. Sprawdź, czy adres URL jest poprawny (np. czy nie zawiera nieprawidłowo zakodowanych znaków) — otwórz go ręcznie w przeglądarce, żeby się przekonać.`,
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

    const raw = await response.text();
    html = raw.slice(0, 500_000);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({
        ok: false,
        error: "Strona nie odpowiada (timeout 10 s). Sprawdz URL lub sprobuj pozniej.",
      });
    }
    console.error("[sources/fetch-preview] fetch error:", err);
    return NextResponse.json({
      ok: false,
      error: "Nie udalo sie pobrac strony. Sprawdz URL lub polaczenie sieciowe.",
    });
  }

  const { title, candidates, rawText, feedUrl } = parsePageHtml(html, url);

  return NextResponse.json({
    ok: true,
    pageTitle: title,
    url,
    fetchedAt: new Date().toISOString(),
    candidates,
    rawText,
    feedUrl,
  });
}
