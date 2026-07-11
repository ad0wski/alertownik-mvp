import { test, expect } from "@playwright/test";
import {
  isWriteModeEnabled,
  getScheduledWriterCredentials,
  buildPendingCandidateInsert,
  buildAutomatedSourceCheckInsert,
  classifyCandidateAgainstExisting,
  getRegistrySourceId,
  writeCandidatesForSource,
  DUPLICATE_CONFIDENCE_THRESHOLD,
  AMBIGUOUS_SIMILARITY_THRESHOLD,
  type ScheduledSourceWriter,
} from "@/lib/scheduledWriter";

/**
 * Sprint 147 — Scheduled Writer Foundation v1. Unit-style tests for the
 * pure/decision-logic layer of src/lib/scheduledWriter.ts. No network, no
 * live Supabase, no real credentials anywhere — writeCandidatesForSource
 * is exercised with a hand-written, fully in-memory fake ScheduledSourceWriter.
 */

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

// ── Configuration gates ──────────────────────────────────────────────────────

test.describe("isWriteModeEnabled — write-mode kill switch, independent of the dry-run one", () => {
  test("undefined, empty, or any non-'true' value stays disabled (write mode disabled by default)", () => {
    expect(isWriteModeEnabled(undefined)).toBe(false);
    expect(isWriteModeEnabled("")).toBe(false);
    expect(isWriteModeEnabled("false")).toBe(false);
    expect(isWriteModeEnabled("1")).toBe(false);
  });

  test("only the exact literal 'true' enables it", () => {
    expect(isWriteModeEnabled("true")).toBe(true);
  });
});

test.describe("getScheduledWriterCredentials — fails closed on any missing half", () => {
  test("returns null when both are unset (missing write flag / credentials prevents writer construction)", () => {
    withEnv(
      { SUPABASE_SCHEDULED_WRITER_EMAIL: undefined, SUPABASE_SCHEDULED_WRITER_PASSWORD: undefined },
      () => {
        expect(getScheduledWriterCredentials()).toBeNull();
      }
    );
  });

  test("returns null when only email is set (missing password prevents authentication)", () => {
    withEnv(
      { SUPABASE_SCHEDULED_WRITER_EMAIL: "writer@example.test", SUPABASE_SCHEDULED_WRITER_PASSWORD: undefined },
      () => {
        expect(getScheduledWriterCredentials()).toBeNull();
      }
    );
  });

  test("returns null when only password is set (missing email prevents authentication)", () => {
    withEnv(
      { SUPABASE_SCHEDULED_WRITER_EMAIL: undefined, SUPABASE_SCHEDULED_WRITER_PASSWORD: "test-only-fake-password" },
      () => {
        expect(getScheduledWriterCredentials()).toBeNull();
      }
    );
  });

  test("returns credentials only when both are present (fake test values only)", () => {
    withEnv(
      {
        SUPABASE_SCHEDULED_WRITER_EMAIL: "writer@example.test",
        SUPABASE_SCHEDULED_WRITER_PASSWORD: "test-only-fake-password",
      },
      () => {
        expect(getScheduledWriterCredentials()).toEqual({
          email: "writer@example.test",
          password: "test-only-fake-password",
        });
      }
    );
  });
});

test.describe("getRegistrySourceId — env-configured mapping, never a database read", () => {
  test("returns null when the env var is unset", () => {
    withEnv({ SCHEDULED_WRITER_SOURCE_REGISTRY_IDS: undefined }, () => {
      expect(getRegistrySourceId("wkd-aktualnosci")).toBeNull();
    });
  });

  test("returns null for malformed JSON, without throwing", () => {
    withEnv({ SCHEDULED_WRITER_SOURCE_REGISTRY_IDS: "{not valid json" }, () => {
      expect(getRegistrySourceId("wkd-aktualnosci")).toBeNull();
    });
  });

  test("returns null for a key not present in the mapping", () => {
    withEnv({ SCHEDULED_WRITER_SOURCE_REGISTRY_IDS: JSON.stringify({ "michalowice-komunikaty": "fake-uuid-1" }) }, () => {
      expect(getRegistrySourceId("wkd-aktualnosci")).toBeNull();
    });
  });

  test("returns the mapped id when present", () => {
    withEnv(
      {
        SCHEDULED_WRITER_SOURCE_REGISTRY_IDS: JSON.stringify({
          "michalowice-komunikaty": "fake-uuid-1",
          "wkd-aktualnosci": "fake-uuid-2",
        }),
      },
      () => {
        expect(getRegistrySourceId("wkd-aktualnosci")).toBe("fake-uuid-2");
        expect(getRegistrySourceId("michalowice-komunikaty")).toBe("fake-uuid-1");
      }
    );
  });
});

// ── Candidate insert builder — sensitive columns cannot be smuggled in ──────

test.describe("buildPendingCandidateInsert — only pending inserts are constructed", () => {
  test("always forces status=pending and every verifier/conversion field to null/safe", () => {
    const payload = buildPendingCandidateInsert({
      sourceId: "fake-source-uuid",
      sourceKey: "wkd-aktualnosci",
      sourceName: "WKD — aktualności",
      sourceUrl: "https://wkd.com.pl/aktualnosci",
      title: "Testowy tytuł",
      excerpt: "Testowy wycinek.",
      rawText: "Pełna testowa treść.",
    });

    expect(payload.status).toBe("pending");
    expect(payload.verification_status).toBe("unverified");
    expect(payload.confidence_score).toBeNull();
    expect(payload.risk_level).toBeNull();
    expect(payload.verification_notes).toBeNull();
    expect(payload.checked_at).toBeNull();
    expect(payload.duplicate_of_alert_id).toBeNull();
    expect(payload.converted_alert_id).toBeNull();
    expect(payload.ai_draft_json).toBeNull();
  });

  test("there is no parameter through which a caller could set a different/approved/rejected/converted status", () => {
    // Structural guarantee, not just a runtime assertion: PendingCandidateInput
    // has no `status`/`verificationStatus`/etc. field at all — no update or
    // delete operation exists anywhere in this module either.
    const payload = buildPendingCandidateInsert({
      sourceId: null,
      sourceKey: "michalowice-komunikaty",
      sourceName: "Gmina Michałowice — komunikaty",
      sourceUrl: "https://michalowice.pl/aktualnosci",
      title: "t",
      excerpt: "e",
      rawText: "r",
    });
    expect(Object.keys(payload)).not.toContain("approvedBy");
    expect(payload.source_id).toBeNull();
  });
});

test.describe("buildAutomatedSourceCheckInsert — result restricted, self-attributed, no update/delete exists", () => {
  test("found_notice insert mapping", () => {
    const payload = buildAutomatedSourceCheckInsert({
      sourceId: "fake-source-uuid",
      writerUserId: "fake-writer-uuid",
      result: "found_notice",
    });
    expect(payload.result).toBe("found_notice");
    expect(payload.related_alert_id).toBeNull();
    expect(payload.created_by).toBe("fake-writer-uuid");
    expect(payload.source_id).toBe("fake-source-uuid");
  });

  test("no_changes insert mapping", () => {
    const payload = buildAutomatedSourceCheckInsert({
      sourceId: "fake-source-uuid",
      writerUserId: "fake-writer-uuid",
      result: "no_changes",
    });
    expect(payload.result).toBe("no_changes");
    expect(payload.related_alert_id).toBeNull();
  });

  test("the type only allows the two automatable outcomes (no generic status manipulation)", () => {
    const okValues: Array<"no_changes" | "found_notice"> = ["no_changes", "found_notice"];
    for (const result of okValues) {
      expect(buildAutomatedSourceCheckInsert({ sourceId: "s", writerUserId: "w", result }).result).toBe(result);
    }
  });
});

// ── Three-way deduplication classification ──────────────────────────────────

test.describe("classifyCandidateAgainstExisting — conservative, three-way, no false idempotency claim", () => {
  test("empty existing list is always classified as new", () => {
    expect(classifyCandidateAgainstExisting("dowolny tekst", [])).toBe("new");
  });

  test("a near-identical text is classified as a confident duplicate and skipped", () => {
    const existing = ["Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00"];
    const candidate = "Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00";
    expect(classifyCandidateAgainstExisting(candidate, existing)).toBe("duplicate");
  });

  test("a moderately similar but not identical text is classified as ambiguous, not duplicate, not new", () => {
    // Known overlap ratio: existing has 5 significant words (syren,
    // alarmowych, testowe, uruchomienie, gminie); candidate shares 4 of
    // them plus 3 new ones (7 distinct total) → 4/5 = 0.8, between
    // AMBIGUOUS_SIMILARITY_THRESHOLD (0.6) and
    // DUPLICATE_CONFIDENCE_THRESHOLD (0.9).
    const existing = ["syren alarmowych testowe uruchomienie gminie"];
    const candidate = "gminie syren testowe uruchomienie zupelnie inny dodatkowy";
    expect(classifyCandidateAgainstExisting(candidate, existing)).toBe("ambiguous");
  });

  test("genuinely different content is classified as new", () => {
    const existing = ["Zmiana rozkładu jazdy na linii WKD od poniedziałku"];
    const candidate = "Awaria wodociągu w Komorowie, brak wody do wieczora";
    expect(classifyCandidateAgainstExisting(candidate, existing)).toBe("new");
  });

  test("thresholds are ordered sensibly (ambiguous band is narrower than 'not a match at all')", () => {
    expect(DUPLICATE_CONFIDENCE_THRESHOLD).toBeGreaterThan(AMBIGUOUS_SIMILARITY_THRESHOLD);
    expect(DUPLICATE_CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(1);
    expect(AMBIGUOUS_SIMILARITY_THRESHOLD).toBeGreaterThan(0);
  });
});

// ── writeCandidatesForSource — full decision-logic coverage via a fake
// in-memory ScheduledSourceWriter (no network, no real Supabase client) ────

function makeFakeWriter(existingTexts: string[] = []) {
  const insertedCandidates: ReturnType<typeof buildPendingCandidateInsert>[] = [];
  const insertedChecks: ReturnType<typeof buildAutomatedSourceCheckInsert>[] = [];
  const writer: ScheduledSourceWriter = {
    async findExistingCandidateTexts() {
      return [...existingTexts];
    },
    async insertPendingCandidate(payload) {
      insertedCandidates.push(payload);
      return { ok: true };
    },
    async insertSourceCheck(payload) {
      insertedChecks.push(payload);
      return { ok: true };
    },
  };
  return { writer, insertedCandidates, insertedChecks };
}

const baseSourceInfo = {
  sourceKey: "wkd-aktualnosci",
  sourceName: "WKD — aktualności",
  sourceUrl: "https://wkd.com.pl/aktualnosci",
  writerUserId: "fake-writer-uuid",
};

test.describe("writeCandidatesForSource — zero proposals", () => {
  test("no_changes insert mapping: logs a no_changes check when a registry id is configured", async () => {
    const { writer, insertedCandidates, insertedChecks } = makeFakeWriter();
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [],
      registrySourceId: "fake-source-uuid",
    });
    expect(result.candidatesInserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.ambiguousCandidates).toBe(0);
    expect(result.sourceChecksInserted).toBe(1);
    expect(insertedCandidates).toHaveLength(0);
    expect(insertedChecks).toEqual([
      { source_id: "fake-source-uuid", result: "no_changes", related_alert_id: null, created_by: "fake-writer-uuid" },
    ]);
  });

  test("skips check-logging gracefully when no registry id is configured yet", async () => {
    const { writer, insertedChecks } = makeFakeWriter();
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [],
      registrySourceId: null,
    });
    expect(result.sourceChecksInserted).toBe(0);
    expect(insertedChecks).toHaveLength(0);
  });
});

test.describe("writeCandidatesForSource — proposals present, no duplicates", () => {
  test("found_notice insert mapping: inserts every new proposal as pending and logs found_notice", async () => {
    const { writer, insertedCandidates, insertedChecks } = makeFakeWriter();
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        { title: "Komunikat A", excerpt: "Wycinek A", rawText: "Pełna treść A o czymś unikalnym", hasDate: true },
        { title: "Komunikat B", excerpt: "Wycinek B", rawText: "Zupełnie inna treść B o czymś innym", hasDate: false },
      ],
      registrySourceId: "fake-source-uuid",
    });
    expect(result.candidatesInserted).toBe(2);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.ambiguousCandidates).toBe(0);
    expect(result.sourceChecksInserted).toBe(1);
    expect(insertedCandidates).toHaveLength(2);
    expect(insertedChecks).toEqual([
      { source_id: "fake-source-uuid", result: "found_notice", related_alert_id: null, created_by: "fake-writer-uuid" },
    ]);
    for (const candidate of insertedCandidates) {
      expect(candidate.status).toBe("pending");
      expect(candidate.source_key).toBe("wkd-aktualnosci");
    }
  });

  test("candidate source_id is null when no registry id is configured (accepted, handled case)", async () => {
    const { writer, insertedCandidates } = makeFakeWriter();
    await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [{ title: "T", excerpt: "E", rawText: "Treść bez zarejestrowanego source_id", hasDate: false }],
      registrySourceId: null,
    });
    expect(insertedCandidates[0].source_id).toBeNull();
  });
});

test.describe("writeCandidatesForSource — duplicate skipping (no candidate UPDATE/DELETE exists anywhere)", () => {
  test("duplicate candidate is skipped: an exact-repeat proposal is not inserted", async () => {
    const existing = ["Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00"];
    const { writer, insertedCandidates } = makeFakeWriter(existing);
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        {
          title: "Syreny alarmowe",
          excerpt: "e",
          rawText: "Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00",
          hasDate: true,
        },
      ],
      registrySourceId: "fake-source-uuid",
    });
    expect(result.candidatesInserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(1);
    expect(insertedCandidates).toHaveLength(0);
  });

  test("a duplicate-only run still logs found_notice (proposals existed, even if none were new)", async () => {
    const existing = ["Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00"];
    const { writer, insertedChecks } = makeFakeWriter(existing);
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        {
          title: "Syreny",
          excerpt: "e",
          rawText: "Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00",
          hasDate: true,
        },
      ],
      registrySourceId: "fake-source-uuid",
    });
    expect(result.sourceChecksInserted).toBe(1);
    expect(insertedChecks[0]).toMatchObject({ result: "found_notice" });
  });

  test("mixed run: one duplicate skipped, one genuinely new inserted", async () => {
    const existing = ["Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00"];
    const { writer, insertedCandidates } = makeFakeWriter(existing);
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        {
          title: "Syreny (duplikat)",
          excerpt: "e",
          rawText: "Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00",
          hasDate: true,
        },
        { title: "Awaria wody", excerpt: "e", rawText: "Zupełnie inna, nowa awaria sieci wodociągowej w Komorowie", hasDate: false },
      ],
      registrySourceId: "fake-source-uuid",
    });
    expect(result.candidatesInserted).toBe(1);
    expect(result.duplicatesSkipped).toBe(1);
    expect(insertedCandidates).toHaveLength(1);
  });
});

test.describe("writeCandidatesForSource — ambiguous duplicates are never silently inserted or silently dropped", () => {
  test("an ambiguous proposal is excluded from both insertedCandidates and duplicatesSkipped, and counted separately", async () => {
    // Constructed with a known overlap ratio (textSimilarity = shared
    // significant words / smaller set size): existing has 5 significant
    // words (syren, alarmowych, testowe, uruchomienie, gminie); candidate
    // shares 4 of them plus 3 new ones (7 distinct total) → 4/5 = 0.8,
    // between AMBIGUOUS_SIMILARITY_THRESHOLD (0.6) and
    // DUPLICATE_CONFIDENCE_THRESHOLD (0.9).
    const existing = ["syren alarmowych testowe uruchomienie gminie"];
    const candidate = "gminie syren testowe uruchomienie zupelnie inny dodatkowy";

    // Sanity-check this fixture actually lands in the intended band before
    // asserting on writeCandidatesForSource's handling of it — if the
    // heuristic's behavior ever changes, this assertion fails first with a
    // clear reason, rather than failing confusingly below.
    expect(classifyCandidateAgainstExisting(candidate, existing)).toBe("ambiguous");

    const { writer, insertedCandidates } = makeFakeWriter(existing);
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [{ title: "T", excerpt: "e", rawText: candidate, hasDate: false }],
      registrySourceId: "fake-source-uuid",
    });

    expect(result.ambiguousCandidates).toBe(1);
    expect(result.candidatesInserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(0);
    expect(insertedCandidates).toHaveLength(0);
  });
});
