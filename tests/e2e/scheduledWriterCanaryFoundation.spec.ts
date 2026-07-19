import { test, expect } from "@playwright/test";
import {
  writeCandidatesForSource,
  DEFAULT_ALLOWED_WRITE_SOURCE_IDS,
  DEFAULT_MAX_CANDIDATES_PER_INVOCATION,
  getAllowedWriteSourceIds,
  getMaxCandidatesPerInvocation,
  type ScheduledSourceWriter,
} from "@/lib/scheduledWriter";
import type { CheckProposal } from "@/lib/sourceCheck";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

/**
 * Sprint 164B — Safe Auto-Candidate Canary Foundation.
 *
 * writeCandidatesForSource() and its dedup pool (tests/e2e/scheduledWriter.spec.ts)
 * already have exhaustive coverage. This file adds the specific scenarios
 * the 164B spec calls out by name that were not yet explicit anywhere:
 *   - a notice already saved as a PENDING candidate must not be re-inserted
 *   - a notice already CONVERTED to a draft/alert must not be re-inserted
 *     either — findExistingCandidateTexts' underlying query
 *     (src/lib/scheduledWriter.ts createSupabaseScheduledWriter) never
 *     filters by status, so both cases are structurally identical from
 *     writeCandidatesForSource's point of view: this test documents and
 *     locks in that "status is irrelevant to the dedup pool" property.
 *   - the canary identity itself (single default source, cap of 1) is
 *     pinned by name so a future change to either default is a visible,
 *     deliberate diff here, not a silent widening.
 */

function makeFakeWriter(existingTexts: string[]) {
  const insertedCandidates: unknown[] = [];
  const writer: ScheduledSourceWriter = {
    async findExistingCandidateTexts() {
      // Mirrors the real Supabase-backed implementation: returns matching
      // rows' text regardless of their `status` column (pending, verified,
      // converted, archived — all included), because the underlying SELECT
      // never adds a status filter.
      return [...existingTexts];
    },
    async insertPendingCandidate(payload) {
      insertedCandidates.push(payload);
      return { ok: true };
    },
    async insertSourceCheck() {
      return { ok: true };
    },
  };
  return { writer, insertedCandidates };
}

const canarySourceInfo = {
  sourceKey: "michalowice-komunikaty",
  sourceName: "Gmina Michałowice — komunikaty",
  sourceUrl: "https://www.michalowice.pl/komunikaty",
  registrySourceId: null,
  writerUserId: "fake-writer-uuid",
};

function proposal(text: string): CheckProposal {
  return { title: text.slice(0, 60), excerpt: text.slice(0, 300), rawText: text, hasDate: true };
}

test.describe("Canary dedup — status is irrelevant to the existing-text pool", () => {
  test("a notice matching an existing PENDING candidate's text is skipped, not re-inserted", async () => {
    const existingPendingText = "Utrudnienia w ruchu na ulicy Krakowskiej od 20 lipca do 25 lipca 2026 roku";
    const { writer, insertedCandidates } = makeFakeWriter([existingPendingText]);
    const result = await writeCandidatesForSource(writer, {
      ...canarySourceInfo,
      proposals: [proposal(existingPendingText)],
    });
    expect(result.candidatesInserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(1);
    expect(insertedCandidates).toHaveLength(0);
  });

  test("a notice matching an existing CONVERTED (already published-as-draft) candidate's text is skipped, not re-inserted", async () => {
    // Same fake pool shape as the pending case above — on purpose. A
    // converted candidate's raw_text/excerpt/title still comes back from
    // findExistingCandidateTexts exactly like a pending one would; this
    // test exists specifically to make that equivalence explicit rather
    // than only implied by the pending-case test.
    const existingConvertedText = "Awaria wodociągu w Komorowie — brak wody do godziny 18:00 dnia 21 lipca 2026";
    const { writer, insertedCandidates } = makeFakeWriter([existingConvertedText]);
    const result = await writeCandidatesForSource(writer, {
      ...canarySourceInfo,
      proposals: [proposal(existingConvertedText)],
    });
    expect(result.candidatesInserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(1);
    expect(insertedCandidates).toHaveLength(0);
  });

  test("no new notices on the page → zero candidates inserted, zero duplicates reported (honest empty result)", async () => {
    const { writer, insertedCandidates } = makeFakeWriter([]);
    const result = await writeCandidatesForSource(writer, {
      ...canarySourceInfo,
      proposals: [],
    });
    expect(result.candidatesInserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.ambiguousCandidates).toBe(0);
    expect(insertedCandidates).toHaveLength(0);
  });

  test("a genuinely new notice alongside an already-pending one: only the new one is inserted, capped at 1", async () => {
    const existingPendingText = "Zamknięcie odcinka drogi gminnej na czas remontu do 30 lipca 2026";
    const genuinelyNewText = "Zmiana godzin otwarcia urzędu gminy w dniu 22 lipca 2026 z powodu szkolenia";
    const { writer, insertedCandidates } = makeFakeWriter([existingPendingText]);
    const result = await writeCandidatesForSource(writer, {
      ...canarySourceInfo,
      proposals: [proposal(existingPendingText), proposal(genuinelyNewText)],
    });
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.candidatesInserted).toBe(1);
    expect(insertedCandidates).toHaveLength(1);
  });
});

test.describe("Canary identity — pinned defaults (any change here must be a deliberate, visible diff)", () => {
  test("the default (unconfigured) allowed-write-source-id is exactly one source: michalowice-komunikaty", () => {
    withEnv({ SCHEDULED_WRITER_ALLOWED_SOURCE_IDS: undefined }, () => {
      expect(DEFAULT_ALLOWED_WRITE_SOURCE_IDS).toEqual(["michalowice-komunikaty"]);
      expect(getAllowedWriteSourceIds()).toEqual(["michalowice-komunikaty"]);
    });
  });

  test("the default (unconfigured) per-invocation candidate cap is exactly 1", () => {
    withEnv({ SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN: undefined }, () => {
      expect(DEFAULT_MAX_CANDIDATES_PER_INVOCATION).toBe(1);
      expect(getMaxCandidatesPerInvocation()).toBe(1);
    });
  });
});
