import { NextRequest, NextResponse } from "next/server";
import type { AlertCategory, AlertSeverity } from "@/types/alert";

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
  | { ok: true;  draft: AlertDraft; mock: true }
  | { ok: false; error: string };

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

  const category = detectCategory(sourceText, suggestedCategory);
  const severity  = detectSeverity(sourceText);
  const title     = extractTitle(sourceText);

  const draft: AlertDraft = {
    category,
    severity,
    title,
    slug:       toSlug(title),
    place:      "",
    startsAt:   new Date().toISOString().split("T")[0],
    endsAt:     null,
    change:     trimAtWord(sourceText, 200),
    action:     CATEGORY_ACTIONS[category],
    sourceName: sourceName,
    sourceUrl:  sourceUrl || null,
  };

  return NextResponse.json({ ok: true, draft, mock: true });
}
