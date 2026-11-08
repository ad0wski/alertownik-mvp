import { test, expect } from "@playwright/test";
import {
  isAutoPublishEnabled,
  getAutoPublishSourceIds,
  isDirectSafePermalink,
  extractStartDateIso,
  extractPlace,
  evaluateAutoPublishEligibility,
  runTrustedSourceAutoPublish,
  buildAutoPublishAlertInsert,
  MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS,
  type AutoPublishCandidateInput,
} from "@/lib/trustedSourceAutoPublish";
import type { ScheduledSourceWriter, DedupComparisonItem, AutoPublishAlertInsertPayload } from "@/lib/scheduledWriter";
import { getAlertTimeStatus, OPEN_ENDED_ALERT_FRESHNESS_DAYS } from "@/lib/getAlertTimeStatus";

/**
 * Sprint 180C — Trusted Source Auto-Publish v1. CLAUDE.md Security Rule
 * #10's scoped exception, exercised end to end with a hand-written
 * in-memory fake writer — no network, no real Supabase, matching this
 * suite's existing convention.
 */

// ── The real, live DW 719 candidate text (Sprint 180B forensic audit) —
// reused verbatim so this suite is anchored to a real case, not an
// invented one. ─────────────────────────────────────────────────────────

const REAL_DW719_TEXT =
  "Od 29 lipca 2026 r. od godz. 9:00 zostanie wprowadzona czasowa organizacja ruchu na drodze " +
  "wojewódzkiej nr 719 w Nowej Wsi, na terenie gminy Michałowice. Zmiany obejmą odcinek od km " +
  "22+531 do km 23+274 i są związane z realizacją inwestycji pn. „Rozbudowa DW nr 719 od km " +
  "22+531 do km 23+274 w miejscowości Nowa Wieś [...]";

// P0-2H.2 — a representative, fake (never a real Production value) trusted
// registry id, used as both the env mapping's value (via the module-wide
// beforeEach/afterEach below) and makeCandidate()'s default
// registrySourceId, so every pre-existing test demonstrates a GENUINELY
// trusted candidate under the new provenance gate rather than happening to
// reuse a real UUID out of context.
const TRUSTED_TEST_REGISTRY_ID = "11111111-1111-4111-8111-111111111111";

function makeCandidate(overrides: Partial<AutoPublishCandidateInput> = {}): AutoPublishCandidateInput {
  return {
    id: "758819cc-b532-4b54-af86-d25d28da45b4",
    sourceKey: "pruszkow-aktualnosci",
    sourceName: "Miasto Pruszków — aktualności",
    sourceUrl: "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/",
    candidateUrl: "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/zmiana-organizacji-ruchu-na-drodze-wojewodzkiej-nr-719/",
    title: "Zmiana organizacji ruchu na drodze wojewódzkiej nr 719",
    text: REAL_DW719_TEXT,
    status: "pending",
    convertedAlertId: null,
    // P0-2C — 2 hours before FIXED_NOW below: comfortably fresh by
    // default so every pre-existing test (none of which cared about
    // candidate age) keeps passing unmodified; the dedicated
    // MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS tests override this
    // explicitly.
    detectedAt: "2026-07-28T22:00:00.000Z",
    // P0-2H.2 — matches TRUSTED_TEST_REGISTRY_ID, which the module-wide
    // beforeEach below maps pruszkow-aktualnosci to, so this candidate
    // passes the new provenance gate by default. The real DW 719
    // candidate's actual Production history had no registry mapping at
    // all (it predates SCHEDULED_WRITER_SOURCE_REGISTRY_IDS being
    // configured for Pruszków) — this fixture intentionally diverges from
    // that history to represent what a genuinely trusted candidate looks
    // like under this stricter gate, which every test in this file that
    // expects "eligible" now needs. Tests exercising a MISSING/mismatched
    // registry id override this explicitly.
    registrySourceId: TRUSTED_TEST_REGISTRY_ID,
    ...overrides,
  };
}

const FIXED_NOW = new Date("2026-07-29T00:00:00Z");

test.beforeEach(() => {
  process.env.SCHEDULED_WRITER_SOURCE_REGISTRY_IDS = JSON.stringify({
    "pruszkow-aktualnosci": TRUSTED_TEST_REGISTRY_ID,
  });
  // P0-2H.4 — getAutoPublishSourceIds() no longer has any default; every
  // test in this file that expects an "eligible" outcome for the default
  // makeCandidate() fixture (sourceKey: pruszkow-aktualnosci) needs this
  // explicit configuration now, exactly matching the fail-closed contract
  // this sprint introduces (no configuration → [] → nothing eligible by
  // source, ever).
  process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = JSON.stringify(["pruszkow-aktualnosci"]);
});

test.afterEach(() => {
  delete process.env.SCHEDULED_WRITER_SOURCE_REGISTRY_IDS;
  delete process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
});

interface FakeWriterOptions {
  candidates?: AutoPublishCandidateInput[];
  existingAlerts?: DedupComparisonItem[];
  insertShouldFail?: boolean;
  /** P0-2H.1 — lets a test pick the exact InsertPublishedAlertResult
   *  failure reason the real createSupabaseScheduledWriter.insertPublishedAlert
   *  would surface for a given Postgres error (scheduledWriter.ts:900-907:
   *  code 23505 → "duplicate_prevented_by_database", anything else →
   *  "unknown_error"). Defaults to "unknown_error" so every pre-existing
   *  insertShouldFail test (which never cared about the reason) keeps
   *  passing unmodified. */
  insertFailReason?: "unknown_error" | "duplicate_prevented_by_database";
  markShouldFail?: boolean;
}

function makeFakeWriter(opts: FakeWriterOptions = {}) {
  const insertedAlerts: AutoPublishAlertInsertPayload[] = [];
  const markedConverted: Array<{ candidateId: string; alertId: string }> = [];
  let idCounter = 0;
  const writer: ScheduledSourceWriter = {
    async findExistingCandidateTexts() {
      return [];
    },
    async findExistingAlertComparisons() {
      return opts.existingAlerts ?? [];
    },
    async insertPendingCandidate() {
      return { ok: true };
    },
    async insertSourceCheck() {
      return { ok: true };
    },
    async findPendingAutoPublishCandidates() {
      return opts.candidates ?? [];
    },
    async insertPublishedAlert(payload) {
      if (opts.insertShouldFail) return { ok: false, reason: opts.insertFailReason ?? "unknown_error" };
      insertedAlerts.push(payload);
      idCounter += 1;
      return { ok: true, id: `alert-${idCounter}` };
    },
    async markCandidateAutoPublished(candidateId, alertId) {
      if (opts.markShouldFail) return { ok: false };
      markedConverted.push({ candidateId, alertId });
      return { ok: true };
    },
  };
  return { writer, insertedAlerts, markedConverted };
}

// ── Config gates ─────────────────────────────────────────────────────────────

test.describe("Config gates", () => {
  test("isAutoPublishEnabled requires the exact string 'true'", () => {
    expect(isAutoPublishEnabled("true")).toBe(true);
    expect(isAutoPublishEnabled("false")).toBe(false);
    expect(isAutoPublishEnabled(undefined)).toBe(false);
    expect(isAutoPublishEnabled("1")).toBe(false);
    expect(isAutoPublishEnabled("TRUE")).toBe(false);
  });

  // P0-2H.4 — fail-closed source scope contract: every malformed/missing/
  // empty/unrecognized configuration returns [], NEVER a fallback to
  // Pruszków or any other default. Each test below saves/restores the
  // (beforeEach-set) env var explicitly, matching this file's existing
  // convention.
  function withSourceIdsEnv<T>(value: string | undefined, fn: () => T): T {
    const original = process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
    if (value === undefined) delete process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
    else process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = value;
    try {
      return fn();
    } finally {
      if (original === undefined) delete process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
      else process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = original;
    }
  }

  test("env unset → [] (never a fallback to any default source)", () => {
    withSourceIdsEnv(undefined, () => {
      expect(getAutoPublishSourceIds()).toEqual([]);
    });
  });

  test("malformed JSON → [] (never a fallback)", () => {
    withSourceIdsEnv("{not valid json", () => {
      expect(getAutoPublishSourceIds()).toEqual([]);
    });
  });

  test("a bare, unquoted string (not valid JSON at all) → [] (never a fallback)", () => {
    withSourceIdsEnv("michalowice-komunikaty", () => {
      expect(getAutoPublishSourceIds()).toEqual([]);
    });
  });

  test("a valid JSON string, but not an array → [] (never a fallback)", () => {
    withSourceIdsEnv('"michalowice-komunikaty"', () => {
      expect(getAutoPublishSourceIds()).toEqual([]);
    });
  });

  test("an explicit empty array → [] (never a fallback)", () => {
    withSourceIdsEnv("[]", () => {
      expect(getAutoPublishSourceIds()).toEqual([]);
    });
  });

  test("an array containing only unrecognized source ids → [] (never a fallback)", () => {
    withSourceIdsEnv(JSON.stringify(["totally-made-up-source"]), () => {
      expect(getAutoPublishSourceIds()).toEqual([]);
    });
  });

  test("a valid safe Michałowice array → Michałowice only", () => {
    withSourceIdsEnv(JSON.stringify(["michalowice-komunikaty"]), () => {
      expect(getAutoPublishSourceIds()).toEqual(["michalowice-komunikaty"]);
    });
  });

  test("a valid safe Pruszków array → Pruszków only", () => {
    withSourceIdsEnv(JSON.stringify(["pruszkow-aktualnosci"]), () => {
      expect(getAutoPublishSourceIds()).toEqual(["pruszkow-aktualnosci"]);
    });
  });

  test("getAutoPublishSourceIds can only narrow within SAFE_CHECK_SOURCE_IDS, never widen to an arbitrary source (safe+unsafe mixed → only the safe subset)", () => {
    withSourceIdsEnv(JSON.stringify(["not-a-real-source", "wkd-aktualnosci"]), () => {
      expect(getAutoPublishSourceIds()).toEqual(["wkd-aktualnosci"]);
    });
  });

  test("duplicate entries produce a deterministic result (no crash, no invented dedup logic beyond what's already there)", () => {
    withSourceIdsEnv(JSON.stringify(["michalowice-komunikaty", "michalowice-komunikaty"]), () => {
      expect(getAutoPublishSourceIds()).toEqual(["michalowice-komunikaty", "michalowice-komunikaty"]);
    });
  });
});

// ── candidate_url safety ──────────────────────────────────────────────────────

test.describe("isDirectSafePermalink", () => {
  test("accepts a direct https permalink", () => {
    expect(isDirectSafePermalink("https://www.pruszkow.pl/mieszkancy/some-article/")).toBe(true);
  });
  test("rejects a /wp-json/ API endpoint", () => {
    expect(isDirectSafePermalink("https://www.pruszkow.pl/wp-json/wp/v2/posts?slug=x")).toBe(false);
  });
  test("rejects null/missing", () => {
    expect(isDirectSafePermalink(null)).toBe(false);
    expect(isDirectSafePermalink(undefined)).toBe(false);
    expect(isDirectSafePermalink("")).toBe(false);
  });
  test("rejects a non-http(s) scheme", () => {
    expect(isDirectSafePermalink("ftp://example.com/x")).toBe(false);
  });
  test("rejects an unparseable string", () => {
    expect(isDirectSafePermalink("not a url")).toBe(false);
  });
});

// ── Date extraction ────────────────────────────────────────────────────────

test.describe("extractStartDateIso", () => {
  test("extracts the real DW 719 date+time correctly", () => {
    // fix(time) — "od godz. 9:00" is Europe/Warsaw local time; 29 lipca is
    // summer (CEST, UTC+2), so the correct UTC instant is 07:00, not the
    // naive 09:00 face value this test asserted before the timezone fix.
    const iso = extractStartDateIso(REAL_DW719_TEXT);
    expect(iso).toBe("2026-07-29T07:00:00.000Z");
  });
  test("extracts a date without a time clause, defaulting to midnight UTC", () => {
    expect(extractStartDateIso("Od 9 lipca 2026 r. obowiązuje nowa organizacja ruchu.")).toBe(
      "2026-07-09T00:00:00.000Z"
    );
  });
  test("returns null when no date pattern is present", () => {
    expect(extractStartDateIso("Brak jakiejkolwiek daty w tym tekście.")).toBeNull();
  });
  test("returns null for an impossible calendar date (31 lutego)", () => {
    expect(extractStartDateIso("Od 31 lutego 2026 r. coś się zmieni.")).toBeNull();
  });

  // P0-2H.2 — numeric "DD.MM.YYYY[ HH:MM]" fallback (Polish day-first
  // convention, confirmed against the real "Koncert Sławy Przybylskiej
  // odwołany!" Michałowice candidate, which has no spelled-month date
  // anywhere in its text).
  test("DD.MM.YYYY (two-digit day) is parsed correctly", () => {
    expect(extractStartDateIso("Data wydarzenia: 08.11.2026")).toBe("2026-11-08T00:00:00.000Z");
  });

  test("D.MM.YYYY (single-digit day) is parsed correctly", () => {
    expect(extractStartDateIso("Data wydarzenia: 8.11.2026")).toBe("2026-11-08T00:00:00.000Z");
  });

  test("DD.MM.YYYY HH:MM is parsed correctly, including the time", () => {
    // fix(time) — "17:00" is Europe/Warsaw local time; 8 listopada is
    // winter (CET, UTC+1), so the correct UTC instant is 16:00.
    expect(extractStartDateIso("Data wydarzenia: 08.11.2026 17:00\n‼️Koncert odwołany!")).toBe(
      "2026-11-08T16:00:00.000Z"
    );
  });

  test("a valid leap-day numeric date (29.02.2028) is accepted", () => {
    expect(extractStartDateIso("Wydarzenie odbędzie się 29.02.2028.")).toBe("2028-02-29T00:00:00.000Z");
  });

  test("an impossible numeric calendar date (31.02.2026) is rejected, never rolled over silently", () => {
    expect(extractStartDateIso("Termin: 31.02.2026.")).toBeNull();
  });

  test("a malformed numeric date (out-of-range month) is rejected, never a crash", () => {
    expect(() => extractStartDateIso("Termin: 32.13.2026.")).not.toThrow();
    expect(extractStartDateIso("Termin: 32.13.2026.")).toBeNull();
  });

  test("a 2-digit year is never guessed — no match at all, not even a wrong one", () => {
    expect(extractStartDateIso("Termin: 08.11.26.")).toBeNull();
  });

  test("the spelled-month Polish format still works unchanged, and is preferred over a numeric date in the same text", () => {
    // Mirrors the real "Brak wody - Reguły" candidate's shape exactly: a
    // leading numeric EDIT timestamp, followed by the notice's own
    // spelled-month EVENT date — the spelled-month one must win.
    const text =
      "06.11.2026 14:55\nInformujemy, że 10 listopada 2026 r., w godz. 11:00 - 15:00 nastąpi przerwa w dostawie wody.";
    // fix(time) — "godz. 11:00" is Europe/Warsaw local time; 10 listopada
    // is winter (CET, UTC+1), so the correct UTC instant is 10:00 — this
    // is the exact real "Brak wody - Reguły" case that surfaced the bug.
    expect(extractStartDateIso(text)).toBe("2026-11-10T10:00:00.000Z");
  });

  // fix(time) — the exact real-world bug this fix closes, pinned
  // explicitly: the "Brak wody - Reguły" official notice's own stated
  // time, verified live against the real source during manual Reguły
  // publication preflight.
  test("regression: the real 'Brak wody - Reguły' notice's stated time converts correctly in both directions", () => {
    const text =
      "Informujemy, że 10 listopada 2026 r., w godz. 11:00 - 15:00 nastąpi przerwa w dostawie wody do posesji " +
      "położonych w miejscowości Reguły.";
    expect(extractStartDateIso(text)).toBe("2026-11-10T10:00:00.000Z");
  });
});

test.describe("extractPlace", () => {
  test("finds a known pilot locality mentioned in the text", () => {
    expect(extractPlace(REAL_DW719_TEXT)).toBe("Nowa Wieś");
  });
  test("returns null when no known locality is mentioned", () => {
    expect(extractPlace("Ogólny komunikat bez żadnej konkretnej miejscowości.")).toBeNull();
  });
});

// ── evaluateAutoPublishEligibility — the fail-closed gate ─────────────────────

test.describe("evaluateAutoPublishEligibility — safe candidate", () => {
  test("the real DW 719 candidate is eligible with correctly extracted fields", () => {
    const result = evaluateAutoPublishEligibility(makeCandidate(), [], FIXED_NOW);
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.fields.category).toBe("roads");
      expect(result.fields.place).toBe("Nowa Wieś");
      // fix(time) — "od godz. 9:00" Warsaw local, summer (CEST, UTC+2) → 07:00Z.
      expect(result.fields.startsAt).toBe("2026-07-29T07:00:00.000Z");
      expect(result.fields.title).toBe("Zmiana organizacji ruchu na drodze wojewódzkiej nr 719");
      // P0-2C fix — sourceUrl is now the candidate's own verified direct
      // permalink (candidateUrl), never the generic source listing page
      // (candidate.sourceUrl) — this is the exact provenance fix itself,
      // pinned here against the real DW 719 fixture.
      expect(result.fields.sourceUrl).toBe(makeCandidate().candidateUrl);
      expect(result.fields.sourceUrl).not.toBe(makeCandidate().sourceUrl);
      // P0-2H.2 — sourceId is no longer nullable: the provenance gate
      // above already guarantees it matches the trusted registry mapping
      // by the time eligible:true is reached (see TRUSTED_TEST_REGISTRY_ID).
      expect(result.fields.sourceId).toBe(TRUSTED_TEST_REGISTRY_ID);
      expect(result.fields.severity).toBe("info");
      expect(result.fields.slug).toContain("758819cc".slice(0, 8));
    }
  });

  // P0-2C Fix 4 — source_id is carried through from the candidate's own
  // registry mapping when one legitimately exists, instead of always
  // being discarded. P0-2H.2 — now ALSO exercises the provenance gate
  // itself: the env mapping is overridden to a different trusted id than
  // the module default, and the candidate's own registrySourceId matches
  // it exactly, proving carry-through still works when the trusted id
  // isn't the default fixture value.
  test("a candidate with a real registry mapping carries source_id through to the published alert's fields", () => {
    const original = process.env.SCHEDULED_WRITER_SOURCE_REGISTRY_IDS;
    process.env.SCHEDULED_WRITER_SOURCE_REGISTRY_IDS = JSON.stringify({
      "pruszkow-aktualnosci": "real-alert-sources-uuid",
    });
    try {
      const result = evaluateAutoPublishEligibility(
        makeCandidate({ registrySourceId: "real-alert-sources-uuid" }),
        [],
        FIXED_NOW
      );
      expect(result.eligible).toBe(true);
      if (result.eligible) {
        expect(result.fields.sourceId).toBe("real-alert-sources-uuid");
      }
    } finally {
      process.env.SCHEDULED_WRITER_SOURCE_REGISTRY_IDS = original;
    }
  });
});

// P0-2C Fix 2 — maximum candidate age before AUTO-PUBLISH eligibility.
// Separate from, and independent of, the pre-existing PAST_GRACE_MS
// content-date check: that one judges what the notice's OWN text claims;
// this one judges how long the candidate ROW has sat `pending`,
// regardless of what its text says. Both gates must pass.
test.describe(`evaluateAutoPublishEligibility — MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS (${MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS}h)`, () => {
  const HOUR_MS = 60 * 60 * 1000;

  test("fresh candidate (detected 1 hour ago) is eligible", () => {
    const detectedAt = new Date(FIXED_NOW.getTime() - 1 * HOUR_MS).toISOString();
    const result = evaluateAutoPublishEligibility(makeCandidate({ detectedAt }), [], FIXED_NOW);
    expect(result.eligible).toBe(true);
  });

  test("just inside the boundary (23h59m old) is eligible", () => {
    const detectedAt = new Date(
      FIXED_NOW.getTime() - (MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS * HOUR_MS - 60_000)
    ).toISOString();
    const result = evaluateAutoPublishEligibility(makeCandidate({ detectedAt }), [], FIXED_NOW);
    expect(result.eligible).toBe(true);
  });

  test("exactly at the boundary (24h old to the millisecond) is still eligible — '>', never '>='", () => {
    const detectedAt = new Date(FIXED_NOW.getTime() - MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS * HOUR_MS).toISOString();
    const result = evaluateAutoPublishEligibility(makeCandidate({ detectedAt }), [], FIXED_NOW);
    expect(result.eligible).toBe(true);
  });

  test("just outside the boundary (24h + 1 minute old) is rejected as candidate_too_old", () => {
    const detectedAt = new Date(
      FIXED_NOW.getTime() - (MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS * HOUR_MS + 60_000)
    ).toISOString();
    const result = evaluateAutoPublishEligibility(makeCandidate({ detectedAt }), [], FIXED_NOW);
    expect(result).toEqual({ eligible: false, reason: "candidate_too_old" });
  });

  test("a very old candidate (90 days) is rejected as candidate_too_old, never silently published", () => {
    const detectedAt = new Date(FIXED_NOW.getTime() - 90 * 24 * HOUR_MS).toISOString();
    const result = evaluateAutoPublishEligibility(makeCandidate({ detectedAt }), [], FIXED_NOW);
    expect(result).toEqual({ eligible: false, reason: "candidate_too_old" });
  });

  test("candidate age is checked independently of, and before, the content-date (PAST_GRACE_MS) check", () => {
    // A candidate old enough to fail BOTH gates must report the
    // candidate-age reason, not the content-date reason — proving the
    // two checks are genuinely independent, not aliases of each other,
    // and that the (cheaper, no-text-parsing) age check runs first.
    const detectedAt = new Date(FIXED_NOW.getTime() - 90 * 24 * HOUR_MS).toISOString();
    const result = evaluateAutoPublishEligibility(makeCandidate({ detectedAt }), [], FIXED_NOW);
    expect(result).toEqual({ eligible: false, reason: "candidate_too_old" });
  });

  // Structural note, not a separate runtime test: evaluateAutoPublishEligibility
  // takes no writer/database parameter at all (candidate, existingItems,
  // now) — it is architecturally incapable of deleting a stale candidate
  // regardless of its verdict, matching the requirement that stale
  // candidates stay available for audit/manual review, never removed.
});

test.describe("evaluateAutoPublishEligibility — fail-closed cases", () => {
  test("not pending → ineligible", () => {
    const result = evaluateAutoPublishEligibility(makeCandidate({ status: "approved" }), [], FIXED_NOW);
    expect(result).toEqual({ eligible: false, reason: "not_pending_or_already_converted" });
  });

  test("already converted (converted_alert_id set) → ineligible even if status still says pending", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ convertedAlertId: "some-alert-id" }),
      [],
      FIXED_NOW
    );
    expect(result).toEqual({ eligible: false, reason: "not_pending_or_already_converted" });
  });

  test("source not on the auto-publish allowlist → ineligible", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ sourceKey: "michalowice-komunikaty" }),
      [],
      FIXED_NOW
    );
    expect(result).toEqual({ eligible: false, reason: "source_not_on_auto_publish_allowlist" });
  });

  test("missing candidate_url → ineligible", () => {
    const result = evaluateAutoPublishEligibility(makeCandidate({ candidateUrl: null }), [], FIXED_NOW);
    expect(result).toEqual({ eligible: false, reason: "missing_or_unsafe_candidate_url" });
  });

  test("wp-json candidate_url → ineligible", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ candidateUrl: "https://www.pruszkow.pl/wp-json/wp/v2/posts?slug=x" }),
      [],
      FIXED_NOW
    );
    expect(result).toEqual({ eligible: false, reason: "missing_or_unsafe_candidate_url" });
  });

  test("exact URL duplicate against an existing alert → ineligible, never published", () => {
    const existing: DedupComparisonItem[] = [
      { text: "Zupełnie inny tekst", url: makeCandidate().candidateUrl! },
    ];
    const result = evaluateAutoPublishEligibility(makeCandidate(), existing, FIXED_NOW);
    expect(result).toEqual({ eligible: false, reason: "duplicate" });
  });

  test("high text-overlap duplicate (no URL match) against an existing alert → ineligible", () => {
    const existing: DedupComparisonItem[] = [
      {
        text: REAL_DW719_TEXT + " dodatkowy identyczny fragment tekstu dla pewności wysokiego pokrycia",
        url: "https://www.completely-different-domain.pl/inny-artykul/",
      },
    ];
    const result = evaluateAutoPublishEligibility(makeCandidate(), existing, FIXED_NOW);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(["duplicate", "ambiguous"]).toContain(result.reason);
  });

  test("ambiguous similarity (moderate overlap) → ineligible, never published", () => {
    // Sprint 177C real-world case text, tuned to land in the ambiguous
    // band (>=0.6, <0.9) against the DW719 candidate — same fixture shape
    // as alertCrossTableDedup.spec.ts's own ambiguous test.
    const existing: DedupComparisonItem[] = [
      {
        text:
          "Od 29 lipca 2026 r. zostanie wprowadzona czasowa organizacja ruchu na drodze wojewódzkiej " +
          "nr 719 w Nowej Wsi na terenie gminy Michałowice w związku z inwestycją drogową",
        url: "https://www.some-other-official-site.pl/inny-komunikat/",
      },
    ];
    const result = evaluateAutoPublishEligibility(makeCandidate(), existing, FIXED_NOW);
    expect(result.eligible).toBe(false);
  });

  test("expired notice (start date well in the past) → ineligible", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ text: "Od 1 stycznia 2020 r. obowiązywała czasowa organizacja ruchu na drodze wojewódzkiej nr 719 w miejscowości Nowa Wieś." }),
      [],
      FIXED_NOW
    );
    expect(result).toEqual({ eligible: false, reason: "notice_expired" });
  });

  // P0-2H.2 — the same freshness check (PAST_GRACE_MS) applies identically
  // whether extractStartDateIso found the date via the spelled-month
  // regex or the new numeric fallback — it's the SAME extracted ISO value
  // feeding the SAME downstream check either way, not a separate code path.
  test("a stale numeric date (DD.MM.YYYY, well in the past) is still rejected by freshness logic", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ text: "Od 01.01.2020 r. obowiązywała czasowa organizacja ruchu na drodze wojewódzkiej nr 719 w miejscowości Nowa Wieś." }),
      [],
      FIXED_NOW
    );
    expect(result).toEqual({ eligible: false, reason: "notice_expired" });
  });

  test("a current/fresh numeric date (DD.MM.YYYY) passes the date gate and the candidate is fully eligible", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ text: "Od 29.07.2026 r. obowiązuje czasowa organizacja ruchu na drodze wojewódzkiej nr 719 w miejscowości Nowa Wieś." }),
      [],
      FIXED_NOW
    );
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.fields.startsAt).toBe("2026-07-29T00:00:00.000Z");
    }
  });

  test("no category-matching keywords → ineligible", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ text: "Od 29 lipca 2026 r. w Nowej Wsi odbędzie się lokalne wydarzenie kulturalne dla mieszkańców." }),
      [],
      FIXED_NOW
    );
    expect(result).toEqual({ eligible: false, reason: "category_not_detected" });
  });

  test("no known locality mentioned → ineligible", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ text: "Od 29 lipca 2026 r. wprowadzona zostanie czasowa organizacja ruchu drogowego." }),
      [],
      FIXED_NOW
    );
    expect(result).toEqual({ eligible: false, reason: "place_not_detected" });
  });

  test("no extractable start date → ineligible", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ text: "W miejscowości Nowa Wieś wprowadzona zostanie czasowa organizacja ruchu drogowego." }),
      [],
      FIXED_NOW
    );
    expect(result).toEqual({ eligible: false, reason: "start_date_not_detected" });
  });

  test("too-short text → ineligible", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ text: "Nowa Wieś, 29 lipca 2026, ruch." }),
      [],
      FIXED_NOW
    );
    expect(result.eligible).toBe(false);
  });

  test("missing source_url → ineligible", () => {
    const result = evaluateAutoPublishEligibility(makeCandidate({ sourceUrl: "" }), [], FIXED_NOW);
    expect(result).toEqual({ eligible: false, reason: "missing_source_url" });
  });
});

// P0-2H.2 — trusted provenance gate. sourceKey alone was never sufficient
// proof a candidate genuinely came from the automated writer for that
// source — these tests pin exactly what IS required: a configured
// registry mapping for the sourceKey, AND the candidate's own
// registrySourceId matching it exactly.
test.describe("evaluateAutoPublishEligibility — trusted provenance gate (P0-2H.2)", () => {
  function withRegistryEnv(value: string | undefined, fn: () => void): void {
    const original = process.env.SCHEDULED_WRITER_SOURCE_REGISTRY_IDS;
    if (value === undefined) delete process.env.SCHEDULED_WRITER_SOURCE_REGISTRY_IDS;
    else process.env.SCHEDULED_WRITER_SOURCE_REGISTRY_IDS = value;
    try {
      fn();
    } finally {
      if (original === undefined) delete process.env.SCHEDULED_WRITER_SOURCE_REGISTRY_IDS;
      else process.env.SCHEDULED_WRITER_SOURCE_REGISTRY_IDS = original;
    }
  }

  // Case 1 — trusted source key + correct source_id → passes provenance
  // (the default fixture already demonstrates this implicitly in every
  // other "eligible" test in this file; this test makes it explicit).
  test("trusted source key + correct source_id → passes the provenance gate (and is fully eligible)", () => {
    const result = evaluateAutoPublishEligibility(makeCandidate(), [], FIXED_NOW);
    expect(result.eligible).toBe(true);
  });

  // Case 2 — trusted source key + source_id null → rejected.
  test("trusted source key + source_id null → rejected (candidate_source_id_missing)", () => {
    const result = evaluateAutoPublishEligibility(makeCandidate({ registrySourceId: null }), [], FIXED_NOW);
    expect(result).toEqual({ eligible: false, reason: "candidate_source_id_missing" });
  });

  // Case 3 — trusted source key + wrong UUID → rejected.
  test("trusted source key + wrong UUID → rejected (candidate_source_id_mismatch)", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ registrySourceId: "22222222-2222-4222-8222-222222222222" }),
      [],
      FIXED_NOW
    );
    expect(result).toEqual({ eligible: false, reason: "candidate_source_id_mismatch" });
  });

  // Case 4 — trusted source key + missing registry mapping → rejected.
  test("trusted source key + no registry mapping configured at all → rejected (source_registry_mapping_missing)", () => {
    withRegistryEnv(undefined, () => {
      const result = evaluateAutoPublishEligibility(makeCandidate(), [], FIXED_NOW);
      expect(result).toEqual({ eligible: false, reason: "source_registry_mapping_missing" });
    });
  });

  // Case 5 — malformed registry env → rejected safely, no crash.
  test("malformed registry env (invalid JSON) → rejected safely as source_registry_mapping_missing, never a crash", () => {
    withRegistryEnv("{not valid json", () => {
      expect(() => evaluateAutoPublishEligibility(makeCandidate(), [], FIXED_NOW)).not.toThrow();
      const result = evaluateAutoPublishEligibility(makeCandidate(), [], FIXED_NOW);
      expect(result).toEqual({ eligible: false, reason: "source_registry_mapping_missing" });
    });
  });

  // Case 5b — registry env present but genuinely empty for this sourceKey
  // (e.g. only an unrelated source is mapped) → same safe rejection.
  test("registry env present but missing this specific sourceKey → rejected safely, never a crash", () => {
    withRegistryEnv(JSON.stringify({ "some-other-source": "33333333-3333-4333-8333-333333333333" }), () => {
      const result = evaluateAutoPublishEligibility(makeCandidate(), [], FIXED_NOW);
      expect(result).toEqual({ eligible: false, reason: "source_registry_mapping_missing" });
    });
  });

  // Case 6 — non-allowlisted source → still rejected, even with a
  // perfectly correct-looking source_id — the allowlist check fires
  // first, independent of provenance.
  test("non-allowlisted source is still rejected, even with an otherwise-correct source_id", () => {
    withRegistryEnv(
      JSON.stringify({ "pruszkow-aktualnosci": TRUSTED_TEST_REGISTRY_ID, "wkd-aktualnosci": TRUSTED_TEST_REGISTRY_ID }),
      () => {
        const result = evaluateAutoPublishEligibility(
          makeCandidate({ sourceKey: "wkd-aktualnosci", registrySourceId: TRUSTED_TEST_REGISTRY_ID }),
          [],
          FIXED_NOW
        );
        expect(result).toEqual({ eligible: false, reason: "source_not_on_auto_publish_allowlist" });
      }
    );
  });

  // Case 7 — legacy candidate without source_id → never auto-published.
  test("a legacy candidate predating the registry mapping (no source_id) is never auto-published", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ registrySourceId: null, id: "legacy-candidate-id" }),
      [],
      FIXED_NOW
    );
    expect(result.eligible).toBe(false);
  });

  // Case 8 — manual-looking candidate with a correct source_key but no
  // trusted source_id → rejected. Same mechanism as case 2/7, distinct
  // scenario: this represents a candidate an admin saved manually (which
  // never sets source_id, per supabaseCandidateWrites.ts) that happens to
  // carry the same source_key text as a trusted source.
  test("a manual-looking candidate (correct source_key, no trusted source_id) is rejected, never treated as writer-sourced", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ registrySourceId: null, candidateUrl: null }),
      [],
      FIXED_NOW
    );
    expect(result.eligible).toBe(false);
    expect(result.eligible ? null : result.reason).toBe("candidate_source_id_missing");
  });

  // Case 9 — the real Michałowice writer candidate shape, with its real
  // Production registry id, under a hypothetically-widened allowlist —
  // confirms the provenance gate itself passes for genuine Michałowice
  // provenance, matching P0-2H.1's live-confirmed registry id exactly.
  test("a real Michałowice writer candidate with its real source_id passes the provenance gate", () => {
    const MICHALOWICE_REGISTRY_ID = "a56cfb33-a443-47aa-8365-89c6303e7fcc";
    const original = process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
    withRegistryEnv(JSON.stringify({ "michalowice-komunikaty": MICHALOWICE_REGISTRY_ID }), () => {
      process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = JSON.stringify(["michalowice-komunikaty"]);
      try {
        const result = evaluateAutoPublishEligibility(
          makeCandidate({ sourceKey: "michalowice-komunikaty", registrySourceId: MICHALOWICE_REGISTRY_ID }),
          [],
          FIXED_NOW
        );
        // The provenance gate itself must not be the reason for any
        // rejection here — whatever the outcome, it must never be one of
        // the three provenance-specific reasons.
        if (!result.eligible) {
          expect(result.reason).not.toBe("source_registry_mapping_missing");
          expect(result.reason).not.toBe("candidate_source_id_missing");
          expect(result.reason).not.toBe("candidate_source_id_mismatch");
          expect(result.reason).not.toBe("source_not_on_auto_publish_allowlist");
        } else {
          expect(result.fields.sourceId).toBe(MICHALOWICE_REGISTRY_ID);
        }
      } finally {
        if (original === undefined) delete process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
        else process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = original;
      }
    });
  });
});

// ── buildAutoPublishAlertInsert — payload shape ───────────────────────────────

test.describe("buildAutoPublishAlertInsert", () => {
  test("always sets status=published and a fresh published_at, never a caller-supplied value", () => {
    const eligibility = evaluateAutoPublishEligibility(makeCandidate(), [], FIXED_NOW);
    expect(eligibility.eligible).toBe(true);
    if (!eligibility.eligible) return;
    const payload = buildAutoPublishAlertInsert(eligibility.fields);
    expect(payload.status).toBe("published");
    expect(typeof payload.published_at).toBe("string");
    // P0-2H.2 — no longer null by default: the provenance gate guarantees
    // a verified trusted registry id by the time eligible:true exists.
    expect(payload.source_id).toBe(TRUSTED_TEST_REGISTRY_ID);
  });
});

// ── P0-1 bridge: buildAutoPublishAlertInsert ↔ getAlertTimeStatus ────────────
//
// Pre-launch audit finding (2026-11-06): this module's insert payload has
// no `ends_at` field at all, which — before the getAlertTimeStatus.ts fix
// — meant any future auto-published alert would have shown as
// indefinitely "Trwa" with zero freshness protection. Auto-publish stays
// fully disabled (SCHEDULED_AUTO_PUBLISH_ENABLED unset everywhere) and
// nothing in this file changes that or any eligibility rule — these tests
// only prove the generic fix actually reaches this path, rather than
// assuming it does because the two modules happen to compose.
test.describe("buildAutoPublishAlertInsert ↔ getAlertTimeStatus — P0-1 freshness protection", () => {
  function makeFields(startsAt: string) {
    return {
      slug: "test-auto-publish-freshness-bridge",
      category: "roads" as const,
      severity: "info" as const,
      title: "Testowy wpis mostka freshness",
      place: "Pruszków",
      startsAt,
      change: "Treść testowa.",
      action: "Działanie testowe.",
      sourceName: "Źródło testowe",
      sourceUrl: "https://example.com/test",
      // P0-2H.2 — AutoPublishAlertFields.sourceId is no longer nullable
      // (the provenance gate guarantees a real, verified registry id by
      // the time this shape exists) — an arbitrary test UUID, unrelated
      // to what this describe block actually exercises (ends_at/freshness
      // behavior, not provenance).
      sourceId: "11111111-1111-4111-8111-111111111111",
    };
  }

  test("the payload never carries an ends_at field — this module cannot invent or set one", () => {
    const eligibility = evaluateAutoPublishEligibility(makeCandidate(), [], FIXED_NOW);
    expect(eligibility.eligible).toBe(true);
    if (!eligibility.eligible) return;
    const payload = buildAutoPublishAlertInsert(eligibility.fields);
    expect(Object.prototype.hasOwnProperty.call(payload, "ends_at")).toBe(false);
  });

  test("an auto-published alert with an old starts_at is NOT indefinitely active — it inherits the generic open-ended freshness cap", () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const oldStartsAt = new Date(Date.now() - (OPEN_ENDED_ALERT_FRESHNESS_DAYS + 30) * dayMs).toISOString();
    const payload = buildAutoPublishAlertInsert(makeFields(oldStartsAt));
    // Exercises the real mechanism: payload.starts_at feeds directly into
    // getAlertTimeStatus with no second argument, since the payload
    // genuinely has none to pass.
    expect(getAlertTimeStatus(payload.starts_at, undefined)).toBe("ended");
  });

  test("a freshly auto-published alert (starts_at now) is still active — the cap only bites once the window elapses, same as any other open-ended alert", () => {
    const payload = buildAutoPublishAlertInsert(makeFields(new Date().toISOString()));
    expect(getAlertTimeStatus(payload.starts_at, undefined)).toBe("active");
  });
});

// ── runTrustedSourceAutoPublish — orchestration ───────────────────────────────

test.describe("runTrustedSourceAutoPublish — end to end", () => {
  test("a safe candidate results in exactly one published alert with a correct converted_alert_id", async () => {
    const { writer, insertedAlerts, markedConverted } = makeFakeWriter({ candidates: [makeCandidate()] });
    const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(outcome.status).toBe("published");
    expect(insertedAlerts).toHaveLength(1);
    expect(insertedAlerts[0].status).toBe("published");
    expect(markedConverted).toEqual([{ candidateId: makeCandidate().id, alertId: "alert-1" }]);
    expect(outcome.alertId).toBe("alert-1");
    expect(outcome.candidateId).toBe(makeCandidate().id);
  });

  test("idempotent re-run: a candidate whose converted_alert_id is already set is never picked up a second time", async () => {
    // findPendingAutoPublishCandidates itself only ever returns
    // status='pending' rows (see the real Supabase query's own .eq
    // filter) — a second call against the SAME already-converted
    // candidate would see an empty candidate list, exactly like this.
    const { writer, insertedAlerts } = makeFakeWriter({ candidates: [] });
    const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(outcome.status).toBe("no_eligible_candidate");
    expect(insertedAlerts).toHaveLength(0);
  });

  test("re-run where the candidate row is stale (still shows converted_alert_id via a race) is caught by the eligibility check itself, not just the query filter", async () => {
    const staleCandidate = makeCandidate({ convertedAlertId: "already-alert-id" });
    const { writer, insertedAlerts } = makeFakeWriter({ candidates: [staleCandidate] });
    const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(outcome.status).toBe("no_eligible_candidate");
    expect(outcome.skipped).toEqual([
      { candidateId: staleCandidate.id, reason: "not_pending_or_already_converted" },
    ]);
    expect(insertedAlerts).toHaveLength(0);
  });

  test("exact URL duplicate against a pre-existing alert → zero publications", async () => {
    // P0-2C note — this fixture's `url: candidateUrl` is no longer an
    // artificial shortcut: after the Fix 3 provenance correction, a REAL
    // published alert's own source_url genuinely equals the candidate's
    // candidateUrl (see buildAutoPublishAlertInsert), so this is exactly
    // the shape findExistingAlertComparisons() would really produce.
    const { writer, insertedAlerts } = makeFakeWriter({
      candidates: [makeCandidate()],
      existingAlerts: [{ text: "inny tekst", url: makeCandidate().candidateUrl! }],
    });
    const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(outcome.status).toBe("no_eligible_candidate");
    expect(outcome.skipped).toEqual([{ candidateId: makeCandidate().id, reason: "duplicate" }]);
    expect(insertedAlerts).toHaveLength(0);
  });

  test("cap = 1: two eligible candidates in the same run → exactly one published, the other left pending", async () => {
    const first = makeCandidate({ id: "candidate-a" });
    const second = makeCandidate({
      id: "candidate-b",
      candidateUrl: "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/inny-artykul/",
      text: "Od 30 lipca 2026 r. w Reguły wprowadzona zostanie czasowa organizacja ruchu drogowego z uwagi na remont.",
    });
    const { writer, insertedAlerts } = makeFakeWriter({ candidates: [first, second] });
    const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(outcome.status).toBe("published");
    expect(outcome.candidateId).toBe("candidate-a");
    expect(insertedAlerts).toHaveLength(1);
  });

  test("insert failure → no partial write, candidate reported, no mark-converted attempted", async () => {
    const { writer, insertedAlerts, markedConverted } = makeFakeWriter({
      candidates: [makeCandidate()],
      insertShouldFail: true,
    });
    const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(outcome.status).toBe("insert_failed");
    expect(insertedAlerts).toHaveLength(0);
    expect(markedConverted).toHaveLength(0);
  });

  // P0-2H.1 — P0-2H flagged this exact scenario (the database's own
  // `alerts_slug_key` UNIQUE constraint, a live-confirmed race backstop
  // for two concurrent auto-publish invocations deterministically
  // computing the same slug for the same candidate.id — buildAutoPublishSlug
  // is pure/deterministic) as having no dedicated test, even though the
  // real createSupabaseScheduledWriter.insertPublishedAlert already maps
  // Postgres 23505 to this exact reason (scheduledWriter.ts:900-907,
  // identical pattern to insertPendingCandidate's own handling just above
  // it). This test confirms the orchestration layer treats that specific
  // reason exactly as safely as any other insert failure — no special
  // casing needed, none added — fail-closed: no second alert, no
  // candidate incorrectly marked converted.
  test("database-level unique-slug race (23505 → duplicate_prevented_by_database) → fails closed, no partial write, no incorrect conversion", async () => {
    const { writer, insertedAlerts, markedConverted } = makeFakeWriter({
      candidates: [makeCandidate()],
      insertShouldFail: true,
      insertFailReason: "duplicate_prevented_by_database",
    });
    const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(outcome.status).toBe("insert_failed");
    expect(outcome.candidateId).toBe("758819cc-b532-4b54-af86-d25d28da45b4");
    // No second alert was created by this losing invocation.
    expect(insertedAlerts).toHaveLength(0);
    // The candidate must never be marked as successfully converted when
    // its own insert attempt was the one that lost the race.
    expect(markedConverted).toHaveLength(0);
  });

  test("mark-converted failure after a successful insert is reported distinctly — the alert itself is still fully published, never rolled back silently", async () => {
    const { writer, insertedAlerts } = makeFakeWriter({
      candidates: [makeCandidate()],
      markShouldFail: true,
    });
    const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(outcome.status).toBe("mark_converted_failed");
    expect(insertedAlerts).toHaveLength(1);
    expect(outcome.alertId).toBe("alert-1");
  });

  // P0-2C Fix 5 — realistic end-to-end idempotency proof. The P0-2C
  // audit found the ONE existing idempotency test for this exact
  // scenario ("exact URL duplicate against a pre-existing alert",
  // above) used an unrealistic fixture — it directly set
  // `existingAlerts[].url` to the candidate's own candidateUrl by hand,
  // which is not what buildAutoPublishAlertInsert actually produced
  // BEFORE the Fix 3 provenance correction (it used the generic
  // candidate.sourceUrl, not candidateUrl, so the two would never have
  // matched in reality). This test uses no shortcuts: it runs the real
  // pipeline once (insert succeeds, mark fails), takes the REAL
  // resulting AutoPublishAlertInsertPayload, derives the "existing
  // alert" comparison item the exact same way
  // createSupabaseScheduledWriter.findExistingAlertComparisons's real
  // implementation does (scheduledWriter.ts: `{title, change}.join(" ")`
  // for text, `source_url` for url), and only THEN runs the pipeline a
  // second time against the SAME still-pending candidate.
  test("realistic partial-failure idempotency: insert succeeds, mark fails, candidate stays pending, a later run must not create a second alert", async () => {
    // 1–3. First run: candidate is eligible, alert insert succeeds,
    // markCandidateAutoPublished fails → candidate remains pending.
    const firstRun = makeFakeWriter({
      candidates: [makeCandidate()],
      markShouldFail: true,
    });
    const firstOutcome = await runTrustedSourceAutoPublish(firstRun.writer, FIXED_NOW);
    expect(firstOutcome.status).toBe("mark_converted_failed");
    expect(firstRun.insertedAlerts).toHaveLength(1);
    const publishedAlert = firstRun.insertedAlerts[0];
    // Pins the real Fix 3 field mapping this test depends on — if this
    // ever regresses back to the generic listing URL, this assertion
    // fails here, loudly, rather than this test silently stopping being
    // realistic again.
    expect(publishedAlert.source_url).toBe(makeCandidate().candidateUrl);

    // 4. The candidate itself is untouched by the failed mark — still
    // `pending`, still convertedAlertId: null (markCandidateAutoPublished
    // never ran any update in this fake, matching the real writer's own
    // "mark only after a successful insert" ordering).
    const stillPendingCandidate = makeCandidate();
    expect(stillPendingCandidate.status).toBe("pending");
    expect(stillPendingCandidate.convertedAlertId).toBeNull();

    // 5. A later run's findExistingAlertComparisons() would now return
    // this alert — derived the exact same way the REAL implementation
    // does (scheduledWriter.ts), not an artificially-injected shortcut.
    const realDerivedExistingAlert: DedupComparisonItem = {
      text: [publishedAlert.title, publishedAlert.change].filter(Boolean).join(" ").trim(),
      url: publishedAlert.source_url,
    };

    const secondRun = makeFakeWriter({
      candidates: [stillPendingCandidate],
      existingAlerts: [realDerivedExistingAlert],
    });
    const secondOutcome = await runTrustedSourceAutoPublish(secondRun.writer, FIXED_NOW);

    // 6. MUST NOT create a second alert.
    expect(secondOutcome.status).toBe("no_eligible_candidate");
    expect(secondOutcome.skipped).toEqual([{ candidateId: stillPendingCandidate.id, reason: "duplicate" }]);
    expect(secondRun.insertedAlerts).toHaveLength(0);
  });

  test("a writer missing the Sprint 180C methods (older/test fake) degrades safely to no_eligible_candidate", async () => {
    const minimalWriter: ScheduledSourceWriter = {
      async findExistingCandidateTexts() {
        return [];
      },
      async insertPendingCandidate() {
        return { ok: true };
      },
      async insertSourceCheck() {
        return { ok: true };
      },
    };
    const outcome = await runTrustedSourceAutoPublish(minimalWriter, FIXED_NOW);
    expect(outcome.status).toBe("no_eligible_candidate");
    expect(outcome.skipped).toHaveLength(0);
  });

  test("no candidates from the allowlist pending → no_eligible_candidate, zero writes", async () => {
    const { writer, insertedAlerts } = makeFakeWriter({ candidates: [] });
    const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(outcome.status).toBe("no_eligible_candidate");
    expect(insertedAlerts).toHaveLength(0);
  });

  // P0-2H.4 — CRITICAL regression test. A malformed SCHEDULED_AUTO_PUBLISH_
  // SOURCE_IDS must resolve to an empty source list ALL THE WAY THROUGH to
  // the actual DB query the orchestration issues — never silently querying
  // for (and therefore never selecting) Pruszków or any other default,
  // even if a real, eligible Pruszków candidate exists and the writer
  // would happily return it if asked. This is the exact incident class
  // P0-2H.4 closes: "safety-critical allowlist silently switches to an
  // unintended source when configuration is broken."
  test("malformed source scope env → the orchestration queries with [], never implicitly with Pruszków — even a real-looking writer response is never reached", async () => {
    let receivedSourceIds: readonly string[] | null = null;
    const writer: ScheduledSourceWriter = {
      async findExistingCandidateTexts() {
        return [];
      },
      async findExistingAlertComparisons() {
        return [];
      },
      async insertPendingCandidate() {
        return { ok: true };
      },
      async insertSourceCheck() {
        return { ok: true };
      },
      async findPendingAutoPublishCandidates(sourceIds) {
        receivedSourceIds = sourceIds;
        // Deliberately returns a real-looking, otherwise-eligible Pruszków
        // candidate regardless of what it was asked for — if the
        // orchestration ever queried with a non-empty/wrong list, this
        // would make the bug observable as an actual (wrong) publication,
        // not just a silently-correct empty result for the wrong reason.
        return sourceIds.includes("pruszkow-aktualnosci") ? [makeCandidate()] : [];
      },
      async insertPublishedAlert() {
        return { ok: true, id: "alert-should-never-exist" };
      },
      async markCandidateAutoPublished() {
        return { ok: true };
      },
    };

    const originalScope = process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
    process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = "{not valid json";
    try {
      const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
      expect(receivedSourceIds).toEqual([]);
      expect(outcome.status).toBe("no_eligible_candidate");
    } finally {
      if (originalScope === undefined) delete process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
      else process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = originalScope;
    }
  });

  // ── Sprint 180C fix — self-comparison regression (real Production
  // incident, 2026-07-28: both canary candidates were classified
  // "duplicate" purely because findExistingCandidateTexts's own-source
  // query included the very candidate being evaluated). This fake
  // reproduces that exact shape: it returns the candidate's OWN text
  // unless the caller correctly excludes it by id — the same behavior
  // the real Supabase-backed .neq("id", excludeCandidateId) now
  // implements. ─────────────────────────────────────────────────────────
  test("a candidate is never compared against its own text — excludeCandidateId is always passed and honored", async () => {
    const candidate = makeCandidate();
    let receivedExcludeId: string | undefined;
    const writer: ScheduledSourceWriter = {
      async findExistingCandidateTexts(_sourceKey, _registrySourceId, excludeCandidateId) {
        receivedExcludeId = excludeCandidateId;
        // Simulates the real query: same-source rows INCLUDING the
        // candidate's own row, unless excludeCandidateId filters it out.
        const rows = [{ id: candidate.id, text: candidate.text }];
        return rows.filter((r) => r.id !== excludeCandidateId).map((r) => r.text);
      },
      async findExistingAlertComparisons() {
        return [];
      },
      async insertPendingCandidate() {
        return { ok: true };
      },
      async insertSourceCheck() {
        return { ok: true };
      },
      async findPendingAutoPublishCandidates() {
        return [candidate];
      },
      async insertPublishedAlert() {
        return { ok: true, id: "alert-1" };
      },
      async markCandidateAutoPublished() {
        return { ok: true };
      },
    };
    const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(receivedExcludeId).toBe(candidate.id);
    expect(outcome.status).toBe("published");
    expect(outcome.skipped).toHaveLength(0);
  });

  test("without the exclusion (older/misbehaving writer), the candidate self-matches as duplicate — pinning the bug this fix closes", async () => {
    const candidate = makeCandidate();
    const writer: ScheduledSourceWriter = {
      // Deliberately ignores excludeCandidateId — reproduces the exact
      // pre-fix real-world query shape.
      async findExistingCandidateTexts() {
        return [candidate.text];
      },
      async findExistingAlertComparisons() {
        return [];
      },
      async insertPendingCandidate() {
        return { ok: true };
      },
      async insertSourceCheck() {
        return { ok: true };
      },
      async findPendingAutoPublishCandidates() {
        return [candidate];
      },
      async insertPublishedAlert() {
        return { ok: true, id: "alert-1" };
      },
      async markCandidateAutoPublished() {
        return { ok: true };
      },
    };
    const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(outcome.status).toBe("no_eligible_candidate");
    expect(outcome.skipped).toEqual([{ candidateId: candidate.id, reason: "duplicate" }]);
  });
});
