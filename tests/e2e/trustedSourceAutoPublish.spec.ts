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
  test("extracts the real DW 719 date+time correctly", () => {
    const iso = extractStartDateIso(REAL_DW719_TEXT);
    expect(iso).toBe("2026-07-29T09:00:00.000Z");
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
      expect(result.fields.startsAt).toBe("2026-07-29T09:00:00.000Z");
      expect(result.fields.title).toBe("Zmiana organizacji ruchu na drodze wojewódzkiej nr 719");
      expect(result.fields.sourceUrl).toBe("https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/");
      expect(result.fields.severity).toBe("info");
      expect(result.fields.slug).toContain("758819cc".slice(0, 8));
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
