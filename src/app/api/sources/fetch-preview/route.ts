import { NextRequest, NextResponse } from "next/server";

// ── Public types ──────────────────────────────────────────────────────────────

export interface SourceCandidate {
  heading?: string;
  text: string;
}

export type FetchPreviewResponse =
  | {
      ok: true;
      pageTitle: string;
      url: string;
      fetchedAt: string;
      candidates: SourceCandidate[];
      rawText: string;
    }
  | { ok: false; error: string };

// ── HTML parsing helpers ──────────────────────────────────────────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, "...")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&[a-zA-Z]+;/g, " ");
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface Block {
  type: "heading" | "para";
  level?: number;
  text: string;
}

function extractBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const tagRx = /<(h[1-3]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;

  while ((m = tagRx.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const text = stripTags(m[2]).replace(/\s+/g, " ").trim();
    if (!text || text.length < 5) continue;

    if (tag.startsWith("h")) {
      blocks.push({ type: "heading", level: parseInt(tag[1], 10), text });
    } else if (text.length > 40) {
      blocks.push({ type: "para", text });
    }
  }

  return blocks;
}

function buildCandidates(blocks: Block[]): SourceCandidate[] {
  const candidates: SourceCandidate[] = [];
  let i = 0;

  while (i < blocks.length && candidates.length < 8) {
    const b = blocks[i];

    if (b.type === "heading") {
      const paras: string[] = [];
      let j = i + 1;
      while (j < blocks.length && blocks[j].type === "para" && paras.length < 3) {
        paras.push(blocks[j].text.slice(0, 600));
        j++;
      }
      if (paras.length > 0) {
        candidates.push({
          heading: b.text.slice(0, 120),
          text: paras.join("\n\n"),
        });
        i = j;
        continue;
      }
      i++;
    } else {
      if (b.text.length > 80) {
        candidates.push({ text: b.text.slice(0, 800) });
      }
      i++;
    }
  }

  return candidates;
}

function parseHtml(html: string): {
  title: string;
  candidates: SourceCandidate[];
  rawText: string;
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]).trim().slice(0, 120) : "";

  // Remove boilerplate sections before extracting content
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");

  // Prefer <main> or <article> if present, otherwise use the full stripped body
  const mainMatch =
    stripped.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ??
    stripped.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ??
    stripped.match(/<div[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  const content = mainMatch ? mainMatch[1] : stripped;
  const blocks = extractBlocks(content);
  const candidates = buildCandidates(blocks);

  const rawText = blocks
    .filter((b) => b.text.length > 30)
    .map((b) => (b.type === "heading" ? "\n" + b.text + "\n" : b.text))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 5000)
    .trim();

  return { title, candidates, rawText };
}

// ── Route handler ─────────────────────────────────────────────────────────────

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

  const { title, candidates, rawText } = parseHtml(html);

  return NextResponse.json({
    ok: true,
    pageTitle: title,
    url,
    fetchedAt: new Date().toISOString(),
    candidates,
    rawText,
  });
}
