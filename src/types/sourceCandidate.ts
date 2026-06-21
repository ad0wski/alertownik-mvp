export type SourceCandidateStatus = "pending" | "ignored" | "converted" | "archived";

// Mirrors docs/supabase_source_notice_candidates.sql (proposed, not yet
// applied as of Sprint 78 — see src/lib/supabaseCandidateWrites.ts for how
// the app behaves before that migration is run).
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
  status: SourceCandidateStatus;
  convertedAlertId?: string | null;
  createdAt: string;
  updatedAt: string;
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
