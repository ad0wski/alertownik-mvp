// Lightweight, dependency-free helpers for flagging likely-duplicate or
// likely-stale candidate notices using only data already loaded by the
// queue/source-check UI — no new schema, no fuzzy-matching library.

const MONTHS_PL =
  "stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|wrze[sś]nia|pa[zź]dziernika|listopada|grudnia";

const DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/, // ISO: 2026-06-24
  /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/, // 24.06.2026 / 24/06/26
  new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS_PL})\\b`, "i"), // "24 czerwca"
];

export function detectDateInText(text: string): boolean {
  return DATE_PATTERNS.some((re) => re.test(text));
}

// Trim to max length at the last whole word instead of mid-word — used
// whenever free-form source text becomes a candidate/alert title, so the
// result reads cleanly instead of cutting off mid-word.
export function trimAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…";
}

// Same Polish-diacritic map already used by the slug helpers in
// builder.tsx / queue/page.tsx / api/ai/draft-alert route.ts — "ł" has no
// Unicode NFD decomposition, so a generic accent-stripping approach would
// silently drop it instead of folding it to "l".
const POLISH_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
};

// Exported (Sprint 150A) so src/lib/scheduledWriter.ts can derive a
// deterministic content fingerprint from EXACTLY this normalization —
// single source of truth, never a second reimplementation (e.g. in SQL)
// that could silently drift out of sync with this one over time.
export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((c) => POLISH_MAP[c] ?? c)
    .join("")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantWords(text: string): Set<string> {
  return new Set(normalizeForCompare(text).split(" ").filter((w) => w.length > 3));
}

// Word-overlap ratio, not real fuzzy matching — good enough to flag an
// obvious resemblance, not precise enough to auto-merge or auto-discard.
export function textSimilarity(a: string, b: string): number {
  const setA = significantWords(a);
  const setB = significantWords(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const w of setA) if (setB.has(w)) overlap++;
  return overlap / Math.min(setA.size, setB.size);
}

const SIMILARITY_THRESHOLD = 0.6;

export interface CandidateWarningInput {
  sourceUrl: string;
  notes?: string;
}

export interface CandidateWarningContext {
  /** Notes from the chronologically previous check of the same source, if any. */
  previousCheckNotes?: string;
  /** Titles of all known alerts (any status), for duplicate-resemblance checks. */
  alertTitles: string[];
}

export function getCandidateWarnings(
  candidate: CandidateWarningInput,
  context: CandidateWarningContext
): string[] {
  const warnings: string[] = [];
  const notes = candidate.notes?.trim() ?? "";

  if (!candidate.sourceUrl) {
    warnings.push("Brak linku źródła.");
  }
  if (!notes) {
    warnings.push("Brak treści notatki — niewiele do oceny.");
  } else if (!detectDateInText(notes)) {
    warnings.push("Nie wykryto daty w notatce — sprawdź, czy komunikat ma jasny termin.");
  }

  if (notes && context.previousCheckNotes) {
    const sim = textSimilarity(notes, context.previousCheckNotes);
    if (sim >= SIMILARITY_THRESHOLD) {
      warnings.push("Treść może być taka sama jak poprzednie sprawdzenie tego źródła.");
    }
  }

  if (notes) {
    for (const title of context.alertTitles) {
      if (!title) continue;
      if (textSimilarity(notes, title) >= SIMILARITY_THRESHOLD) {
        warnings.push(`Może powielać istniejący alert: „${title}".`);
        break; // one match is enough to flag — don't list every near-match
      }
    }
  }

  return warnings;
}

// Used when an admin is about to save a *new* persistent candidate (Sprint
// 78) — checks free-form text (a heading/excerpt) against a list of
// existing strings (other pending candidates' titles, or known alert
// titles) and returns the closest match above the threshold, or null.
// Same word-overlap heuristic as above, just exposed for a one-off check
// instead of building a full warnings list.
export function findSimilarText(text: string, candidates: string[]): string | null {
  let best: { text: string; score: number } | null = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const score = textSimilarity(text, candidate);
    if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
      best = { text: candidate, score };
    }
  }
  return best?.text ?? null;
}
