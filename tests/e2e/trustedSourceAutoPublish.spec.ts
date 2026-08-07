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
  type AutoPublishCandidateInput,
} from "@/lib/trustedSourceAutoPublish";
import type { ScheduledSourceWriter, DedupComparisonItem, AutoPublishAlertInsertPayload } from "@/lib/scheduledWriter";
// Sprint 192 (F3B-S2TZR), section 9 — read-only import of the existing,
// UNMODIFIED public formatter (formatAlertDate.ts is not touched by this
// sprint) purely to confirm the Warsaw-converted starts_at value this
// module now produces round-trips back to the real stated hour through
// the same function every page (home/list/detail) already uses.
import { formatAlertDateTime } from "@/lib/formatAlertDate";

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
    ...overrides,
  };
}

const FIXED_NOW = new Date("2026-07-29T00:00:00Z");

interface FakeWriterOptions {
  candidates?: AutoPublishCandidateInput[];
  existingAlerts?: DedupComparisonItem[];
  insertShouldFail?: boolean;
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
      if (opts.insertShouldFail) return { ok: false, reason: "unknown_error" };
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

  test("getAutoPublishSourceIds defaults to pruszkow-aktualnosci only", () => {
    const original = process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
    delete process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
    try {
      expect(getAutoPublishSourceIds()).toEqual(["pruszkow-aktualnosci"]);
    } finally {
      if (original === undefined) delete process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
      else process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = original;
    }
  });

  test("getAutoPublishSourceIds can only narrow within SAFE_CHECK_SOURCE_IDS, never widen to an arbitrary source", () => {
    const original = process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
    process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = JSON.stringify(["not-a-real-source", "wkd-aktualnosci"]);
    try {
      expect(getAutoPublishSourceIds()).toEqual(["wkd-aktualnosci"]);
    } finally {
      if (original === undefined) delete process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
      else process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = original;
    }
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
  // Sprint 192 (F3B-S2TZR) — "godz. 9:00" in the real notice means
  // Europe/Warsaw local time, not literal UTC (product decision,
  // F3B-S2TZP audit). July 29 is CEST (UTC+2), so 9:00 Warsaw local is
  // 07:00 UTC. Was "2026-07-29T09:00:00.000Z" before this sprint's fix —
  // intentionally updated, not a regression: the old value was the
  // documented, confirmed bug this sprint closes.
  test("extracts the real DW 719 date+time correctly, converted from Europe/Warsaw local to UTC", () => {
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
  test("regression: the pre-existing named-month + comma + godz. shape still works, now Warsaw-converted", () => {
    expect(extractStartDateIso("Od 10 sierpnia 2026, godz. 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  // Sprint 192 (F3B-S2TZR) — winter (CET, UTC+1) named-month case, to
  // confirm the DST-aware conversion applies identically to both date
  // formats, not just the numeric one.
  test("named-month format in winter (CET, UTC+1) converts correctly", () => {
    expect(extractStartDateIso("Od 10 stycznia 2026 r. od godz. 7:00 coś się zmieni.")).toBe(
      "2026-01-10T06:00:00.000Z"
    );
  });

  test("named-month format without an explicit time clause keeps literal UTC midnight, never Warsaw-converted", () => {
    expect(extractStartDateIso("Od 10 sierpnia 2026 r. obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  // ── Sprint 192 (F3B-S2TZF) — named-month format now shares the exact
  // same fail-closed explicit-time parsing as the numeric format (review
  // finding: the old inline time group could silently match only a
  // plausible-looking PREFIX of a malformed clause and ignore the rest,
  // e.g. "godz. 123:00" → "12:00"). Every case below is a regression test
  // pinning that this can no longer happen. ──────────────────────────────

  test("named-month required positive: '10 sierpnia 2026, godz. 7:00' → Warsaw-converted", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("named-month required positive: '10 sierpnia 2026 r., godz. 7:00'", () => {
    expect(extractStartDateIso("10 sierpnia 2026 r., godz. 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("named-month required positive: '10 sierpnia 2026 r. od godz. 7:00'", () => {
    expect(extractStartDateIso("10 sierpnia 2026 r. od godz. 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("named-month required positive: '10 sierpnia 2026 godz. 7' (bare hour, no minute)", () => {
    expect(extractStartDateIso("10 sierpnia 2026 godz. 7 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("named-month required positive: '10 sierpnia 2026' bez godziny → UTC midnight", () => {
    expect(extractStartDateIso("10 sierpnia 2026 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  test("named-month required negative: 'godz. 123:00' → null, never truncated to 12:00", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 123:00 coś się zmieni.")).toBeNull();
  });

  test("named-month required negative: 'godz. 7:5' → null, never silently dropped to hour-only", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:5 coś się zmieni.")).toBeNull();
  });

  test("named-month required negative: 'godz. 24:00' → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 24:00 coś się zmieni.")).toBeNull();
  });

  test("named-month required negative: 'godz. 7:60' → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:60 coś się zmieni.")).toBeNull();
  });

  test("named-month required negative: 'godz. 07:000' → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 07:000 coś się zmieni.")).toBeNull();
  });

  test("named-month required negative: 'godz. -1:00' → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. -1:00 coś się zmieni.")).toBeNull();
  });

  // ── Sprint 192 (F3B-S2TZB) — keyword-boundary regression: "godz" is a
  // substring of several ordinary Polish words ("godzina", "godziny",
  // "godzinach", "pogodzenie") — none of them may be misdetected as a
  // time-clause keyword. A false-positive detection here previously
  // caused the WHOLE date extraction to fail (null) instead of correctly
  // falling back to date-only/midnight semantics. ────────────────────────

  test("keyword boundary: 'bez godziny' is NOT a time clause — date-only, midnight UTC", () => {
    expect(extractStartDateIso("10 sierpnia 2026 bez godziny obowiązuje zmiana.")).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  test("keyword boundary: 'w godzinach porannych' is NOT a time clause — date-only, midnight UTC", () => {
    expect(extractStartDateIso("10 sierpnia 2026 w godzinach porannych będą prowadzone prace.")).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  test("keyword boundary: 'pogodzenie prac' is NOT a time clause — date-only, midnight UTC", () => {
    expect(extractStartDateIso("10 sierpnia 2026 pogodzenie prac nie jest możliwe.")).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  test("keyword boundary: 'przez kilka godzin' is NOT a time clause — date-only, midnight UTC", () => {
    expect(extractStartDateIso("10 sierpnia 2026 przez kilka godzin trwać będą prace.")).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  test("keyword boundary: 'uzgodzenie terminu' is NOT a time clause — date-only, midnight UTC", () => {
    expect(extractStartDateIso("10 sierpnia 2026 uzgodzenie terminu jest w toku.")).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  test("keyword boundary: 'godz.' with a dot IS still recognized as the time clause", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("keyword boundary: 'od godz' without a dot IS still recognized as the time clause", () => {
    expect(extractStartDateIso("10 sierpnia 2026 od godz 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  // Optional support for the exact, standalone word "godzina" (never its
  // inflected forms "godziny"/"godzinach"/"godzinami" — those are the
  // NOT-a-keyword cases above).
  test("keyword boundary: the exact standalone word 'godzina' IS recognized as the time clause", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godzina 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  // ── Sprint 192 (F3B-S2TZC) — LEFT keyword boundary: "godz"/"godzina" is
  // a literal substring of "xgodz.", "pogodz.", "uzgodz.", "abcgodzina" —
  // none of these may be misdetected as the keyword just because it
  // appears glued to the end of a preceding, unrelated word/prefix with
  // no space. A review found the RIGHT-boundary lookahead alone was not
  // enough — the `[^\d]{0,20}` gap had no LEFT-boundary check, so it
  // could backtrack past letters of a preceding word right up to the
  // "godz" substring embedded inside it. Every case below must resolve
  // to plain date-only midnight, never an extracted hour and never null. ──

  test("left keyword boundary: 'xgodz.' is NOT the time clause — date-only, midnight UTC", () => {
    expect(extractStartDateIso("10 sierpnia 2026 xgodz. 7:00")).toBe("2026-08-10T00:00:00.000Z");
  });

  test("left keyword boundary: 'pogodz.' is NOT the time clause — date-only, midnight UTC", () => {
    expect(extractStartDateIso("10 sierpnia 2026 pogodz. 7:00")).toBe("2026-08-10T00:00:00.000Z");
  });

  test("left keyword boundary: 'uzgodz.' is NOT the time clause — date-only, midnight UTC", () => {
    expect(extractStartDateIso("10 sierpnia 2026 uzgodz. 7:00")).toBe("2026-08-10T00:00:00.000Z");
  });

  test("left keyword boundary: 'abcgodzina' is NOT the time clause — date-only, midnight UTC", () => {
    expect(extractStartDateIso("10 sierpnia 2026 abcgodzina 7:00")).toBe("2026-08-10T00:00:00.000Z");
  });

  // ── Sprint 192 (F3B-S2TZC) — full set of standalone-keyword positives,
  // gathered together per this sprint's own requirement (section 5). ──────

  test("standalone keyword: 'godz. 7:00' is recognized and Warsaw-converted", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00")).toBe("2026-08-10T05:00:00.000Z");
  });

  test("standalone keyword: 'godz 7:00' (no dot) is recognized", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz 7:00")).toBe("2026-08-10T05:00:00.000Z");
  });

  test("standalone keyword: 'godzina 7:00' is recognized", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godzina 7:00")).toBe("2026-08-10T05:00:00.000Z");
  });

  test("standalone keyword: 'r. od godz. 7:00' is recognized", () => {
    expect(extractStartDateIso("10 sierpnia 2026 r. od godz. 7:00")).toBe("2026-08-10T05:00:00.000Z");
  });

  // ── Sprint 192 (F3B-S2TZC) — Polish-letter glue, in addition to the
  // pre-existing ASCII-letter cases. ───────────────────────────────────────

  test("token boundary: 'godz. 7ąbc' → null (Polish letter glued directly)", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7ąbc coś się zmieni.")).toBeNull();
  });

  test("token boundary: 'godz. 7:00ąbc' → null (Polish letter glued directly)", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00ąbc coś się zmieni.")).toBeNull();
  });

  // ── Sprint 192 (F3B-S2TZC) — punctuation immediately continued by a
  // digit must be rejected; the same punctuation NOT continued by a digit
  // must remain accepted. ─────────────────────────────────────────────────

  test("punctuation + digit: 'godz. 7:00.30' → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00.30 coś się zmieni.")).toBeNull();
  });

  test("punctuation + digit: 'godz. 7:00,30' → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00,30 coś się zmieni.")).toBeNull();
  });

  test("punctuation + digit: 'godz. 7:00;30' → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00;30 coś się zmieni.")).toBeNull();
  });

  test("punctuation + digit: 'godz. 7:00!30' → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00!30 coś się zmieni.")).toBeNull();
  });

  test("punctuation + digit: 'godz. 7:00?30' → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00?30 coś się zmieni.")).toBeNull();
  });

  test("punctuation + digit: 'godz. 7:00)30' → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00)30 coś się zmieni.")).toBeNull();
  });

  test("punctuation without a following digit: '!' '?' remain accepted", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00! coś się zmieni.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00? coś się zmieni.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("punctuation then a full sentence: '.' and ',' remain accepted", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00. Nastąpi zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00, nastąpi zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  // ── Sprint 192 (F3B-S2TZC) — dash/en-dash: a genuine range (complete
  // second H:MM token) stays accepted; a malformed digit tail is rejected. ─

  test("dash range: 'godz. 7:00-30' (incomplete digit tail) → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00-30 coś się zmieni.")).toBeNull();
  });

  test("dash range: 'godz. 7:00–30' (en dash, incomplete digit tail) → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00–30 coś się zmieni.")).toBeNull();
  });

  test("dash range: 'godz. 7:00-15:00' (complete second token) stays accepted", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00-15:00 coś się zmieni.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  // ── Sprint 192 (F3B-S2TZB) — full time-token boundary: a parsed
  // hour[:minute] must never be accepted when glued directly to a letter,
  // another digit run, or a spurious extra separator. ────────────────────

  test("token boundary: 'godz. 7abc' → null, never accepted as hour 7", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7abc coś się zmieni.")).toBeNull();
  });

  test("token boundary: 'godz. 7:00abc' → null, never accepted as 7:00", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00abc coś się zmieni.")).toBeNull();
  });

  test("token boundary: 'godz. 7:00:30' → null, a glued seconds segment is not accepted", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00:30 coś się zmieni.")).toBeNull();
  });

  test("token boundary: 'godz. 7::00' → null, a doubled colon is not accepted", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7::00 coś się zmieni.")).toBeNull();
  });

  // ── Sprint 192 (F3B-S2TZB) — the dot separator's dual role: minute
  // separator when followed by exactly two digits, ordinary
  // sentence-ending punctuation otherwise — never silently reinterpreted
  // either way when what follows is ambiguous/malformed. ─────────────────

  test("dot separator: 'godz. 7.' (dot, nothing else) is a bare hour 7:00 — the dot is punctuation", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7.")).toBe("2026-08-10T05:00:00.000Z");
  });

  test("dot separator: 'godz. 7.30' (dot + two digits) is minute 7:30", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7.30 coś się zmieni.")).toBe(
      "2026-08-10T05:30:00.000Z"
    );
  });

  test("dot separator: 'godz. 7.3' (dot + one digit) → null, never treated as 7:00", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7.3 coś się zmieni.")).toBeNull();
  });

  test("dot separator: 'godz. 7.300' (dot + three digits) → null", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7.300 coś się zmieni.")).toBeNull();
  });

  // ── Sprint 192 (F3B-S2TZB) — allowed token boundaries: end of text,
  // whitespace + more sentence, and ordinary trailing punctuation must
  // all still work — the boundary fix must never require the whole
  // message to end right after the time. ─────────────────────────────────

  test("allowed boundary: comma immediately after the minute", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00, coś się zmieni.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("allowed boundary: period immediately after the minute", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00.")).toBe("2026-08-10T05:00:00.000Z");
  });

  test("allowed boundary: semicolon immediately after the minute", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00; coś się zmieni.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("allowed boundary: closing parenthesis immediately after the minute", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00) coś się zmieni.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("allowed boundary: en dash introducing a range immediately after the minute", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00–15:00 coś się zmieni.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("allowed boundary: whitespace then a whole further sentence", () => {
    expect(extractStartDateIso("10 sierpnia 2026, godz. 7:00 nastąpi zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });
});

// ── Sprint 192 (F3B-S2R) — numeric Polish date format, the second real
// form official notices use (pruszkow.pl: "10.08.2026 r., godz. 7:00"),
// alongside the pre-existing named-month format above. ─────────────────────

test.describe("extractStartDateIso — numeric format (Sprint 192)", () => {
  // Sprint 192 (F3B-S2TZR) — all four ISO expectations below were updated
  // from their pre-F3B-S2TZR values (literal "digits as UTC", e.g.
  // "2026-08-10T07:00:00.000Z") to the Warsaw-converted UTC instant — the
  // product decision confirmed after F3B-S2TZP's audit found the old
  // values displayed a 2-hour-wrong clock time to residents. Intentional,
  // not a regression.
  test("real official format: '10.08.2026 r., godz. 7:00' (summer, CEST UTC+2)", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("'od godz.' variant: '10.08.2026 r. od godz. 7:00'", () => {
    expect(extractStartDateIso("Od 10.08.2026 r. od godz. 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("variant without 'r.': '10.08.2026, godz. 07:00'", () => {
    expect(extractStartDateIso("Od 10.08.2026, godz. 07:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("variant with single-digit day and month: '1.8.2026 godz. 7:00'", () => {
    expect(extractStartDateIso("Od 1.8.2026 godz. 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-01T05:00:00.000Z"
    );
  });

  // Winter (CET, UTC+1) — matches this sprint's required example exactly.
  test("winter numeric format: '10.01.2026 r., godz. 7:00' (CET, UTC+1)", () => {
    expect(extractStartDateIso("Od 10.01.2026 r., godz. 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-01-10T06:00:00.000Z"
    );
  });

  test("numeric date without any time clause defaults to midnight UTC, never Warsaw-converted", () => {
    expect(extractStartDateIso("Od 10.08.2026 r. obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  // Sprint 192 (F3B-S2RF) — the exact whitespace-heavy shape review found
  // was previously silently misparsed as midnight instead of the real
  // time; expected value now also reflects the Warsaw conversion.
  test("real official format with extra whitespace around 'r.' and the comma still extracts the actual time", () => {
    expect(
      extractStartDateIso("Od 10.08.2026    r.  ,   godz.    7:00 obowiązuje zmiana organizacji ruchu.")
    ).toBe("2026-08-10T05:00:00.000Z");
  });

  test("leap-year date is accepted: '29.02.2028, godz. 7:00' (winter, CET UTC+1)", () => {
    expect(extractStartDateIso("Od 29.02.2028, godz. 7:00 coś się zmieni.")).toBe("2028-02-29T06:00:00.000Z");
  });

  // ── DST — fail closed, never guess (Sprint 192 / F3B-S2TZR) ────────────

  test("DST spring-forward gap: '29.03.2026, godz. 2:30' does not exist as a real Warsaw local time → null", () => {
    expect(extractStartDateIso("Od 29.03.2026, godz. 2:30 coś się zmieni.")).toBeNull();
  });

  test("DST autumn-back overlap: '25.10.2026, godz. 2:30' occurs twice as a real Warsaw local time → null", () => {
    expect(extractStartDateIso("Od 25.10.2026, godz. 2:30 coś się zmieni.")).toBeNull();
  });

  test("valid hour immediately before the spring gap (CET) converts correctly", () => {
    expect(extractStartDateIso("Od 29.03.2026, godz. 1:30 coś się zmieni.")).toBe("2026-03-29T00:30:00.000Z");
  });

  test("valid hour immediately after the spring gap (CEST) converts correctly", () => {
    expect(extractStartDateIso("Od 29.03.2026, godz. 3:30 coś się zmieni.")).toBe("2026-03-29T01:30:00.000Z");
  });

  test("valid hour immediately before the autumn clock-back (CEST, unambiguous) converts correctly", () => {
    expect(extractStartDateIso("Od 25.10.2026, godz. 1:30 coś się zmieni.")).toBe("2026-10-24T23:30:00.000Z");
  });

  test("valid hour immediately after the autumn clock-back (CET, unambiguous) converts correctly", () => {
    expect(extractStartDateIso("Od 25.10.2026, godz. 3:30 coś się zmieni.")).toBe("2026-10-25T02:30:00.000Z");
  });

  test("invalid: month 13", () => {
    expect(extractStartDateIso("Od 10.13.2026 r., godz. 7:00 coś się zmieni.")).toBeNull();
  });

  test("invalid: day 0", () => {
    expect(extractStartDateIso("Od 0.08.2026 r., godz. 7:00 coś się zmieni.")).toBeNull();
  });

  test("invalid: impossible calendar date 31.02.2026", () => {
    expect(extractStartDateIso("Od 31.02.2026 r., godz. 7:00 coś się zmieni.")).toBeNull();
  });

  test("invalid: 29.02.2025 — not a leap year", () => {
    expect(extractStartDateIso("Od 29.02.2025 r., godz. 7:00 coś się zmieni.")).toBeNull();
  });

  test("invalid: hour 24:00 is never a valid time", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 24:00 coś się zmieni.")).toBeNull();
  });

  test("invalid: minute 60 is never a valid time (Date.UTC would otherwise silently roll it into the next hour)", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7:60 coś się zmieni.")).toBeNull();
  });

  // Sprint 192 (F3B-S2RF) — review found these were previously silently
  // MISPARSED (never rejected): a 3-digit hour was truncated to its first
  // two digits, and a 1-digit minute was silently dropped, both defaulting
  // the rest of the (malformed) clause away instead of failing closed.
  test("invalid: three-digit hour is rejected outright, never truncated to a plausible 2-digit hour", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 123:00 coś się zmieni.")).toBeNull();
  });

  test("invalid: single-digit minute is rejected outright, never silently dropped to hour-only", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7:5 coś się zmieni.")).toBeNull();
  });

  test("invalid: three-digit minute is rejected outright", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 07:000 coś się zmieni.")).toBeNull();
  });

  test("invalid: negative-looking hour never parses as a valid time (no digit before ':' to match)", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. -1:00 coś się zmieni.")).toBeNull();
  });

  test("invalid: US-style slash-separated M/D/YYYY never matches (this parser is dot-separated only)", () => {
    expect(extractStartDateIso("Od 08/10/2026, godz. 7:00 coś się zmieni.")).toBeNull();
  });

  test("invalid: incomplete/random digit noise never matches", () => {
    expect(extractStartDateIso("Numer referencyjny 99.99.9999, brak daty.")).toBeNull();
    expect(extractStartDateIso("Kod 2026 bez żadnej pełnej daty.")).toBeNull();
  });

  // Sprint 192 (F3B-S2RF) — review found the un-anchored 4-digit year
  // group could partially match the first four digits of a longer digit
  // run instead of requiring an exact boundary.
  test("invalid: a longer digit run after the year is never truncated to a plausible 4-digit year", () => {
    expect(extractStartDateIso("Numer 10.08.20260 w dokumencie.")).toBeNull();
    expect(extractStartDateIso("Kod referencyjny 10.08.20261234 w systemie.")).toBeNull();
    expect(extractStartDateIso("abc10.08.20261234xyz")).toBeNull();
  });

  // ── Sprint 192 (F3B-S2TZB) — same keyword-boundary and token-boundary
  // fixes, exercised on the numeric format too (section 6's own
  // requirement: both formats share the underlying rules). ───────────────

  test("keyword boundary: 'godzina' following a numeric date is NOT mistaken for a substring like 'godziny'", () => {
    expect(extractStartDateIso("Od 10.08.2026, godzina 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
    expect(extractStartDateIso("Od 10.08.2026, godziny 7:00 obowiązuje zmiana organizacji ruchu.")).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  test("token boundary: 'godz. 7abc' (numeric date) → null", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7abc coś się zmieni.")).toBeNull();
  });

  test("token boundary: 'godz. 7:00abc' (numeric date) → null", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7:00abc coś się zmieni.")).toBeNull();
  });

  test("token boundary: 'godz. 7:00:30' (numeric date) → null", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7:00:30 coś się zmieni.")).toBeNull();
  });

  test("dot separator: 'godz. 7.3' (numeric date, dot + one digit) → null", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7.3 coś się zmieni.")).toBeNull();
  });

  test("dot separator: 'godz. 7.' (numeric date, dot as punctuation) → bare hour 7:00", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7.")).toBe("2026-08-10T05:00:00.000Z");
  });

  test("allowed boundary: 'godz. 7:00–15:00' (numeric date, en dash range) still parses the first time", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7:00–15:00 coś się zmieni.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  // ── Sprint 192 (F3B-S2TZC) — same left-keyword-boundary and full
  // punctuation/dash token-boundary fixes, exercised on the numeric
  // format too. ────────────────────────────────────────────────────────

  test("left keyword boundary: 'xgodz.' (numeric date) is NOT the time clause — date-only, midnight UTC", () => {
    expect(extractStartDateIso("Od 10.08.2026 xgodz. 7:00")).toBe("2026-08-10T00:00:00.000Z");
  });

  test("left keyword boundary: 'abcgodzina' (numeric date) is NOT the time clause — date-only, midnight UTC", () => {
    expect(extractStartDateIso("Od 10.08.2026 abcgodzina 7:00")).toBe("2026-08-10T00:00:00.000Z");
  });

  test("token boundary: 'godz. 7ąbc' (numeric date) → null", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7ąbc coś się zmieni.")).toBeNull();
  });

  test("token boundary: 'godz. 7:00ąbc' (numeric date) → null", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7:00ąbc coś się zmieni.")).toBeNull();
  });

  test("punctuation + digit: 'godz. 7:00.30' (numeric date) → null", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7:00.30 coś się zmieni.")).toBeNull();
  });

  test("punctuation + digit: 'godz. 7:00,30' (numeric date) → null", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7:00,30 coś się zmieni.")).toBeNull();
  });

  test("dash range: 'godz. 7:00-30' (numeric date, incomplete digit tail) → null", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7:00-30 coś się zmieni.")).toBeNull();
  });

  test("dash range: 'godz. 7:00-15:00' (numeric date, complete second token) stays accepted", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7:00-15:00 coś się zmieni.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });

  test("punctuation without a following digit: 'godz. 7:00,' (numeric date) remains accepted", () => {
    expect(extractStartDateIso("Od 10.08.2026 r., godz. 7:00, nastąpi zmiana organizacji ruchu.")).toBe(
      "2026-08-10T05:00:00.000Z"
    );
  });
});

// ── Sprint 192 (F3B-S2TZF) — operational-year boundary (MIN_SUPPORTED_
// ALERT_YEAR / MAX_SUPPORTED_ALERT_YEAR = 2000–2100 inclusive), covering
// both date formats. Boundary-accepted cases use a date deep in summer
// (15 June), far from any DST transition, so the expected UTC instant
// only depends on the ordinary CEST offset — independently confirmed via
// the actual warsawLocalToUtcIso algorithm before being written here, not
// assumed. ──────────────────────────────────────────────────────────────

test.describe("extractStartDateIso — operational year range (Sprint 192 / F3B-S2TZF)", () => {
  test("rejected: numeric year 0050 (Date.UTC's 0–99 special-case would otherwise silently mean 1950)", () => {
    expect(extractStartDateIso("Od 10.08.0050, godz. 7:00 coś się zmieni.")).toBeNull();
  });

  test("rejected: named-month year 0050", () => {
    expect(extractStartDateIso("Od 10 sierpnia 0050, godz. 7:00 coś się zmieni.")).toBeNull();
  });

  test("rejected: year 1999 (one below the supported minimum)", () => {
    expect(extractStartDateIso("Od 10.08.1999, godz. 7:00 coś się zmieni.")).toBeNull();
    expect(extractStartDateIso("Od 10 sierpnia 1999, godz. 7:00 coś się zmieni.")).toBeNull();
  });

  test("rejected: year 2101 (one above the supported maximum)", () => {
    expect(extractStartDateIso("Od 10.08.2101, godz. 7:00 coś się zmieni.")).toBeNull();
    expect(extractStartDateIso("Od 10 sierpnia 2101, godz. 7:00 coś się zmieni.")).toBeNull();
  });

  test("accepted boundary: year 2000 (numeric format)", () => {
    expect(extractStartDateIso("Od 15.06.2000, godz. 10:00 coś się zmieni.")).toBe("2000-06-15T08:00:00.000Z");
  });

  test("accepted boundary: year 2100 (named-month format)", () => {
    expect(extractStartDateIso("Od 15 czerwca 2100, godz. 10:00 coś się zmieni.")).toBe(
      "2100-06-15T08:00:00.000Z"
    );
  });
});

// ── Sprint 192 (F3B-S2TZR), section 9 — one integration sanity check
// confirming the stored UTC instant round-trips back to the real
// Europe/Warsaw wall-clock hour the source notice actually stated,
// through the SAME public formatting function every page already uses.
// Read-only import — formatAlertDate.ts itself is untouched by this
// sprint. ──────────────────────────────────────────────────────────────

test.describe("UI round-trip sanity check (formatAlertDate.ts, read-only import)", () => {
  test("the Warsaw-converted starts_at value displays back as the real notice's own stated hour", () => {
    expect(formatAlertDateTime("2026-08-10T05:00:00.000Z")).toBe("10.08.2026, 07:00");
  });
});

// Sprint 192 (F3B-S2PL) — the real, live pruszkow.pl road-closure notice
// (F3B-S2XG audit) that surfaced the "Pruszkowie" inflected-form gap,
// reused verbatim for both extractPlace and the full eligibility check
// below, same convention as REAL_DW719_TEXT above.
const REAL_PRUSZKOW_ROAD_CLOSURE_TEXT =
  "zgodnie z komunikatem Orlen Termika S.A. przekazujemy informacje, że w związku z awarią sieci " +
  "cieplnej 2xDN250 w ul. Ks. Romana Indrzejczyka w Pruszkowie, nastąpi zajęcie pasa drogowego i " +
  "zmiana organizacji ruchu w dniach 10.08.2026 r. od godz. 7:00 do 13.08.2026 r. do godz. 15:00.";

test.describe("extractPlace", () => {
  test("finds a known pilot locality mentioned in the text", () => {
    expect(extractPlace(REAL_DW719_TEXT)).toBe("Nowa Wieś");
  });
  test("returns null when no known locality is mentioned", () => {
    expect(extractPlace("Ogólny komunikat bez żadnej konkretnej miejscowości.")).toBeNull();
  });

  // ── F3B-S2PL — "Pruszkowie" (locative) must resolve to canonical
  // "Pruszków" (nominative, the exact string stored in PILOT_LOCALITIES),
  // never the inflected form that matched. ──────────────────────────────
  test("nominative 'Pruszków' resolves to canonical 'Pruszków'", () => {
    expect(extractPlace("Komunikat dotyczy miasta Pruszków.")).toBe("Pruszków");
  });
  test("locative 'w Pruszkowie' resolves to canonical 'Pruszków', not 'Pruszkowie'", () => {
    expect(extractPlace("Utrudnienia w Pruszkowie od jutra.")).toBe("Pruszków");
  });
  test("the exact proposed raw_text (F3B-S2XG) resolves to canonical 'Pruszków'", () => {
    expect(extractPlace(REAL_PRUSZKOW_ROAD_CLOSURE_TEXT)).toBe("Pruszków");
  });
  test("boundary: an unrelated longer word containing 'Pruszkowie' as a mere substring is never matched", () => {
    // "Pruszkowieckiego" contains the literal substring "Pruszkowie" but is
    // not a real mention of the locality — a naive includes() check would
    // wrongly match it (confirmed: pre-fix `"...Pruszkowieckiego...".includes("Pruszkowie")`
    // is true). No other pilot locality appears in this text either.
    expect(
      extractPlace("Fikcyjny raport z gminy Pruszkowieckiego bez faktycznej lokalizacji.")
    ).toBeNull();
  });
  test("boundary: an unrelated longer word containing 'Pruszków' as a mere substring is never matched", () => {
    expect(extractPlace("Nazwa fikcyjnej miejscowości: Pruszkówka.")).toBeNull();
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
      // Sprint 192 (F3B-S2TZR) — Warsaw-converted; was
      // "2026-07-29T09:00:00.000Z" before this sprint's fix.
      expect(result.fields.startsAt).toBe("2026-07-29T07:00:00.000Z");
      expect(result.fields.title).toBe("Zmiana organizacji ruchu na drodze wojewódzkiej nr 719");
      expect(result.fields.sourceUrl).toBe("https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/");
      expect(result.fields.severity).toBe("info");
      expect(result.fields.slug).toContain("758819cc".slice(0, 8));
    }
  });

  // Sprint 192 (F3B-S2R) — the real pruszkow.pl notice found during the
  // F3B-S2L live preflight ("Komunikat o czasowej zmianie organizacji
  // ruchu na ul. Ks. Romana Indrzejczyka", published 2026-08-05, numeric
  // date format). A short, true summary of its structure — no article
  // full text, no personal data — anchoring this suite to a second real
  // case that specifically exercises the numeric date parser this sprint
  // added, not just the pre-existing named-month one.
  test("a real candidate using the numeric date format is not rejected for a missing start date", () => {
    const candidate = makeCandidate({
      title: "Komunikat o czasowej zmianie organizacji ruchu na ul. Ks. Romana Indrzejczyka",
      candidateUrl:
        "https://www.pruszkow.pl/mieszkancy/komunikat-o-czasowej-zmianie-organizacji-ruchu-na-ul-ks-romana-indrzejczyka/",
      text:
        "Miasto Pruszków informuje: od 10.08.2026 r., godz. 7:00 do 13.08.2026 r., godz. 15:00 na ul. Ks. " +
        "Romana Indrzejczyka nastąpi awaria sieci cieplnej i zajęcie pasa drogowego związane z czasową " +
        "zmianą organizacji ruchu.",
    });
    const result = evaluateAutoPublishEligibility(candidate, [], new Date("2026-08-05T00:00:00Z"));
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      // Sprint 192 (F3B-S2TZR) — Warsaw-converted; the exact required
      // example from the F3B-S2TZP audit and F3B-S2TZR product decision.
      expect(result.fields.startsAt).toBe("2026-08-10T05:00:00.000Z");
      expect(result.fields.place).toBe("Pruszków");
      expect(result.fields.category).toBe("roads");
    }
  });

  // Sprint 192 (F3B-S2PL) — the EXACT proposed candidate payload from the
  // F3B-S2XG audit, reusing its own real raw_text verbatim (only the
  // locative "w Pruszkowie" form, no nominative "Pruszków" anywhere in the
  // text) — this is the specific case that was failing closed on
  // `place_not_detected` before this sprint's extractPlace fix.
  test("the exact F3B-S2XG proposed candidate (locative-only place mention) is eligible", () => {
    const candidate = makeCandidate({
      sourceKey: "pruszkow-aktualnosci",
      sourceName: "Miasto Pruszków",
      sourceUrl:
        "https://www.pruszkow.pl/mieszkancy/komunikat-o-czasowej-zmianie-organizacji-ruchu-na-ul-ks-romana-indrzejczyka/",
      candidateUrl:
        "https://www.pruszkow.pl/mieszkancy/komunikat-o-czasowej-zmianie-organizacji-ruchu-na-ul-ks-romana-indrzejczyka/",
      title: "Komunikat o czasowej zmianie organizacji ruchu na ul. Ks. Romana Indrzejczyka",
      text: REAL_PRUSZKOW_ROAD_CLOSURE_TEXT,
    });
    const result = evaluateAutoPublishEligibility(candidate, [], new Date("2026-08-07T00:00:00Z"));
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.fields.place).toBe("Pruszków");
      expect(result.fields.startsAt).toBe("2026-08-10T05:00:00.000Z");
      expect(result.fields.category).toBe("roads");
      expect(result.fields.sourceUrl).toBe(
        "https://www.pruszkow.pl/mieszkancy/komunikat-o-czasowej-zmianie-organizacji-ruchu-na-ul-ks-romana-indrzejczyka/"
      );
    }
  });
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

  test("lorem ipsum placeholder title → ineligible, blocked_synthetic_content", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ title: "Lorem ipsum dolor sit amet" }),
      [],
      FIXED_NOW
    );
    expect(result).toEqual({ eligible: false, reason: "blocked_synthetic_content" });
  });

  test("explicit 'komunikat testowy' marker in text → ineligible, blocked_synthetic_content", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ text: "To jest KOMUNIKAT TESTOWY — proszę zignorować." }),
      [],
      FIXED_NOW
    );
    expect(result).toEqual({ eligible: false, reason: "blocked_synthetic_content" });
  });

  test("real DW 719 notice merely containing the word 'test' is NOT blocked", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ text: REAL_DW719_TEXT + " Trwa też test syren alarmowych w gminie." }),
      [],
      FIXED_NOW
    );
    expect(result.eligible).toBe(true);
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

  // Sprint 180D — sourceName was previously passed straight through to
  // buildAutoPublishAlertInsert with no check of its own, unlike every
  // other required text field above.
  test("empty source_name → ineligible, missing_source_name", () => {
    const result = evaluateAutoPublishEligibility(makeCandidate({ sourceName: "" }), [], FIXED_NOW);
    expect(result).toEqual({ eligible: false, reason: "missing_source_name" });
  });

  test("whitespace-only source_name → ineligible, missing_source_name", () => {
    const result = evaluateAutoPublishEligibility(makeCandidate({ sourceName: "   " }), [], FIXED_NOW);
    expect(result).toEqual({ eligible: false, reason: "missing_source_name" });
  });

  test("a valid source_name still passes eligibility, trimmed into fields.sourceName", () => {
    const result = evaluateAutoPublishEligibility(
      makeCandidate({ sourceName: "  Miasto Pruszków — aktualności  " }),
      [],
      FIXED_NOW
    );
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.fields.sourceName).toBe("Miasto Pruszków — aktualności");
    }
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
    expect(payload.source_id).toBeNull();
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

  test("a placeholder candidate is never published end to end — skipped as blocked_synthetic_content", async () => {
    const placeholderCandidate = makeCandidate({ title: "Przykładowy komunikat testowy" });
    const { writer, insertedAlerts, markedConverted } = makeFakeWriter({ candidates: [placeholderCandidate] });
    const outcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(outcome.status).toBe("no_eligible_candidate");
    expect(outcome.skipped).toEqual([
      { candidateId: placeholderCandidate.id, reason: "blocked_synthetic_content" },
    ]);
    expect(insertedAlerts).toHaveLength(0);
    expect(markedConverted).toHaveLength(0);
  });

  test("exact URL duplicate against a pre-existing alert → zero publications", async () => {
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

  // Sprint 180D — the actual re-run scenario the "mark-converted failure"
  // test above only asserts the FIRST call's outcome for: does a SECOND
  // call against the same still-pending candidate ever publish a second
  // alert? This reproduces findExistingAlertComparisons's real mapping
  // (title + " " + change as text, source_url as url — see
  // createSupabaseScheduledWriter in scheduledWriter.ts) rather than
  // hand-waving a match, so the dedup path exercised here is the same one
  // production actually runs through on a real re-run.
  test("re-run after mark_converted_failed: dedup prevents a second alert from ever being published", async () => {
    const candidate = makeCandidate();
    const insertedAlerts: AutoPublishAlertInsertPayload[] = [];
    const existingAlerts: DedupComparisonItem[] = [];
    let idCounter = 0;

    const writer: ScheduledSourceWriter = {
      async findExistingCandidateTexts() {
        return [];
      },
      async findExistingAlertComparisons() {
        return existingAlerts;
      },
      async insertPendingCandidate() {
        return { ok: true };
      },
      async insertSourceCheck() {
        return { ok: true };
      },
      // The candidate row itself is never mutated by this fake — exactly
      // like the real writer, markCandidateAutoPublished failing leaves
      // status/converted_alert_id untouched in the underlying table, so
      // the next findPendingAutoPublishCandidates read still returns it
      // as pending, unconverted.
      async findPendingAutoPublishCandidates() {
        return [candidate];
      },
      async insertPublishedAlert(payload) {
        insertedAlerts.push(payload);
        idCounter += 1;
        // Mirrors createSupabaseScheduledWriter's own
        // findExistingAlertComparisons mapping exactly (scheduledWriter.ts):
        // text = title + " " + change, url = source_url.
        existingAlerts.push({
          text: [payload.title, payload.change].filter(Boolean).join(" ").trim(),
          url: payload.source_url || null,
        });
        return { ok: true, id: `alert-${idCounter}` };
      },
      // Always fails — simulates the mark-converted step never succeeding
      // for this candidate (e.g. a persistent RLS/network issue), which is
      // the worst case for a re-run, not just a one-off blip.
      async markCandidateAutoPublished() {
        return { ok: false };
      },
    };

    const firstOutcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(firstOutcome.status).toBe("mark_converted_failed");
    expect(insertedAlerts).toHaveLength(1);
    expect(firstOutcome.alertId).toBe("alert-1");
    // Candidate itself is untouched — still pending, still unconverted.
    expect(candidate.status).toBe("pending");
    expect(candidate.convertedAlertId).toBeNull();

    const secondOutcome = await runTrustedSourceAutoPublish(writer, FIXED_NOW);
    expect(secondOutcome.status).not.toBe("published");
    expect(secondOutcome.status).toBe("no_eligible_candidate");
    expect(secondOutcome.skipped).toHaveLength(1);
    expect(secondOutcome.skipped[0].candidateId).toBe(candidate.id);
    // Confirmed (Sprint 180D): the real classifier resolves this via the
    // text-overlap fallback as a confident "duplicate" (no URL match,
    // since the published alert's own source_url is the source's general
    // homepage, not the candidate's specific article permalink).
    expect(secondOutcome.skipped[0].reason).toBe("duplicate");
    // The real assertion: insertPublishedAlert was never called a second
    // time, so exactly one alert exists after both runs combined.
    expect(insertedAlerts).toHaveLength(1);
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
