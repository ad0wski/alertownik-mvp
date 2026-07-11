import { test, expect } from "@playwright/test";
import { textSimilarity } from "@/lib/candidateWarnings";
import {
  classifyCandidateAgainstExisting,
  writeCandidatesForSource,
  DUPLICATE_CONFIDENCE_THRESHOLD,
  AMBIGUOUS_SIMILARITY_THRESHOLD,
  type ScheduledSourceWriter,
} from "@/lib/scheduledWriter";

/**
 * Sprint 149 — Scheduled Writer Idempotency Hardening v1.
 *
 * These tests document, with real assertions rather than assumed
 * behavior, exactly how the existing word-overlap dedup heuristic
 * (src/lib/candidateWarnings.ts textSimilarity, reused by
 * classifyCandidateAgainstExisting) reacts to every case the Sprint 149
 * audit was asked about. This is NOT a claim of perfect idempotency —
 * see docs/SPRINT_149_RACE_CONDITION_MIGRATION_PROPOSAL_V1.md for the
 * documented, unmitigated race-condition gap this heuristic cannot close
 * without a database-level unique constraint.
 */

test.describe("Idempotency audit — case, whitespace, punctuation, diacritics", () => {
  test("case differences are fully normalized away", () => {
    expect(textSimilarity("Komunikat o awarii wodociągu", "KOMUNIKAT O AWARII WODOCIĄGU")).toBe(1);
  });

  test("multiple/irregular spaces are collapsed and don't affect the score", () => {
    expect(textSimilarity("Awaria    wodociągu   w Komorowie", "Awaria wodociągu w Komorowie")).toBe(1);
  });

  test("different newline styles (\\n, \\r\\n) are treated as ordinary whitespace", () => {
    const a = "Awaria wodociągu\r\nw Komorowie\ntrwa do odwołania";
    const b = "Awaria wodociągu w Komorowie trwa do odwołania";
    expect(textSimilarity(a, b)).toBe(1);
  });

  test("typographic quotes vs straight quotes score identically (both stripped to whitespace)", () => {
    const curly = "Gmina informuje: „prace zakończą się w piątek”";
    const straight = 'Gmina informuje: "prace zakończą się w piątek"';
    expect(textSimilarity(curly, straight)).toBe(1);
  });

  test("Polish diacritics fold to their ASCII equivalents (ą/ć/ę/ł/ń/ó/ś/ź/ż)", () => {
    const withDiacritics = "Łódź: zamknięcie ulicy Głównej z powodu awarii wodociągu";
    const withoutDiacritics = "Lodz: zamkniecie ulicy Glownej z powodu awarii wodociagu";
    expect(textSimilarity(withDiacritics, withoutDiacritics)).toBe(1);
  });
});

test.describe("Idempotency audit — edited/similar/short notices (honest limits, not overclaimed)", () => {
  test("a single-word edit on a LONG notice still scores as a confident duplicate", () => {
    const original =
      "Gmina Michałowice informuje mieszkańców o planowanych pracach wodociągowych " +
      "na ulicy Głównej w Komorowie, które potrwają od poniedziałku do piątku włącznie";
    const edited =
      "Gmina Michałowice informuje mieszkańców o planowanych pracach wodociągowych " +
      "na ulicy Głównej w Komorowie, które potrwają od wtorku do piątku włącznie";
    const score = textSimilarity(original, edited);
    expect(score).toBeGreaterThanOrEqual(DUPLICATE_CONFIDENCE_THRESHOLD);
    expect(classifyCandidateAgainstExisting(edited, [original])).toBe("duplicate");
  });

  test("a single-word edit on a SHORT notice can drop into the ambiguous band, not auto-duplicate — a real, documented sensitivity, not a bug", () => {
    const original = "Awaria wodociągu w Komorowie dzisiaj";
    const edited = "Awaria wodociągu w Komorowie jutro";
    const score = textSimilarity(original, edited);
    expect(score).toBeLessThan(DUPLICATE_CONFIDENCE_THRESHOLD);
    expect(score).toBeGreaterThanOrEqual(AMBIGUOUS_SIMILARITY_THRESHOLD);
    expect(classifyCandidateAgainstExisting(edited, [original])).toBe("ambiguous");
  });

  test("a genuinely similar but not identical notice is classified ambiguous — never silently inserted, never silently discarded", () => {
    // Deliberately NOT just a number/date change (see the test above for
    // that specific, documented edge case) — here the street name and
    // day-of-week both differ, so only a partial word-overlap remains.
    const existing = "Utrudnienia na ulicy Kolejowej w Komorowie od poniedziałku";
    const similarButDifferent = "Utrudnienia na ulicy Sikorskiego w Komorowie od wtorku";
    const score = textSimilarity(similarButDifferent, existing);
    expect(score).toBeGreaterThanOrEqual(AMBIGUOUS_SIMILARITY_THRESHOLD);
    expect(score).toBeLessThan(DUPLICATE_CONFIDENCE_THRESHOLD);
    expect(classifyCandidateAgainstExisting(similarButDifferent, [existing])).toBe("ambiguous");
  });

  test("genuinely different content is classified as new", () => {
    const existing = "Awaria wodociągu w Komorowie";
    const unrelated = "Zamknięcie parkingu przy urzędzie gminy z powodu remontu dachu";
    expect(classifyCandidateAgainstExisting(unrelated, [existing])).toBe("new");
  });
});

test.describe("Idempotency audit — signals that do NOT participate in the comparison", () => {
  test("missing vs present date changes the token set slightly but is not a dedicated signal — dates are just tokens like any other", () => {
    const withoutDate = "Zamknięcie ulicy Głównej z powodu remontu nawierzchni";
    const withDate = "Zamknięcie ulicy Głównej z powodu remontu nawierzchni 2026-07-15";
    // Not a perfect 1.0 — the appended date token slightly changes the
    // overlap ratio — but still well within the confident-duplicate band,
    // confirming date presence/absence is not treated as a special
    // dedup signal (there is no date-aware branch in this heuristic).
    const score = textSimilarity(withoutDate, withDate);
    expect(score).toBeGreaterThanOrEqual(DUPLICATE_CONFIDENCE_THRESHOLD);
  });

  test("the same source URL vs a different URL makes no difference — URL is never part of this comparison at all", () => {
    const a = "Prace na ulicy Głównej, szczegóły na stronie urzędu gminy";
    const b = "Prace na ulicy Głównej, szczegóły na stronie urzędu gminy";
    // Both identical texts regardless of which URL the caller associates
    // with them — classifyCandidateAgainstExisting/textSimilarity never
    // receive a URL parameter at all, by design (see
    // WriteCandidatesForSourceInput — sourceUrl is the source's homepage,
    // shared by every proposal from that source, never a distinguishing
    // per-notice value).
    expect(textSimilarity(a, b)).toBe(1);
  });
});

test.describe("Sprint 149 hardening — widened existing-candidate lookup passes registrySourceId through", () => {
  function makeSpyWriter() {
    const calls: { sourceKey: string; registrySourceId: string | null }[] = [];
    const writer: ScheduledSourceWriter = {
      async findExistingCandidateTexts(sourceKey, registrySourceId) {
        calls.push({ sourceKey, registrySourceId });
        return [];
      },
      async insertPendingCandidate() {
        return { ok: true };
      },
      async insertSourceCheck() {
        return { ok: true };
      },
    };
    return { writer, calls };
  }

  test("registrySourceId is forwarded to findExistingCandidateTexts so admin-saved candidates for the same source are included in the dedup pool", async () => {
    const { writer, calls } = makeSpyWriter();
    await writeCandidatesForSource(writer, {
      sourceKey: "michalowice-komunikaty",
      sourceName: "Gmina Michałowice — komunikaty",
      sourceUrl: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty",
      proposals: [{ title: "Test", excerpt: "Test", rawText: "Test unikalna treść", hasDate: false }],
      registrySourceId: "a56cfb33-a443-47aa-8365-89c6303e7fcc",
      writerUserId: "fake-writer-uuid",
    });
    expect(calls).toEqual([
      { sourceKey: "michalowice-komunikaty", registrySourceId: "a56cfb33-a443-47aa-8365-89c6303e7fcc" },
    ]);
  });

  test("null registrySourceId (not yet configured) is forwarded as null, not silently coerced", async () => {
    const { writer, calls } = makeSpyWriter();
    await writeCandidatesForSource(writer, {
      sourceKey: "michalowice-komunikaty",
      sourceName: "Gmina Michałowice — komunikaty",
      sourceUrl: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty",
      proposals: [{ title: "Test", excerpt: "Test", rawText: "Test unikalna treść", hasDate: false }],
      registrySourceId: null,
      writerUserId: "fake-writer-uuid",
    });
    expect(calls).toEqual([{ sourceKey: "michalowice-komunikaty", registrySourceId: null }]);
  });
});
