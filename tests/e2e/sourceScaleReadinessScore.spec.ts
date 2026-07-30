import { test, expect } from "@playwright/test";
import {
  computeSourceReadinessScore,
  RECOMMENDED_FOR_REVIEW_THRESHOLD,
  type SourceCertificationSignals,
} from "@/lib/sourceScale/sourceReadinessScore";

// Sprint 188A — National Source Scale Plan foundation. Pure unit tests,
// no network, no Supabase.

const HEALTHY_SIGNALS: SourceCertificationSignals = {
  fetchSucceeded: true,
  parserProducedCandidates: true,
  candidateCount: 5,
  dateDetectionRate: 0.8,
  candidatesAreDistinctFromEachOther: true,
};

test.describe("computeSourceReadinessScore", () => {
  test("healthy source scores 100 with no reasons", () => {
    const result = computeSourceReadinessScore(HEALTHY_SIGNALS);
    expect(result.score).toBe(100);
    expect(result.reasons).toEqual([]);
    expect(result.recommendedForReview).toBe(true);
  });

  test("failed fetch scores 0 and is never recommended", () => {
    const result = computeSourceReadinessScore({ ...HEALTHY_SIGNALS, fetchSucceeded: false });
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual(["fetch_failed"]);
    expect(result.recommendedForReview).toBe(false);
  });

  test("fetch ok but zero candidates scores near-zero and is never recommended", () => {
    const result = computeSourceReadinessScore({
      ...HEALTHY_SIGNALS,
      parserProducedCandidates: false,
      candidateCount: 0,
    });
    expect(result.score).toBe(5);
    expect(result.reasons).toEqual(["no_candidates_produced"]);
    expect(result.recommendedForReview).toBe(false);
  });

  test("thin candidate sample loses points but can still be recommended", () => {
    const result = computeSourceReadinessScore({ ...HEALTHY_SIGNALS, candidateCount: 1 });
    expect(result.score).toBe(80);
    expect(result.reasons).toEqual(["low_candidate_sample"]);
    expect(result.recommendedForReview).toBe(true);
  });

  test("low date detection rate loses points", () => {
    const result = computeSourceReadinessScore({ ...HEALTHY_SIGNALS, dateDetectionRate: 0.1 });
    expect(result.score).toBe(80);
    expect(result.reasons).toEqual(["low_date_detection_rate"]);
  });

  test("duplicate candidates in sample is the heaviest single penalty", () => {
    const result = computeSourceReadinessScore({
      ...HEALTHY_SIGNALS,
      candidatesAreDistinctFromEachOther: false,
    });
    expect(result.score).toBe(70);
    expect(result.reasons).toEqual(["duplicate_candidates_in_sample"]);
  });

  test("all soft penalties combined can drop below the review threshold", () => {
    const result = computeSourceReadinessScore({
      fetchSucceeded: true,
      parserProducedCandidates: true,
      candidateCount: 1,
      dateDetectionRate: 0.1,
      candidatesAreDistinctFromEachOther: false,
    });
    expect(result.score).toBe(30);
    expect(result.score).toBeLessThan(RECOMMENDED_FOR_REVIEW_THRESHOLD);
    expect(result.recommendedForReview).toBe(false);
  });

  test("score is always clamped to [0, 100]", () => {
    const result = computeSourceReadinessScore(HEALTHY_SIGNALS);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
