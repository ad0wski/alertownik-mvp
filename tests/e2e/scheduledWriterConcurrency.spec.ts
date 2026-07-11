import { test, expect } from "@playwright/test";
import {
  writeCandidatesForSource,
  computeContentFingerprint,
  isContentFingerprintEnabled,
  buildPendingCandidateInsert,
  type ScheduledSourceWriter,
  type InsertPendingCandidateResult,
} from "@/lib/scheduledWriter";

/**
 * Sprint 150A — concurrency tests for the proposed race-condition
 * closure (docs/SPRINT_150_RACE_CONDITION_MIGRATION_PROPOSAL_V1.md,
 * docs/sql/PROPOSED_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql — NOT
 * applied to any live database). These tests simulate the database's
 * own unique-constraint behavior with a fake in-memory writer (no
 * network, no live Supabase) — they verify the APPLICATION's reaction
 * to a conflict, not the database itself, which can only be verified
 * live, after Adam approves and runs the actual migration.
 */

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return fn().finally(() => {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
}

/** Simulates a single shared Postgres table with a unique constraint on
 *  content_fingerprint — the exact behavior the proposed migration would
 *  enforce. Two calls sharing this same instance model two concurrent
 *  invocations racing over the same underlying row. */
function makeConcurrencySimulatingWriter() {
  const committedFingerprints = new Set<string>();
  const insertAttempts: { content_fingerprint?: string }[] = [];

  const writer: ScheduledSourceWriter = {
    async findExistingCandidateTexts() {
      // Empty on purpose: simulates the exact race scenario — neither
      // concurrent invocation's in-memory read sees the other's
      // not-yet-committed row, so both independently classify their
      // proposal as "new" and both attempt to insert.
      return [];
    },
    async insertPendingCandidate(payload): Promise<InsertPendingCandidateResult> {
      insertAttempts.push(payload as { content_fingerprint?: string });
      const fp = (payload as { content_fingerprint?: string }).content_fingerprint;
      if (fp && committedFingerprints.has(fp)) {
        return { ok: false, reason: "duplicate_prevented_by_database" };
      }
      if (fp) committedFingerprints.add(fp);
      return { ok: true };
    },
    async insertSourceCheck() {
      return { ok: true };
    },
  };
  return { writer, insertAttempts, committedFingerprints };
}

const baseInput = {
  sourceKey: "michalowice-komunikaty",
  sourceName: "Gmina Michałowice — komunikaty",
  sourceUrl: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty",
  registrySourceId: "a56cfb33-a443-47aa-8365-89c6303e7fcc",
  writerUserId: "fake-writer-uuid",
};

const sameNoticeProposal = {
  title: "Przerwa w dostawie wody",
  excerpt: "Planowana przerwa w dostawie wody w Komorowie",
  rawText: "Planowana przerwa w dostawie wody w Komorowie w dniach 15-16 lipca",
  hasDate: true,
};

test.describe("Concurrency — two racing invocations of the same notice (fingerprint flag ON)", () => {
  test("both invocations run in parallel, exactly one wins, the other is a safe database-prevented duplicate", async () => {
    await withEnv({ SCHEDULED_WRITER_FINGERPRINT_ENABLED: "true" }, async () => {
      const { writer, insertAttempts } = makeConcurrencySimulatingWriter();

      const [resultA, resultB] = await Promise.all([
        writeCandidatesForSource(writer, { ...baseInput, proposals: [sameNoticeProposal] }, 1),
        writeCandidatesForSource(writer, { ...baseInput, proposals: [sameNoticeProposal] }, 1),
      ]);

      const totalInserted = resultA.candidatesInserted + resultB.candidatesInserted;
      const totalPreventedByDb =
        resultA.duplicatesPreventedByDatabase + resultB.duplicatesPreventedByDatabase;

      expect(totalInserted).toBe(1);
      expect(totalPreventedByDb).toBe(1);
      expect(insertAttempts).toHaveLength(2);
    });
  });

  test("the database-prevented duplicate never counts against candidatesInserted (cap integrity across racers)", async () => {
    await withEnv({ SCHEDULED_WRITER_FINGERPRINT_ENABLED: "true" }, async () => {
      const { writer } = makeConcurrencySimulatingWriter();
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          writeCandidatesForSource(writer, { ...baseInput, proposals: [sameNoticeProposal] }, 1)
        )
      );
      const totalInserted = results.reduce((sum, r) => sum + r.candidatesInserted, 0);
      const totalPreventedByDb = results.reduce((sum, r) => sum + r.duplicatesPreventedByDatabase, 0);
      // 5 racing invocations of the identical notice: exactly one winner,
      // no matter how many raced simultaneously.
      expect(totalInserted).toBe(1);
      expect(totalPreventedByDb).toBe(4);
    });
  });

  test("no invocation throws — Promise.all resolves normally, never rejects (no unhandled 500 at the route layer)", async () => {
    await withEnv({ SCHEDULED_WRITER_FINGERPRINT_ENABLED: "true" }, async () => {
      const { writer } = makeConcurrencySimulatingWriter();
      await expect(
        Promise.all([
          writeCandidatesForSource(writer, { ...baseInput, proposals: [sameNoticeProposal] }, 1),
          writeCandidatesForSource(writer, { ...baseInput, proposals: [sameNoticeProposal] }, 1),
        ])
      ).resolves.toBeDefined();
    });
  });

  test("no retry storm: insertPendingCandidate is called exactly once per proposal per invocation, never re-attempted after a conflict", async () => {
    await withEnv({ SCHEDULED_WRITER_FINGERPRINT_ENABLED: "true" }, async () => {
      const { writer, insertAttempts } = makeConcurrencySimulatingWriter();
      await Promise.all([
        writeCandidatesForSource(writer, { ...baseInput, proposals: [sameNoticeProposal] }, 1),
        writeCandidatesForSource(writer, { ...baseInput, proposals: [sameNoticeProposal] }, 1),
      ]);
      // Exactly 2 attempts total (one per invocation) — a retry storm
      // would show as 3+ attempts for the same fingerprint.
      expect(insertAttempts).toHaveLength(2);
      expect(insertAttempts[0].content_fingerprint).toBe(insertAttempts[1].content_fingerprint);
    });
  });

  test("a genuinely different notice racing at the same time is still inserted independently, unaffected by the other race", async () => {
    await withEnv({ SCHEDULED_WRITER_FINGERPRINT_ENABLED: "true" }, async () => {
      const { writer } = makeConcurrencySimulatingWriter();
      const differentProposal = {
        title: "Zamknięcie parkingu",
        excerpt: "Zamknięcie parkingu przy urzędzie gminy z powodu remontu",
        rawText: "Zamknięcie parkingu przy urzędzie gminy z powodu remontu dachu od poniedziałku",
        hasDate: true,
      };
      const [resultSameA, resultSameB, resultDifferent] = await Promise.all([
        writeCandidatesForSource(writer, { ...baseInput, proposals: [sameNoticeProposal] }, 1),
        writeCandidatesForSource(writer, { ...baseInput, proposals: [sameNoticeProposal] }, 1),
        writeCandidatesForSource(writer, { ...baseInput, proposals: [differentProposal] }, 1),
      ]);
      const totalSameInserted = resultSameA.candidatesInserted + resultSameB.candidatesInserted;
      expect(totalSameInserted).toBe(1);
      expect(resultDifferent.candidatesInserted).toBe(1);
      expect(resultDifferent.duplicatesPreventedByDatabase).toBe(0);
    });
  });

  test("published: false and no alerts access are structural — writeCandidatesForSource never references either regardless of conflict outcome", async () => {
    await withEnv({ SCHEDULED_WRITER_FINGERPRINT_ENABLED: "true" }, async () => {
      const { writer } = makeConcurrencySimulatingWriter();
      const result = await writeCandidatesForSource(writer, { ...baseInput, proposals: [sameNoticeProposal] }, 1);
      expect(result).not.toHaveProperty("published");
      expect(JSON.stringify(result)).not.toContain("alerts");
    });
  });
});

test.describe("Concurrency — fingerprint flag OFF (today's default, migration not applied)", () => {
  test("content_fingerprint is entirely absent from the insert payload when the flag is unset", () => {
    const payload = buildPendingCandidateInsert({
      sourceId: baseInput.registrySourceId,
      sourceKey: baseInput.sourceKey,
      sourceName: baseInput.sourceName,
      sourceUrl: baseInput.sourceUrl,
      title: sameNoticeProposal.title,
      excerpt: sameNoticeProposal.excerpt,
      rawText: sameNoticeProposal.rawText,
    });
    expect(payload).not.toHaveProperty("content_fingerprint");
    expect(isContentFingerprintEnabled()).toBe(false);
  });

  test("with the flag off, two racing invocations both insert (no protection yet) — proves the flag genuinely gates the behavior, not just the column", async () => {
    await withEnv({ SCHEDULED_WRITER_FINGERPRINT_ENABLED: undefined }, async () => {
      const { writer } = makeConcurrencySimulatingWriter();
      const [resultA, resultB] = await Promise.all([
        writeCandidatesForSource(writer, { ...baseInput, proposals: [sameNoticeProposal] }, 1),
        writeCandidatesForSource(writer, { ...baseInput, proposals: [sameNoticeProposal] }, 1),
      ]);
      // No content_fingerprint sent → the simulating writer's conflict
      // check never triggers → both "win". This is the honest, current
      // (pre-migration) state: the race is NOT closed today, exactly as
      // documented in SPRINT_149_RACE_CONDITION_MIGRATION_PROPOSAL_V1.md.
      expect(resultA.candidatesInserted + resultB.candidatesInserted).toBe(2);
    });
  });
});

test.describe("computeContentFingerprint — deterministic, normalization-aware (reuses textSimilarity's own normalization)", () => {
  test("identical content produces an identical fingerprint", () => {
    const a = computeContentFingerprint({ title: "T", excerpt: "E", rawText: "Awaria wodociągu w Komorowie" });
    const b = computeContentFingerprint({ title: "T", excerpt: "E", rawText: "Awaria wodociągu w Komorowie" });
    expect(a).toBe(b);
  });

  test("case differences produce the same fingerprint", () => {
    const a = computeContentFingerprint({ title: "", excerpt: "", rawText: "Awaria wodociągu w Komorowie" });
    const b = computeContentFingerprint({ title: "", excerpt: "", rawText: "AWARIA WODOCIĄGU W KOMOROWIE" });
    expect(a).toBe(b);
  });

  test("whitespace/newline differences produce the same fingerprint", () => {
    const a = computeContentFingerprint({ title: "", excerpt: "", rawText: "Awaria wodociągu\r\nw Komorowie" });
    const b = computeContentFingerprint({ title: "", excerpt: "", rawText: "Awaria   wodociągu w Komorowie" });
    expect(a).toBe(b);
  });

  test("typographic vs straight quotes produce the same fingerprint", () => {
    const a = computeContentFingerprint({ title: "", excerpt: "", rawText: "Gmina informuje: „koniec prac”" });
    const b = computeContentFingerprint({ title: "", excerpt: "", rawText: 'Gmina informuje: "koniec prac"' });
    expect(a).toBe(b);
  });

  test("Polish diacritics produce the same fingerprint as their ASCII fold", () => {
    const a = computeContentFingerprint({ title: "", excerpt: "", rawText: "Łódź: zamknięcie ulicy Głównej" });
    const b = computeContentFingerprint({ title: "", excerpt: "", rawText: "Lodz: zamkniecie ulicy Glownej" });
    expect(a).toBe(b);
  });

  test("genuinely different content produces a different fingerprint", () => {
    const a = computeContentFingerprint({ title: "", excerpt: "", rawText: "Awaria wodociągu w Komorowie" });
    const b = computeContentFingerprint({ title: "", excerpt: "", rawText: "Zamknięcie parkingu przy urzędzie" });
    expect(a).not.toBe(b);
  });

  test("output is a fixed-length hex string (safe to index regardless of input length)", () => {
    const short = computeContentFingerprint({ title: "", excerpt: "", rawText: "Krótko" });
    const long = computeContentFingerprint({ title: "", excerpt: "", rawText: "A".repeat(5000) });
    expect(short).toMatch(/^[0-9a-f]{64}$/);
    expect(long).toMatch(/^[0-9a-f]{64}$/);
  });
});

test.describe("isContentFingerprintEnabled — expand/contract deploy safety", () => {
  test("defaults to false (identical behavior to before Sprint 150A) when unset", () => {
    expect(isContentFingerprintEnabled()).toBe(false);
  });

  test("only the exact literal 'true' enables it", async () => {
    await withEnv({ SCHEDULED_WRITER_FINGERPRINT_ENABLED: "1" }, async () => {
      expect(isContentFingerprintEnabled()).toBe(false);
    });
    await withEnv({ SCHEDULED_WRITER_FINGERPRINT_ENABLED: "true" }, async () => {
      expect(isContentFingerprintEnabled()).toBe(true);
    });
  });
});
