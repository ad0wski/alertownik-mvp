import type { CandidateStatus } from "@/types/sourceCandidate";
import type { VerifierRecommendation } from "@/lib/candidateVerifier";

// Sprint 136 (A4, safe manual form) — single source of truth for WHICH
// review actions are available on a candidate in a given status. The
// CandidateCard renders buttons from these predicates, so the transition
// rules live here as pure, unit-testable functions instead of scattered
// JSX conditions.
//
// Transition model (mirrors the PATCH rules designed in Sprint 132's
// Manual Candidate Create API Design):
//   pending / needs_review → approved | rejected | archived
//   approved               → converted_to_draft (via Builder draft save)
//                            | rejected | back to pending (undo)
//   rejected / archived    → pending (restore)
//   converted_to_draft / published — no status actions (terminal here;
//   `published` is set ONLY by the manual publish click in Builder).
//
// Every transition below happens ONLY on an explicit admin click. The
// verifier's recommendation merely suggests which button to use — it
// never triggers one. There is no `duplicate` status in the enum
// (deliberately — duplicates carry duplicate_of_alert_id + a warning,
// and the human decision is usually "Odrzuć"); adding one would be a
// schema change and is out of scope.

const REVIEWABLE: CandidateStatus[] = ["pending", "needs_review"];

/** Verify (rule helper) makes sense while the candidate awaits a decision. */
export function canVerify(status: CandidateStatus): boolean {
  return REVIEWABLE.includes(status);
}

/** Explicit approval — marks "reviewed, worth a draft"; nothing else happens. */
export function canApprove(status: CandidateStatus): boolean {
  return REVIEWABLE.includes(status);
}

export function canReject(status: CandidateStatus): boolean {
  return REVIEWABLE.includes(status) || status === "approved";
}

export function canArchive(status: CandidateStatus): boolean {
  return REVIEWABLE.includes(status);
}

/** Restore to pending — also the undo for an accidental approval. */
export function canRestore(status: CandidateStatus): boolean {
  return status === "rejected" || status === "archived" || status === "approved";
}

/** Draft creation goes through Builder prefill + explicit save (existing
 *  flow); allowed pre-decision too, so the Sprint-78 path keeps working. */
export function canConvertToDraft(status: CandidateStatus): boolean {
  return REVIEWABLE.includes(status) || status === "approved";
}

export function canSendToAiHelper(status: CandidateStatus): boolean {
  return REVIEWABLE.includes(status) || status === "approved";
}

// ── Verifier recommendation → suggested (still manual) action ────────────────

export interface SuggestedAction {
  /** Polish hint shown in the verifier report panel. */
  hint: string;
  /** Status the suggested button would set; null = no status change involved. */
  targetStatus: CandidateStatus | null;
}

export function suggestedActionFor(recommendation: VerifierRecommendation): SuggestedAction {
  switch (recommendation) {
    case "approve":
      return {
        hint: "Sugerowana akcja: „Zatwierdź” — a potem „Utwórz draft z kandydata”.",
        targetStatus: "approved",
      };
    case "reject":
      return {
        hint: "Sugerowana akcja: „Odrzuć”.",
        targetStatus: "rejected",
      };
    case "needs_review":
      return {
        hint: "Sugerowana akcja: porównaj z oficjalnym źródłem; przy duplikacie — „Odrzuć”.",
        targetStatus: null,
      };
  }
}

// ── Copy (pinned by anti-drift tests) ─────────────────────────────────────────

export const APPROVED_CARD_NOTE =
  "Zatwierdzony do szkicu. Draft NIE jest publiczny — publikacja to osobny, " +
  "ręczny krok w Kreatorze, po weryfikacji źródła.";

export const APPROVE_BUTTON_LABEL = "Zatwierdź";
export const CONVERT_FROM_APPROVED_LABEL = "Utwórz draft z kandydata";
