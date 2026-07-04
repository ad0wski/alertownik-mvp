import type { AlertSeverity } from "@/types/alert";

// Deterministic assessment logic for the "Draft from Source" operator flow
// (/admin/new-alert). Kept out of the page component so it stays
// unit-testable — same reasoning as alertQuality.ts and
// testContentDetection.ts. No AI calls here: this layer judges whatever
// draft came back (from /api/ai/draft-alert in mock OR anthropic mode)
// against the project's publish rules.

export type DraftRiskLevel = "low" | "medium" | "high";

export type DraftRecommendation = "draft-ok" | "needs-review" | "do-not-publish";

export interface DraftAssessment {
  risk: DraftRiskLevel;
  recommendation: DraftRecommendation;
  /** Human-readable reasons behind the risk/recommendation, in Polish. */
  reasons: string[];
}

export const RISK_LABELS_PL: Record<DraftRiskLevel, string> = {
  low: "niskie",
  medium: "średnie",
  high: "wysokie",
};

export const RECOMMENDATION_LABELS_PL: Record<DraftRecommendation, string> = {
  "draft-ok": "Można zapisać jako draft",
  "needs-review": "Wymaga ręcznego przeglądu",
  "do-not-publish": "Nie publikuj — najpierw uzupełnij braki",
};

export interface AssessableDraft {
  severity: AlertSeverity;
  sourceUrl: string | null;
  place: string;
}

function bumpRisk(risk: DraftRiskLevel): DraftRiskLevel {
  if (risk === "low") return "medium";
  return "high";
}

/**
 * Judge a generated draft against the project's publish rules.
 *
 * `qualityWarnings` is the combined warning list for this draft —
 * getPrePublishWarnings() output plus any warnings returned by the
 * /api/ai/draft-alert endpoint.
 */
export function assessDraft(
  draft: AssessableDraft,
  qualityWarnings: string[]
): DraftAssessment {
  const reasons: string[] = [];

  // Base risk follows severity: an urgent notice mis-published is worse
  // than an info notice mis-published.
  let risk: DraftRiskLevel =
    draft.severity === "urgent" ? "high" : draft.severity === "warning" ? "medium" : "low";
  if (draft.severity === "urgent") {
    reasons.push("Ważność „Pilne” — błąd w takim alercie kosztuje najwięcej zaufania.");
  } else if (draft.severity === "warning") {
    reasons.push("Ważność „Uwaga” — planowane utrudnienie, sprawdź daty i zakres.");
  }

  const suspicious = qualityWarnings.some((w) => w.includes("testowe/placeholder"));
  const missingSourceUrl = !draft.sourceUrl?.trim();

  if (missingSourceUrl) {
    risk = bumpRisk(risk);
    reasons.push("Brak linku do źródła — zasada projektu: bez źródła nie publikujemy.");
  }
  if (suspicious) {
    risk = bumpRisk(risk);
    reasons.push("Treść wygląda na testową/placeholder — nie może trafić na produkcję.");
  }
  if (!draft.place.trim()) {
    risk = bumpRisk(risk);
    reasons.push("Brak lokalizacji — mieszkaniec nie wie, czy alert go dotyczy.");
  }

  const otherWarnings = qualityWarnings.filter((w) => !w.includes("testowe/placeholder"));
  if (otherWarnings.length >= 3) {
    risk = bumpRisk(risk);
  }

  // Recommendation: hard rules first, then warning count.
  let recommendation: DraftRecommendation;
  if (missingSourceUrl || suspicious) {
    recommendation = "do-not-publish";
  } else if (qualityWarnings.length > 0) {
    recommendation = "needs-review";
    reasons.push("Lista ostrzeżeń nie jest pusta — przejrzyj każde przed publikacją.");
  } else {
    recommendation = "draft-ok";
    reasons.push("Brak ostrzeżeń automatycznych — nadal wymagana ręczna weryfikacja ze źródłem.");
  }

  return { risk, recommendation, reasons };
}

/**
 * Suggest a readable source name from a URL, e.g.
 * "https://wkd.com.pl/aktualnosci/..." → "wkd.com.pl".
 * Returns "" for empty/invalid URLs — the caller falls back to whatever
 * the AI extracted from the notice text.
 */
export function suggestSourceNameFromUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** True when the API's warning list says the notice had no explicit date. */
export function dateCameFromSource(apiWarnings: string[]): boolean {
  return !apiWarnings.some((w) => w.includes("Brakuje dokładnej daty"));
}
