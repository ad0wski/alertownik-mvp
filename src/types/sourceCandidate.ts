// Candidate data model v2 — mirrors
// docs/sprint132_candidate_persistence_schema_proposal.sql (PROPOSED, not
// applied; the v1 proposal docs/supabase_source_notice_candidates.sql was
// never applied either — confirmed live in Sprint 106S). See
// src/lib/supabaseCandidateWrites.ts for how the app behaves before the
// migration is run. Because the table has never existed in production,
// the code can adopt the v2 status enum directly — there is no v1 data to
// migrate and nothing that can break.

// v2 status flow (Sprint 130 data model + Sprint 132 brief):
//   pending → needs_review → approved → converted_to_draft → published
//           ↘ rejected                  (archived — porządki)
// `needs_review`/`approved` are set only by future flows (AI verifier A3,
// one-click approve A4). `published` is set ONLY by the existing manual
// publish in Builder — never by any automated path.
export type CandidateStatus =
  | "pending"
  | "needs_review"
  | "approved"
  | "rejected"
  | "converted_to_draft"
  | "published"
  | "archived";

// Kept as an alias so existing imports keep compiling; new code should
// prefer CandidateStatus.
export type SourceCandidateStatus = CandidateStatus;

export type RiskLevel = "low" | "medium" | "high";

export type VerificationStatus =
  | "unverified"
  | "auto_checked"
  | "ai_verified"
  | "human_verified"
  | "failed";

export interface SourceNoticeCandidate {
  id: string;
  sourceId?: string | null;
  sourceName: string;
  sourceUrl?: string;
  candidateUrl?: string;
  title: string;
  excerpt?: string;
  rawText?: string;
  detectedAt: string;
  status: CandidateStatus;
  convertedAlertId?: string | null;
  createdAt: string;
  updatedAt: string;

  // ── v2 fields (schema proposal, Sprint 132) — all optional so the same
  // type works before and after the migration; nothing in production sets
  // them until the table exists and later pipeline stages (A2/A3) run. ──
  sourceKey?: string;
  officialDomain?: string;
  rawTitle?: string;
  category?: string | null;
  severity?: string | null;
  locality?: string | null;
  place?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  change?: string | null;
  action?: string | null;
  confidenceScore?: number | null;
  riskLevel?: RiskLevel | null;
  verificationStatus?: VerificationStatus;
  verificationNotes?: string | null;
  duplicateOfAlertId?: string | null;
  checkedAt?: string | null;
}

export interface SourceNoticeCandidateInput {
  sourceId?: string | null;
  sourceName: string;
  sourceUrl?: string;
  candidateUrl?: string;
  title: string;
  excerpt?: string;
  rawText?: string;
}
