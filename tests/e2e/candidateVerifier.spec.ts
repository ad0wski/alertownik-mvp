import { test, expect } from "@playwright/test";
import {
  ruleBasedVerifyCandidate,
  detectCandidateCategory,
  isOfficialSourceDomain,
  OFFICIAL_DOMAINS,
  VERIFIER_DISCLAIMER,
  RECOMMENDATION_LABELS,
  type CandidateVerifierContext,
} from "@/lib/candidateVerifier";

/**
 * Sprint 135 (A3) — unit-style tests for Candidate Verifier v1
 * (src/lib/candidateVerifier.ts). Pure function on mocked candidate
 * fixtures — no browser page, no dev server, no Supabase, NO live external
 * website. Fixture content is invented for the tests only.
 */

const EMPTY_CONTEXT: CandidateVerifierContext = {
  alertTitles: ["Utrudnienia na ulicy Testowej w Regułach"],
  otherCandidateTexts: [],
};

const GOOD_CANDIDATE = {
  title: "Przerwa w dostawie wody w Komorowie",
  sourceUrl: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/przerwa-wody",
  rawText:
    "W dniu 16 lipca 2026 r. w godzinach 8:00–14:00 nastąpi planowana przerwa " +
    "w dostawie wody dla mieszkańców Komorowa w związku z pracami na sieci " +
    "wodociągowej. Prosimy o zabezpieczenie zapasu wody na czas prac.",
};

test.describe("ruleBasedVerifyCandidate — recommendations", () => {
  test("solid official candidate → approve, low risk, high confidence, detected category", () => {
    const v = ruleBasedVerifyCandidate(GOOD_CANDIDATE, EMPTY_CONTEXT);
    expect(v.recommendation).toBe("approve");
    expect(v.riskLevel).toBe("low");
    expect(v.confidence).toBeGreaterThanOrEqual(75);
    expect(v.detectedCategory).toBe("water");
    expect(v.hasSourceUrl).toBe(true);
    expect(v.isOfficialDomain).toBe(true);
    expect(v.hasDateSignal).toBe(true);
    expect(v.duplicateRisk).toBe("none");
    expect(v.verificationStatus).toBe("auto_checked");
  });

  test("missing source URL → reject + high risk (hard project rule)", () => {
    const v = ruleBasedVerifyCandidate(
      { ...GOOD_CANDIDATE, sourceUrl: undefined },
      EMPTY_CONTEXT
    );
    expect(v.hasSourceUrl).toBe(false);
    expect(v.recommendation).toBe("reject");
    expect(v.riskLevel).toBe("high");
  });

  test("non-official domain (e.g. Facebook) → needs_review + high risk, never approve", () => {
    const v = ruleBasedVerifyCandidate(
      { ...GOOD_CANDIDATE, sourceUrl: "https://facebook.com/grupa-komorow/posts/123" },
      EMPTY_CONTEXT
    );
    expect(v.isOfficialDomain).toBe(false);
    expect(v.recommendation).toBe("needs_review");
    expect(v.riskLevel).toBe("high");
  });

  test("near-duplicate of an existing alert → needs_review + high risk + match reported", () => {
    const context: CandidateVerifierContext = {
      alertTitles: ["Przerwa w dostawie wody — Komorów"],
      otherCandidateTexts: [],
    };
    const v = ruleBasedVerifyCandidate(GOOD_CANDIDATE, context);
    expect(v.duplicateRisk).toBe("possible");
    expect(v.duplicateMatch).toBe("Przerwa w dostawie wody — Komorów");
    expect(v.recommendation).toBe("needs_review");
    expect(v.riskLevel).toBe("high");
  });

  test("near-duplicate of another queued candidate is also flagged", () => {
    const context: CandidateVerifierContext = {
      alertTitles: [],
      otherCandidateTexts: [GOOD_CANDIDATE.rawText],
    };
    const v = ruleBasedVerifyCandidate(GOOD_CANDIDATE, context);
    expect(v.duplicateRisk).toBe("possible");
    expect(v.recommendation).toBe("needs_review");
  });

  test("near-empty content → reject (may be just a heading, not a notice)", () => {
    const v = ruleBasedVerifyCandidate(
      {
        title: "Komunikat",
        sourceUrl: GOOD_CANDIDATE.sourceUrl,
        rawText: "Krótka notka.",
      },
      EMPTY_CONTEXT
    );
    expect(v.recommendation).toBe("reject");
    expect(v.riskLevel).toBe("high");
  });

  test("official + no date + no category → needs_review, medium risk (not approve)", () => {
    const v = ruleBasedVerifyCandidate(
      {
        title: "Ogłoszenie urzędu gminy",
        sourceUrl: GOOD_CANDIDATE.sourceUrl,
        rawText:
          "Urząd gminy informuje mieszkańców o nowych zasadach obsługi " +
          "interesantów oraz godzinach otwarcia biura podawczego w okresie letnim.",
      },
      EMPTY_CONTEXT
    );
    expect(v.hasDateSignal).toBe(false);
    expect(v.detectedCategory).toBeNull();
    expect(v.recommendation).toBe("needs_review");
    expect(v.riskLevel).toBe("medium");
  });
});

test.describe("ruleBasedVerifyCandidate — report shape", () => {
  test("is deterministic: identical input → identical result", () => {
    const a = ruleBasedVerifyCandidate(GOOD_CANDIDATE, EMPTY_CONTEXT);
    const b = ruleBasedVerifyCandidate(GOOD_CANDIDATE, EMPTY_CONTEXT);
    expect(a).toEqual(b);
  });

  test("confidence stays in 5–95 — a heuristic never claims 0 or 100", () => {
    const worst = ruleBasedVerifyCandidate(
      { title: "x", rawText: "y" },
      { alertTitles: [], otherCandidateTexts: [] }
    );
    const best = ruleBasedVerifyCandidate(GOOD_CANDIDATE, EMPTY_CONTEXT);
    for (const v of [worst, best]) {
      expect(v.confidence).toBeGreaterThanOrEqual(5);
      expect(v.confidence).toBeLessThanOrEqual(95);
    }
  });

  test("reasons and summary are non-empty Polish text", () => {
    const v = ruleBasedVerifyCandidate(GOOD_CANDIDATE, EMPTY_CONTEXT);
    expect(v.reasons.length).toBeGreaterThan(0);
    for (const r of v.reasons) expect(r.trim().length).toBeGreaterThan(0);
    expect(v.summary).toContain("Ciebie"); // decisions belong to the admin
  });
});

test.describe("detectCandidateCategory", () => {
  test("maps utility keywords to categories", () => {
    expect(detectCandidateCategory("planowane wyłączenia prądu na terenie gminy")).toBe("power");
    expect(detectCandidateCategory("zmiana harmonogramu odbioru odpadów")).toBe("waste");
    expect(detectCandidateCategory("remont ulicy Głównej i objazd")).toBe("roads");
    expect(detectCandidateCategory("opóźnienia pociągów WKD")).toBe("transport");
    expect(detectCandidateCategory("przerwa w dostawie wody")).toBe("water");
  });

  test("returns null instead of guessing when nothing matches", () => {
    expect(detectCandidateCategory("sesja rady gminy w czwartek")).toBeNull();
  });
});

test.describe("official domains", () => {
  test("derived from the canonical checklist config", () => {
    expect(OFFICIAL_DOMAINS).toContain("michalowice.pl");
    expect(OFFICIAL_DOMAINS).toContain("wkd.com.pl");
  });

  test("matches with and without www., rejects lookalikes and garbage", () => {
    expect(isOfficialSourceDomain("https://www.michalowice.pl/komunikaty")).toBe(true);
    expect(isOfficialSourceDomain("https://michalowice.pl/komunikaty")).toBe(true);
    expect(isOfficialSourceDomain("https://michalowice.pl.evil.example/x")).toBe(false);
    expect(isOfficialSourceDomain("https://facebook.com/gmina")).toBe(false);
    expect(isOfficialSourceDomain("not-a-url")).toBe(false);
  });
});

test.describe("verifier copy (anti-drift)", () => {
  test("disclaimer says it advises and never publishes or changes status", () => {
    expect(VERIFIER_DISCLAIMER).toContain("pomocnik");
    expect(VERIFIER_DISCLAIMER).toContain("Nie publikuje");
    expect(VERIFIER_DISCLAIMER).toContain("nie zmienia statusu");
    expect(VERIFIER_DISCLAIMER).toContain("Kreatora");
  });

  test("all three recommendations have labels; none promises publication", () => {
    for (const label of Object.values(RECOMMENDATION_LABELS)) {
      expect(label.trim().length).toBeGreaterThan(0);
      expect(label.toLowerCase()).not.toContain("publik");
    }
    expect(Object.keys(RECOMMENDATION_LABELS).sort()).toEqual(
      ["approve", "needs_review", "reject"].sort()
    );
  });
});
