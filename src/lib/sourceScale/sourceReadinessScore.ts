// Sprint 188A — National Source Scale Plan, foundation scoring only.
//
// Deterministic readiness scoring for a source under certification (the
// `testable`/`canary` stages of sourceLifecycle.ts). This module never
// performs a fetch itself — it consumes already-collected signals from a
// certification run (fetch attempt, parse attempt, sample candidates) and
// turns them into a single, explainable 0–100 score plus the list of
// signals that reduced it. Mirrors this codebase's existing "scoring is a
// pure function over already-known facts" pattern (e.g.
// ruleBasedVerifyCandidate in candidateVerifier.ts).
//
// A score alone never promotes a source's lifecycle status — see
// docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md §3.1: upward transitions always
// require a human decision. This module only informs that decision.

export interface SourceCertificationSignals {
  /** The configured fetch succeeded at least once against the live
   *  source (mirrors RawFetchResult.status === "ok"). */
  fetchSucceeded: boolean;
  /** The parser produced at least one candidate from the fetched
   *  content. */
  parserProducedCandidates: boolean;
  /** Number of candidates the parser produced in the sample run — used
   *  only to distinguish "one thin result" from "a healthy sample", never
   *  as a duplicate-detection input itself. */
  candidateCount: number;
  /** Fraction (0–1) of sampled candidates for which a date was detected
   *  (PageCandidate.hasDate) — a source whose notices are rarely dated
   *  degrades downstream date-based checks (e.g. auto-publish's
   *  extractStartDateIso) even though it can still be useful for manual
   *  review. */
  dateDetectionRate: number;
  /** True if the cross-table dedup classifier (classifyProposalAgainstExisting)
   *  found this sample's candidates were NOT all misclassified as
   *  duplicates of each other — a broken parser sometimes returns the
   *  same block N times, which dedup would otherwise silently mask as
   *  "working". */
  candidatesAreDistinctFromEachOther: boolean;
}

export type SourceReadinessReasonCode =
  | "fetch_failed"
  | "no_candidates_produced"
  | "low_candidate_sample"
  | "low_date_detection_rate"
  | "duplicate_candidates_in_sample";

export interface SourceReadinessScoreResult {
  score: number;
  reasons: SourceReadinessReasonCode[];
  /** Convenience flag: true only when score is high enough to reasonably
   *  present this source to a human for the `testable → canary` decision.
   *  This is advisory, not a gate — see this module's own top comment. */
  recommendedForReview: boolean;
}

const MIN_HEALTHY_CANDIDATE_SAMPLE = 2;
const MIN_HEALTHY_DATE_DETECTION_RATE = 0.5;
export const RECOMMENDED_FOR_REVIEW_THRESHOLD = 60;

/** Pure, deterministic scoring — same input always yields the same
 *  output. Weights are chosen so a single hard failure (fetch or parse)
 *  dominates the score, while soft signals (date detection, sample size)
 *  only shave points, never zero the score outright when the source is
 *  otherwise functional. */
export function computeSourceReadinessScore(
  signals: SourceCertificationSignals
): SourceReadinessScoreResult {
  const reasons: SourceReadinessReasonCode[] = [];

  if (!signals.fetchSucceeded) {
    return { score: 0, reasons: ["fetch_failed"], recommendedForReview: false };
  }

  if (!signals.parserProducedCandidates || signals.candidateCount === 0) {
    return { score: 5, reasons: ["no_candidates_produced"], recommendedForReview: false };
  }

  let score = 100;

  if (signals.candidateCount < MIN_HEALTHY_CANDIDATE_SAMPLE) {
    score -= 20;
    reasons.push("low_candidate_sample");
  }

  if (signals.dateDetectionRate < MIN_HEALTHY_DATE_DETECTION_RATE) {
    score -= 20;
    reasons.push("low_date_detection_rate");
  }

  if (!signals.candidatesAreDistinctFromEachOther) {
    score -= 30;
    reasons.push("duplicate_candidates_in_sample");
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasons,
    recommendedForReview: score >= RECOMMENDED_FOR_REVIEW_THRESHOLD,
  };
}
