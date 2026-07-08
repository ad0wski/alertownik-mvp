import type { CandidateStatus } from "@/types/sourceCandidate";

// Polish labels for the v2 candidate status enum (Sprint 132 schema,
// applied 2026-07-08). Shared by /admin/queue and unit tests; /admin uses
// its own lowercase inline variant (different grammatical context).
// needs_review/approved are set only by future flows (AI verifier A3,
// one-click approve A4) — labeled here so such candidates are never
// invisible if they ever appear (e.g. manual SQL during testing).
export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  pending: "Oczekujące",
  needs_review: "Do przeglądu",
  approved: "Zatwierdzone",
  rejected: "Odrzucone",
  converted_to_draft: "Przekształcone w draft",
  published: "Opublikowane",
  archived: "Zarchiwizowane",
};
