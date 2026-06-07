import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { AlertCategory, AlertSeverity } from "@/types/alert";
import { normalizeAlertSeverity } from "@/lib/normalizeAlert";

// ── Public types ─────────────────────────────────────────────────────────────

// Shape matches what Builder's importFromJson / sessionStorage flow expects
export interface AlertDraft {
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  slug: string;
  place: string;
  startsAt: string;
  endsAt: string | null;
  change: string;
  action: string;
  sourceName: string;
  sourceUrl: string | null;
}

export type DraftAlertResponse =
  | { ok: true;  draft: AlertDraft; mode: "mock" | "anthropic"; warnings: string[] }
  | { ok: false; error: string };

// ── AI config ─────────────────────────────────────────────────────────────────
// Server-only: process.env.ANTHROPIC_API_KEY is never exposed to the browser.
// Do NOT rename to NEXT_PUBLIC_ANTHROPIC_API_KEY — that would expose it client-side.

const AI_DRAFT_MODEL = "claude-haiku-4-5-20251001";

const AI_SYSTEM_PROMPT = `Jesteś asystentem aplikacji Alertownik — lokalnego serwisu z alertami dla mieszkańców Polski.
Przekształcasz komunikaty urzędowe i lokalne w ustrukturyzowany alert JSON.

Zwróć TYLKO obiekt JSON. Bez komentarzy, bez markdown, bez żadnego tekstu przed ani po JSON.

Schemat wyjściowy:
{
  "category": "transport" | "water" | "power" | "waste" | "roads" | "municipal",
  "severity": "info" | "warning" | "urgent",
  "title": "<krótki tytuł po polsku, max 60 znaków>",
  "slug": "<url-slug: małe litery ASCII, myślniki zamiast spacji i polskich liter>",
  "place": "<dokładna lokalizacja z ulicą lub rejonem — jeśli brak w komunikacie: pusty string \"\">",
  "startsAt": "<data YYYY-MM-DD — jeśli data nie jest podana w komunikacie: null>",
  "endsAt": "<data YYYY-MM-DD — jeśli data zakończenia nie jest podana: null>",
  "change": "<co dokładnie się zmienia — 1–3 krótkie zdania po polsku>",
  "action": "<co mieszkaniec powinien zrobić — 1–2 krótkie zdania po polsku>",
  "sourceName": "<nazwa instytucji lub źródła — użyj nazwy z metadanych jeśli podana>",
  "sourceUrl": "<URL źródła — użyj URL z metadanych jeśli podany, w przeciwnym razie null>"
}

Zasady:
1. Pisz prostym językiem dla mieszkańca — krótkie zdania, zero urzędowego stylu. Piszesz dla kogoś czytającego na telefonie, nie dla urzędu.
2. severity: "urgent" = awaria lub zagrożenie bezpieczeństwa; "warning" = planowane utrudnienie lub zmiana wymagająca przygotowania; "info" = informacja bez pilności.
3. Nie wymyślaj faktów. Używaj tylko informacji z komunikatu źródłowego.
4. startsAt: jeśli data nie jest podana w komunikacie, wpisz null — nie wpisuj dzisiejszej daty jako domysłu.
5. place: jeśli lokalizacja nie jest podana w komunikacie, zostaw pusty string "" — nie zgaduj adresu.
6. Pole "change": opisuje co konkretnie się zmienia lub dzieje (fakty, nie oceny).
7. Pole "action": opisuje co mieszkaniec powinien zrobić w odpowiedzi (zalecenie praktyczne).
8. Nie dodawaj pola sourceId — jest uzupełniane przez aplikację.
9. Nie zwracaj żadnych dodatkowych pól poza wymienionym schematem.`;

// ── Category detection ───────────────────────────────────────────────────────

const VALID_CATEGORIES: AlertCategory[] = [
  "transport", "water", "power", "waste", "roads", "municipal",
];

const CATEGORY_KEYWORDS: { category: AlertCategory; keywords: string[] }[] = [
  {
    category: "transport",
    keywords: [
      "wkd", "pkp", "kolej", "pociąg", "pociagi", "autobus", "tramwaj",
      "metro", "komunikacja", "kurs", "rozkład", "objazd", "linia nr",
    ],
  },
  {
    category: "water",
    keywords: [
      "woda", "wodociąg", "wodociagi", "dostawa wody", "sieć wodociągowa",
      "awaria wodna", "hydrauliczny",
    ],
  },
  {
    category: "power",
    keywords: [
      "prąd", "energia elektryczna", "energa", "pge", "tauron", "enea",
      "innogy", "wyłączenie prądu", "dostawa energii", "stacja transformatorowa",
    ],
  },
  {
    category: "waste",
    keywords: [
      "odpady", "śmieci", "odbiór odpadów", "harmonogram odbioru",
      "segregacja", "pojemnik", "zbieranie odpadów",
    ],
  },
  {
    category: "roads",
    keywords: [
      "remont drogi", "remont ulicy", "roboty drogowe", "zamknięcie drogi",
      "ruch drogowy", "nawierzchnia", "chodnik", "objazd drogowy",
    ],
  },
];

function detectCategory(text: string, suggested?: string): AlertCategory {
  if (suggested && (VALID_CATEGORIES as string[]).includes(suggested)) {
    return suggested as AlertCategory;
  }
  const lower = text.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return "municipal";
}

// Normalize a raw category string from AI output
function normalizeCategory(raw: unknown, suggested: string | undefined): AlertCategory {
  const lower = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  if ((VALID_CATEGORIES as string[]).includes(lower)) return lower as AlertCategory;
  if (suggested && (VALID_CATEGORIES as string[]).includes(suggested)) return suggested as AlertCategory;
  return "municipal";
}

// ── Severity detection ───────────────────────────────────────────────────────

const URGENT_KEYWORDS = [
  "awaria", "pilne", "natychmiastowo", "zagrożenie", "niebezpiecz",
  "nagły", "alarm", "bez wody", "bez prądu",
];

const WARNING_KEYWORDS = [
  "uwaga", "planowane", "przerwa", "utrudnienie", "zmiana trasy",
  "ograniczenie", "wyłączenie", "remont", "zamknięcie", "korekta",
];

function detectSeverity(text: string): AlertSeverity {
  const lower = text.toLowerCase();
  if (URGENT_KEYWORDS.some((k) => lower.includes(k))) return "urgent";
  if (WARNING_KEYWORDS.some((k) => lower.includes(k))) return "warning";
  return "info";
}

// ── Text helpers ─────────────────────────────────────────────────────────────

const POLISH_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "a", Ć: "c", Ę: "e", Ł: "l", Ń: "n", Ó: "o", Ś: "s", Ź: "z", Ż: "z",
};

function toSlug(text: string): string {
  const slug = text
    .split("")
    .map((c) => POLISH_MAP[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `alert-${Date.now()}`;
}

// Trim to max length, cutting at the last whole word
function trimAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…";
}

// Extract a short title from the first sentence of sourceText
function extractTitle(text: string): string {
  const firstLine = text.split(/\n/)[0].trim();
  const firstSentence = firstLine.split(/[.!?]/)[0].trim();
  return trimAtWord(firstSentence, 60) || "Alert lokalny";
}

// Category-specific default action suggestions
const CATEGORY_ACTIONS: Record<AlertCategory, string> = {
  transport:
    "Sprawdź aktualny rozkład jazdy przed wyjściem. " +
    "Uwzględnij ewentualne opóźnienia lub zmiany trasy.",
  water:
    "Zaopatrz się w wodę pitną przed przerwą. " +
    "W pilnych sprawach skontaktuj się z administratorem lub urzędem gminy.",
  power:
    "Odłącz wrażliwe urządzenia elektryczne przed przerwą. " +
    "Po przywróceniu zasilania sprawdź sprzęt.",
  waste:
    "Sprawdź zaktualizowany harmonogram odbioru odpadów " +
    "i odpowiednio przygotuj pojemniki.",
  roads:
    "Stosuj się do oznakowania na miejscu. " +
    "Uwzględnij utrudnienia w planowaniu trasy.",
  municipal:
    "Sprawdź aktualne informacje u podanego źródła " +
    "i stosuj się do zaleceń.",
};

// ── AI response helpers ───────────────────────────────────────────────────────

// Strip markdown code fences if the model accidentally wrapped its JSON
function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  // Also strip leading/trailing non-JSON text before the first {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

// Build result type — tracks what the AI actually provided vs what was filled in
interface BuildResult {
  draft: AlertDraft;
  dateFromAi: boolean;
  placeFromAi: boolean;
}

// Sanitize and normalize a raw object from the AI into a valid AlertDraft.
// Returns null if the draft is missing required content.
function buildAiDraft(
  raw: Record<string, unknown>,
  fallbackSourceName: string,
  fallbackSourceUrl: string | null,
  suggestedCategory: string | undefined,
  today: string,
): BuildResult | null {
  const category = normalizeCategory(raw.category, suggestedCategory);

  const rawSeverity = normalizeAlertSeverity(raw.severity);
  const severity: AlertSeverity = rawSeverity ?? detectSeverity(
    [raw.change, raw.title].filter((v) => typeof v === "string").join(" ")
  );

  const title = typeof raw.title === "string" && raw.title.trim()
    ? trimAtWord(raw.title.trim(), 80)
    : "Alert lokalny";

  const rawSlug = typeof raw.slug === "string" ? raw.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") : "";
  const slug = rawSlug || toSlug(title);

  const rawPlace = typeof raw.place === "string" ? raw.place.trim() : "";
  const place = rawPlace;
  const placeFromAi = rawPlace.length > 0;

  // Accept null from the improved prompt — startsAt null means date unknown
  const rawStartsAt = raw.startsAt;
  const startsAtIsValid =
    typeof rawStartsAt === "string" &&
    rawStartsAt !== "null" &&
    /^\d{4}-\d{2}-\d{2}/.test(rawStartsAt);
  const startsAt = startsAtIsValid ? (rawStartsAt as string).slice(0, 10) : today;
  const dateFromAi = startsAtIsValid;

  const endsAt = typeof raw.endsAt === "string" && raw.endsAt !== "null" && /^\d{4}-\d{2}-\d{2}/.test(raw.endsAt)
    ? raw.endsAt.slice(0, 10)
    : null;

  const change = typeof raw.change === "string" && raw.change.trim()
    ? raw.change.trim()
    : "";
  if (!change) return null; // change is required — without it the draft is unusable

  const action = typeof raw.action === "string" && raw.action.trim()
    ? raw.action.trim()
    : CATEGORY_ACTIONS[category];

  const sourceName = typeof raw.sourceName === "string" && raw.sourceName.trim()
    ? raw.sourceName.trim()
    : fallbackSourceName;

  const sourceUrl = typeof raw.sourceUrl === "string" && raw.sourceUrl.trim() && raw.sourceUrl !== "null"
    ? raw.sourceUrl.trim()
    : fallbackSourceUrl;

  const draft: AlertDraft = {
    category, severity, title, slug, place, startsAt, endsAt, change, action, sourceName, sourceUrl,
  };

  return { draft, dateFromAi, placeFromAi };
}

// Generate admin warnings for fields that are missing or need manual verification
function computeWarnings(
  category: AlertCategory,
  dateFromAi: boolean,
  placeFromAi: boolean,
  sourceName: string,
): string[] {
  const warnings: string[] = [];
  if (!dateFromAi) {
    warnings.push("Brakuje dokładnej daty — uzupełnij datę w Kreatorze przed publikacją.");
  }
  if (!placeFromAi) {
    warnings.push("Brakuje dokładnej lokalizacji — uzupełnij miejsce w Kreatorze.");
  }
  if (category === "transport") {
    warnings.push("Sprawdź, czy trasa i kierunek przejazdu są poprawne.");
  }
  if (!sourceName) {
    warnings.push("Brakuje nazwy źródła — uzupełnij je w Kreatorze przed publikacją.");
  }
  return warnings;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse<DraftAlertResponse>> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Nieprawidłowe żądanie — oczekiwano JSON." },
      { status: 400 }
    );
  }

  const sourceText = (typeof body.sourceText === "string" ? body.sourceText : "").trim();
  if (!sourceText) {
    return NextResponse.json(
      { ok: false, error: "Pole sourceText jest wymagane i nie może być puste." },
      { status: 422 }
    );
  }

  const suggestedCategory =
    typeof body.suggestedCategory === "string" ? body.suggestedCategory : undefined;
  const sourceName =
    typeof body.sourceName === "string" ? body.sourceName.trim() : "";
  const sourceUrl =
    typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  const today = new Date().toISOString().split("T")[0];

  // ── Real AI mode (requires ANTHROPIC_API_KEY in server environment) ──────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey });

      const parts: string[] = [`Komunikat źródłowy:\n${sourceText}`];
      if (sourceName) parts.push(`Nazwa źródła: ${sourceName}`);
      if (sourceUrl)  parts.push(`URL źródła: ${sourceUrl}`);
      if (suggestedCategory) parts.push(`Sugerowana kategoria: ${suggestedCategory}`);
      parts.push(`Dzisiejsza data (tylko dla orientacji, nie używaj jako daty startsAt jeśli komunikat nie podaje daty): ${today}`);

      const message = await client.messages.create({
        model: AI_DRAFT_MODEL,
        max_tokens: 1024,
        system: AI_SYSTEM_PROMPT,
        messages: [{ role: "user", content: parts.join("\n") }],
      });

      const firstBlock = message.content[0];
      const responseText =
        firstBlock !== undefined && firstBlock.type === "text" ? firstBlock.text : "";

      const jsonText = extractJson(responseText);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return NextResponse.json({ ok: false, error: "AI zwróciło draft w nieprawidłowym formacie." });
      }

      const result = buildAiDraft(parsed, sourceName, sourceUrl || null, suggestedCategory, today);
      if (!result) {
        return NextResponse.json({ ok: false, error: "AI zwróciło draft w nieprawidłowym formacie." });
      }

      const { draft, dateFromAi, placeFromAi } = result;
      const warnings = computeWarnings(draft.category, dateFromAi, placeFromAi, draft.sourceName);

      return NextResponse.json({ ok: true, draft, mode: "anthropic", warnings });
    } catch (err) {
      console.error("[ai/draft-alert] Anthropic API error:", err);
      return NextResponse.json({
        ok: false,
        error: "Nie udało się połączyć z API AI. Spróbuj ponownie lub użyj ręcznego promptu.",
      });
    }
  }

  // ── Mock mode (no API key configured) ────────────────────────────────────
  const category = detectCategory(sourceText, suggestedCategory);
  const severity  = detectSeverity(sourceText);
  const title     = extractTitle(sourceText);

  const draft: AlertDraft = {
    category,
    severity,
    title,
    slug:       toSlug(title),
    place:      "",
    startsAt:   today,
    endsAt:     null,
    change:     trimAtWord(sourceText, 200),
    action:     CATEGORY_ACTIONS[category],
    sourceName: sourceName,
    sourceUrl:  sourceUrl || null,
  };

  return NextResponse.json({ ok: true, draft, mode: "mock", warnings: [] });
}
