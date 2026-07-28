import type { AlertCategory } from "@/types/alert";
import type {
  RiskLevel,
  VerificationStatus,
} from "@/types/sourceCandidate";
import { OFFICIAL_SOURCE_CHECKS } from "@/lib/officialSourceChecklist";
import { detectDateInText, findSimilarText } from "@/lib/candidateWarnings";

// Sprint 135 (A3) — Candidate Verifier v1: deterministic, rule-based,
// fully client-side. It ADVISES; it never publishes, never creates drafts,
// and never changes a candidate's status — recommendations are acted on
// exclusively through the existing manual buttons.
//
// Deliberately structured as an implementation of a generic verifier
// contract so a real AI model can be plugged in later without touching the
// queue UI: a future aiVerifyCandidate() (server-side, via
// /api/ai/verify-candidate — requires Adam's explicit approval of API cost
// per the A3 gate in the Automation Implementation Plan) returns the same
// CandidateVerification shape with verificationStatus: "ai_verified".
// This one is honest about what it is: verificationStatus "auto_checked".

// ── Contract ──────────────────────────────────────────────────────────────────

export type VerifierRecommendation = "approve" | "needs_review" | "reject";

export interface CandidateVerifierInput {
  title: string;
  sourceUrl?: string;
  excerpt?: string;
  rawText?: string;
}

export interface CandidateVerifierContext {
  /** Titles of existing alerts (published + drafts) — duplicate pool. */
  alertTitles: string[];
  /** Texts of OTHER candidates in the queue — duplicate pool. */
  otherCandidateTexts: string[];
}

export interface CandidateVerification {
  recommendation: VerifierRecommendation;
  /** 0–100, clamped to 5–95: a heuristic never claims certainty. */
  confidence: number;
  riskLevel: RiskLevel;
  detectedCategory: AlertCategory | null;
  hasSourceUrl: boolean;
  isOfficialDomain: boolean;
  hasDateSignal: boolean;
  duplicateRisk: "none" | "possible";
  /** The similar existing text when duplicateRisk is "possible". */
  duplicateMatch: string | null;
  /** Short Polish reasons, one per applied rule — shown as the report. */
  reasons: string[];
  /** One-line Polish summary. */
  summary: string;
  verificationStatus: VerificationStatus;
}

/** Shared shape for this and any future (AI) verifier implementation. */
export type CandidateVerifier = (
  input: CandidateVerifierInput,
  context: CandidateVerifierContext
) => CandidateVerification;

// ── Official domains ──────────────────────────────────────────────────────────

// Derived from the canonical checklist config, so adding an official source
// there automatically teaches the verifier its domain. www. is stripped on
// both sides of the comparison.
export const OFFICIAL_DOMAINS: string[] = Array.from(
  new Set(
    OFFICIAL_SOURCE_CHECKS.map((s) => {
      try {
        return new URL(s.officialUrl).hostname.toLowerCase().replace(/^www\./, "");
      } catch {
        return "";
      }
    }).filter(Boolean)
  )
);

export function isOfficialSourceDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

// ── Category detection ────────────────────────────────────────────────────────

// Order matters: first match wins, so the more specific utility categories
// come before the roads/municipal catch-alls. Keywords are lowercase and
// diacritic-exact (candidate texts come from official Polish pages).
const CATEGORY_KEYWORDS: [AlertCategory, string[]][] = [
  ["water", ["wody", "woda", "wodociąg", "kanaliza", "ciepłej wody", "cwu", "hydrofor"]],
  ["power", ["prąd", "prądu", "energii elektrycznej", "wyłączeni", "elektryczn", "pge"]],
  ["waste", ["odpad", "śmieci", "harmonogram odbioru", "segregacj", "wywóz"]],
  ["transport", ["wkd", "pociąg", "kolej", "autobus", "rozkład jazdy", "komunikacj"]],
  // Sprint 180C forensic finding: "drog" alone misses "drodze" (the
  // locative/dative case of "droga" — Polish's g→dz consonant alternation
  // means this inflected form contains no "g" at all), which is exactly
  // the form the real DW 719 candidate text uses ("na drodze
  // wojewódzkiej"). Added explicitly rather than loosening the "drog"
  // stem itself, so no other word gains an unintended match.
  ["roads", ["drog", "drodze", "ulic", "remont", "objazd", "frezowanie", "ruchu drogow", "przejazd"]],
];

export function detectCandidateCategory(text: string): AlertCategory | null {
  const lower = text.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return null;
}

// ── Rule-based verifier v1 ────────────────────────────────────────────────────

const MIN_TEXT_LENGTH = 40;
const SOLID_TEXT_LENGTH = 120;
const APPROVE_CONFIDENCE_THRESHOLD = 75;

function clampConfidence(value: number): number {
  return Math.max(5, Math.min(95, Math.round(value)));
}

export const ruleBasedVerifyCandidate: CandidateVerifier = (input, context) => {
  const reasons: string[] = [];
  const fullText = [input.title, input.rawText || input.excerpt || ""].join("\n").trim();

  let confidence = 50;

  // 1. Source URL — hard project rule: no source = no candidate worth acting on.
  const hasSourceUrl = Boolean(input.sourceUrl?.trim());
  const officialDomain = hasSourceUrl && isOfficialSourceDomain(input.sourceUrl!);
  if (!hasSourceUrl) {
    reasons.push("Brak adresu źródła — bez oficjalnego linku nie publikujemy (twarda reguła).");
    confidence -= 30;
  } else if (officialDomain) {
    reasons.push("Źródło z oficjalnej domeny (checklista źródeł).");
    confidence += 20;
  } else {
    reasons.push(
      "Adres źródła spoza listy oficjalnych domen — sprawdź, czy to na pewno komunikat urzędu/instytucji."
    );
    confidence -= 20;
  }

  // 2. Date signal.
  const hasDateSignal = detectDateInText(fullText);
  if (hasDateSignal) {
    reasons.push("W treści wykryto datę.");
    confidence += 15;
  } else {
    reasons.push("Brak daty w treści — daty obowiązywania trzeba ustalić ręcznie przed szkicem.");
    confidence -= 10;
  }

  // 3. Category.
  const detectedCategory = detectCandidateCategory(fullText);
  if (detectedCategory) {
    reasons.push("Rozpoznano prawdopodobną kategorię na podstawie słów kluczowych.");
    confidence += 10;
  } else {
    reasons.push("Nie rozpoznano kategorii — wybierz ją ręcznie w szkicu.");
  }

  // 4. Text quality.
  const bodyLength = (input.rawText || input.excerpt || "").trim().length;
  if (bodyLength >= SOLID_TEXT_LENGTH) {
    reasons.push("Treść ma sensowną długość.");
    confidence += 5;
  } else if (bodyLength < MIN_TEXT_LENGTH) {
    reasons.push("Treść jest bardzo krótka — może być tylko nagłówkiem, nie komunikatem.");
    confidence -= 15;
  }

  // 5. Duplicates — against known alert titles and other queued candidates.
  const duplicateMatch =
    findSimilarText(fullText, context.alertTitles) ??
    findSimilarText(fullText, context.otherCandidateTexts);
  const duplicateRisk: CandidateVerification["duplicateRisk"] = duplicateMatch
    ? "possible"
    : "none";
  if (duplicateMatch) {
    reasons.push("Możliwy duplikat — bardzo podobna treść już istnieje (alert albo inny kandydat).");
    confidence -= 30;
  }

  confidence = clampConfidence(confidence);

  // ── Recommendation + risk (hard rules first, then the score) ──────────────
  let recommendation: VerifierRecommendation;
  let riskLevel: RiskLevel;

  if (!hasSourceUrl || bodyLength < MIN_TEXT_LENGTH) {
    // Hard failures: no source link (project rule) or effectively no content.
    recommendation = "reject";
    riskLevel = "high";
  } else if (duplicateMatch || !officialDomain) {
    // Un-verifiable by rules (unknown domain) or possibly already covered —
    // a human has to look; "unknown" is not the same as "bad".
    recommendation = "needs_review";
    riskLevel = "high";
  } else if (
    officialDomain &&
    hasDateSignal &&
    detectedCategory !== null &&
    confidence >= APPROVE_CONFIDENCE_THRESHOLD
  ) {
    recommendation = "approve";
    riskLevel = "low";
  } else {
    recommendation = "needs_review";
    riskLevel = "medium";
  }

  const summary =
    recommendation === "approve"
      ? "Wygląda dobrze — możesz utworzyć szkic. Decyzja i publikacja należą do Ciebie."
      : recommendation === "needs_review"
        ? "Do ręcznego przeglądu — porównaj z oficjalnym źródłem przed decyzją."
        : "Rekomendacja: odrzucić — nie spełnia twardych reguł (źródło/treść).";

  return {
    recommendation,
    confidence,
    riskLevel,
    detectedCategory,
    hasSourceUrl,
    isOfficialDomain: officialDomain,
    hasDateSignal,
    duplicateRisk,
    duplicateMatch,
    reasons,
    summary,
    verificationStatus: "auto_checked",
  };
};

// ── Copy (pinned by anti-drift tests) ─────────────────────────────────────────

export const VERIFIER_DISCLAIMER =
  "Weryfikator to pomocnik: sprawdza reguły (źródło, data, duplikaty) i doradza. " +
  "Nie publikuje, nie tworzy szkiców i nie zmienia statusu kandydata — każda decyzja " +
  "to Twój osobny klik, a publikacja wyłącznie ręcznie z Kreatora.";

export const RECOMMENDATION_LABELS: Record<VerifierRecommendation, string> = {
  approve: "Wygląda dobrze",
  needs_review: "Do przeglądu",
  reject: "Do odrzucenia",
};
