import { test, expect } from "@playwright/test";
import {
  isWriteModeEnabled,
  getScheduledWriterCredentials,
  buildPendingCandidateInsert,
  buildAutomatedSourceCheckInsert,
  describeAutomatedFetchFailure,
  logFailedSourceCheck,
  classifyCandidateAgainstExisting,
  getRegistrySourceId,
  writeCandidatesForSource,
  DUPLICATE_CONFIDENCE_THRESHOLD,
  AMBIGUOUS_SIMILARITY_THRESHOLD,
  DEFAULT_MAX_CANDIDATES_PER_INVOCATION,
  getMaxCandidatesPerInvocation,
  DEFAULT_ALLOWED_WRITE_SOURCE_IDS,
  getAllowedWriteSourceIds,
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

  // B. P0-2B regression check: the two pre-existing, unmodified success
  // call sites (writeCandidatesForSource's "no_changes"/"found_notice"
  // branches) must keep producing exactly the same row shape as before
  // this change — the new error fields default to null, never leak a
  // stray value into the success path.
  test("found_notice/no_changes success paths are unchanged: error_code and error_summary are both null", () => {
    for (const result of ["no_changes", "found_notice"] as const) {
      const payload = buildAutomatedSourceCheckInsert({
        sourceId: "fake-source-uuid",
        writerUserId: "fake-writer-uuid",
        result,
      });
      expect(payload.error_code).toBeNull();
      expect(payload.error_summary).toBeNull();
    }
  });

  test("the type only allows the two automatable outcomes (no generic status manipulation)", () => {
    const okValues: Array<"no_changes" | "found_notice"> = ["no_changes", "found_notice"];
    for (const result of okValues) {
      expect(buildAutomatedSourceCheckInsert({ sourceId: "s", writerUserId: "w", result }).result).toBe(result);
    }
  });

  // P0-2B — 'failed' added alongside the original two. These do not
  // remove or weaken the test above (both original outcomes still work
  // exactly as before, still asserted above) — they add coverage for the
  // new, objective (non-human-judgment) third outcome.
  test("failed insert mapping carries error_code and a sanitized error_summary", () => {
    const payload = buildAutomatedSourceCheckInsert({
      sourceId: "fake-source-uuid",
      writerUserId: "fake-writer-uuid",
      result: "failed",
      errorCode: "http_5xx",
      errorSummary: "Zaplanowane sprawdzenie: źródło odpowiedziało błędem serwera (5xx).",
    });
    expect(payload.result).toBe("failed");
    expect(payload.related_alert_id).toBeNull();
    expect(payload.created_by).toBe("fake-writer-uuid");
    expect(payload.source_id).toBe("fake-source-uuid");
    expect(payload.error_code).toBe("http_5xx");
    expect(payload.error_summary).toBe("Zaplanowane sprawdzenie: źródło odpowiedziało błędem serwera (5xx).");
  });

  test("error_code/error_summary are forced null for non-failed results, even if a caller mistakenly passes them", () => {
    // errorCode/errorSummary are plain optional fields on
    // AutomatedSourceCheckInput, not discriminated by `result` at the
    // type level — so this combination compiles, and the runtime guard
    // in buildAutomatedSourceCheckInsert is exactly what has to catch it.
    const payload = buildAutomatedSourceCheckInsert({
      sourceId: "fake-source-uuid",
      writerUserId: "fake-writer-uuid",
      result: "no_changes",
      errorCode: "http_5xx",
      errorSummary: "should never appear",
    });
    expect(payload.error_code).toBeNull();
    expect(payload.error_summary).toBeNull();
  });

  test("an error_summary longer than the live 200-char CHECK constraint is truncated, never rejected or left raw", () => {
    const longSummary = "x".repeat(250);
    const payload = buildAutomatedSourceCheckInsert({
      sourceId: "fake-source-uuid",
      writerUserId: "fake-writer-uuid",
      result: "failed",
      errorCode: "timeout_10s",
      errorSummary: longSummary,
    });
    expect(payload.error_summary).not.toBeNull();
    expect(payload.error_summary!.length).toBe(200);
  });

  test("a missing error_summary on a failed result becomes null, never an empty string", () => {
    const payload = buildAutomatedSourceCheckInsert({
      sourceId: "fake-source-uuid",
      writerUserId: "fake-writer-uuid",
      result: "failed",
      errorCode: "network_error",
    });
    expect(payload.error_summary).toBeNull();
  });
});

// ── describeAutomatedFetchFailure — bounded, Polish, exhaustive ─────────────

test.describe("describeAutomatedFetchFailure", () => {
  const ALL_DIAGNOSTICS = [
    "http_4xx",
    "http_5xx",
    "non_html_content_type",
    "network_error",
    "timeout_10s",
    "parse_exception",
  ] as const;

  for (const diagnostic of ALL_DIAGNOSTICS) {
    test(`${diagnostic} produces a non-empty, well-bounded Polish summary`, () => {
      const summary = describeAutomatedFetchFailure(diagnostic);
      expect(typeof summary).toBe("string");
      expect(summary.length).toBeGreaterThan(0);
      // Comfortably under the live 200-char source_checks CHECK
      // constraint on its own, before sanitizeErrorSummary even runs —
      // this function must never be the reason truncation is needed.
      expect(summary.length).toBeLessThanOrEqual(120);
    });
  }

  test("never leaks a raw exception message or stack-trace shape", () => {
    for (const diagnostic of ALL_DIAGNOSTICS) {
      const summary = describeAutomatedFetchFailure(diagnostic);
      expect(summary).not.toMatch(/at \S+\(|\.ts:\d+|\.js:\d+|Error:/);
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

function makeFakeWriter(
  existingTexts: string[] = [],
  // P0-2B — optional, defaults to the exact pre-existing behavior
  // (insertSourceCheck always succeeds) so every existing call site
  // above is completely unaffected. Only logFailedSourceCheck's own
  // tests below ever pass a non-default value, to cover its
  // never-throws-on-a-failed-insert path.
  options: { insertSourceCheckResult?: { ok: boolean } } = {}
) {
  const insertedCandidates: ReturnType<typeof buildPendingCandidateInsert>[] = [];
  const insertedChecks: ReturnType<typeof buildAutomatedSourceCheckInsert>[] = [];
  const findExistingCandidateTextsCalls: { sourceKey: string; registrySourceId: string | null }[] = [];
  const writer: ScheduledSourceWriter = {
    async findExistingCandidateTexts(sourceKey, registrySourceId) {
      findExistingCandidateTextsCalls.push({ sourceKey, registrySourceId });
      return [...existingTexts];
    },
    async insertPendingCandidate(payload) {
      insertedCandidates.push(payload);
      return { ok: true };
    },
    async insertSourceCheck(payload) {
      insertedChecks.push(payload);
      return options.insertSourceCheckResult ?? { ok: true };
    },
  };
  return { writer, insertedCandidates, insertedChecks, findExistingCandidateTextsCalls };
}

// ── logFailedSourceCheck — persists a failed scheduled fetch, never a
// candidate, never a publish (P0-2B) ────────────────────────────────────────

test.describe("logFailedSourceCheck", () => {
  test("A. registered source: persists source identity, error_code, error_summary, and inserts no candidate", async () => {
    const { writer, insertedCandidates, insertedChecks } = makeFakeWriter();
    const result = await logFailedSourceCheck(writer, {
      registrySourceId: "real-registry-uuid",
      writerUserId: "writer-uuid",
      diagnostic: "http_5xx",
    });
    expect(result.sourceChecksInserted).toBe(1);
    expect(insertedChecks).toHaveLength(1);
    expect(insertedChecks[0].source_id).toBe("real-registry-uuid");
    expect(insertedChecks[0].result).toBe("failed");
    expect(insertedChecks[0].error_code).toBe("http_5xx");
    expect(insertedChecks[0].error_summary).toBe(describeAutomatedFetchFailure("http_5xx"));
    expect(insertedChecks[0].related_alert_id).toBeNull();
    // C. a source's failure never fabricates a candidate — this code
    // path has no call to insertPendingCandidate at all.
    expect(insertedCandidates).toHaveLength(0);
  });

  test("unregistered source (no alert_sources mapping): never calls insertSourceCheck — source_checks.source_id is NOT NULL, nothing honest to insert", async () => {
    const { writer, insertedChecks, insertedCandidates } = makeFakeWriter();
    const result = await logFailedSourceCheck(writer, {
      registrySourceId: null,
      writerUserId: "writer-uuid",
      diagnostic: "timeout_10s",
    });
    expect(result.sourceChecksInserted).toBe(0);
    expect(insertedChecks).toHaveLength(0);
    expect(insertedCandidates).toHaveLength(0);
  });

  test("D. every diagnostic code produces a distinct, sanitized error_code/error_summary pair", async () => {
    const diagnostics: Array<Parameters<typeof describeAutomatedFetchFailure>[0]> = [
      "http_4xx",
      "http_5xx",
      "non_html_content_type",
      "network_error",
      "timeout_10s",
      "parse_exception",
    ];
    for (const diagnostic of diagnostics) {
      const { writer, insertedChecks } = makeFakeWriter();
      await logFailedSourceCheck(writer, {
        registrySourceId: "real-registry-uuid",
        writerUserId: "writer-uuid",
        diagnostic,
      });
      expect(insertedChecks[0].error_code).toBe(diagnostic);
      expect(insertedChecks[0].error_summary).toBe(describeAutomatedFetchFailure(diagnostic));
      expect(insertedChecks[0].error_summary!.length).toBeLessThanOrEqual(200);
    }
  });

  test("a failed insertSourceCheck call (DB-level failure) never throws and is reported as zero inserted, not a crash", async () => {
    const { writer } = makeFakeWriter([], { insertSourceCheckResult: { ok: false } });
    const result = await logFailedSourceCheck(writer, {
      registrySourceId: "real-registry-uuid",
      writerUserId: "writer-uuid",
      diagnostic: "parse_exception",
    });
    expect(result.sourceChecksInserted).toBe(0);
  });
});

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
    // P0-2B — error_code/error_summary added to the row shape (both null
    // here, correctly, since this is the pre-existing success path, not
    // a failure) — see the dedicated "found_notice/no_changes success
    // paths are unchanged" regression test above for the same guarantee
    // isolated from writeCandidatesForSource's own orchestration.
    expect(insertedChecks).toEqual([
      {
        source_id: "fake-source-uuid",
        result: "no_changes",
        related_alert_id: null,
        created_by: "fake-writer-uuid",
        error_code: null,
        error_summary: null,
      },
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
  test("found_notice insert mapping: inserts every new proposal as pending and logs found_notice (cap explicitly raised for this test)", async () => {
    const { writer, insertedCandidates, insertedChecks } = makeFakeWriter();
    // maxCandidatesToInsert explicitly raised above the default (1) to
    // exercise "insert every new proposal" in isolation from the cap,
    // which has its own dedicated test group below.
    const result = await writeCandidatesForSource(
      writer,
      {
        ...baseSourceInfo,
        proposals: [
          { title: "Komunikat A", excerpt: "Wycinek A", rawText: "Pełna treść A o czymś unikalnym", hasDate: true },
          { title: "Komunikat B", excerpt: "Wycinek B", rawText: "Zupełnie inna treść B o czymś innym", hasDate: false },
        ],
        registrySourceId: "fake-source-uuid",
      },
      10
    );
    expect(result.candidatesInserted).toBe(2);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.ambiguousCandidates).toBe(0);
    expect(result.cappedSkipped).toBe(0);
    expect(result.sourceChecksInserted).toBe(1);
    expect(insertedCandidates).toHaveLength(2);
    // P0-2B — same shape addition as the no_changes test above.
    expect(insertedChecks).toEqual([
      {
        source_id: "fake-source-uuid",
        result: "found_notice",
        related_alert_id: null,
        created_by: "fake-writer-uuid",
        error_code: null,
        error_summary: null,
      },
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

// ── First-live-write safety cap (Sprint 148) — server-side, never
// caller-controlled ─────────────────────────────────────────────────────────

test.describe("getMaxCandidatesPerInvocation — server-side cap, env-controlled only", () => {
  test("defaults to 1 (the conservative first-live-write value) when unset", () => {
    withEnv({ SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN: undefined }, () => {
      expect(getMaxCandidatesPerInvocation()).toBe(DEFAULT_MAX_CANDIDATES_PER_INVOCATION);
      expect(DEFAULT_MAX_CANDIDATES_PER_INVOCATION).toBe(1);
    });
  });

  test("falls back to the default for a non-numeric or negative value, never throws", () => {
    withEnv({ SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN: "not-a-number" }, () => {
      expect(getMaxCandidatesPerInvocation()).toBe(DEFAULT_MAX_CANDIDATES_PER_INVOCATION);
    });
    withEnv({ SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN: "-5" }, () => {
      expect(getMaxCandidatesPerInvocation()).toBe(DEFAULT_MAX_CANDIDATES_PER_INVOCATION);
    });
  });

  test("honors an explicit, valid env override", () => {
    withEnv({ SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN: "3" }, () => {
      expect(getMaxCandidatesPerInvocation()).toBe(3);
    });
  });
});

test.describe("getAllowedWriteSourceIds — server-side source restriction, never caller-controlled", () => {
  test("defaults to Michałowice only when unset", () => {
    withEnv({ SCHEDULED_WRITER_ALLOWED_SOURCE_IDS: undefined }, () => {
      expect(getAllowedWriteSourceIds()).toEqual(DEFAULT_ALLOWED_WRITE_SOURCE_IDS);
      expect(DEFAULT_ALLOWED_WRITE_SOURCE_IDS).toEqual(["michalowice-komunikaty"]);
    });
  });

  test("falls back to the default for malformed JSON, never throws", () => {
    withEnv({ SCHEDULED_WRITER_ALLOWED_SOURCE_IDS: "{not valid" }, () => {
      expect(getAllowedWriteSourceIds()).toEqual(DEFAULT_ALLOWED_WRITE_SOURCE_IDS);
    });
  });

  test("an override can never include a source outside the existing safe-check allowlist", () => {
    withEnv(
      { SCHEDULED_WRITER_ALLOWED_SOURCE_IDS: JSON.stringify(["michalowice-komunikaty", "https://evil.example/page"]) },
      () => {
        expect(getAllowedWriteSourceIds()).toEqual(["michalowice-komunikaty"]);
      }
    );
  });

  test("an explicit, valid override can widen to include WKD (a future, separate decision — not exercised by default)", () => {
    withEnv(
      { SCHEDULED_WRITER_ALLOWED_SOURCE_IDS: JSON.stringify(["michalowice-komunikaty", "wkd-aktualnosci"]) },
      () => {
        expect(getAllowedWriteSourceIds()).toEqual(["michalowice-komunikaty", "wkd-aktualnosci"]);
      }
    );
  });
});

test.describe("writeCandidatesForSource — first-live-write cap enforcement", () => {
  test("default cap (1): a second genuinely-new proposal is withheld, not inserted, not silently dropped", async () => {
    const { writer, insertedCandidates, insertedChecks } = makeFakeWriter();
    // No third argument passed — exercises the real default
    // (getMaxCandidatesPerInvocation(), which is 1 unless an env var is
    // set, and none is set in this test).
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        { title: "Komunikat A", excerpt: "e", rawText: "Zamknięcie przejazdu kolejowego na ulicy Kolejowej w Komorowie od piątku", hasDate: true },
        { title: "Komunikat B", excerpt: "e", rawText: "Przerwa w dostawie prądu w Nowej Wsi zaplanowana na środę wieczorem", hasDate: false },
      ],
      registrySourceId: "fake-source-uuid",
    });
    expect(result.candidatesInserted).toBe(1);
    expect(result.cappedSkipped).toBe(1);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.ambiguousCandidates).toBe(0);
    expect(insertedCandidates).toHaveLength(1);
    // A source_checks row is still logged — the cap only limits candidate
    // inserts, not the honest record that a check happened and found
    // notices.
    expect(insertedChecks).toHaveLength(1);
  });

  test("an explicit cap of 0 inserts nothing at all, but still classifies and logs honestly", async () => {
    const { writer, insertedCandidates } = makeFakeWriter();
    const result = await writeCandidatesForSource(
      writer,
      {
        ...baseSourceInfo,
        proposals: [{ title: "T", excerpt: "e", rawText: "Zupełnie nowa treść testowa", hasDate: false }],
        registrySourceId: "fake-source-uuid",
      },
      0
    );
    expect(result.candidatesInserted).toBe(0);
    expect(result.cappedSkipped).toBe(1);
    expect(insertedCandidates).toHaveLength(0);
  });

  test("the cap does not affect duplicate or ambiguous classification — only genuinely new proposals count against it", async () => {
    const existing = ["Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00"];
    const { writer, insertedCandidates } = makeFakeWriter(existing);
    const result = await writeCandidatesForSource(
      writer,
      {
        ...baseSourceInfo,
        proposals: [
          {
            title: "Duplikat",
            excerpt: "e",
            rawText: "Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00",
            hasDate: true,
          },
          { title: "Nowy", excerpt: "e", rawText: "Zupełnie nowa, inna treść o awarii wodociągu", hasDate: false },
        ],
        registrySourceId: "fake-source-uuid",
      },
      1
    );
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.candidatesInserted).toBe(1);
    expect(result.cappedSkipped).toBe(0);
    expect(insertedCandidates).toHaveLength(1);
  });
});
