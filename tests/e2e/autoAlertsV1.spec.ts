import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import {
  evaluateAutoAlertV1,
  extractEventWindow,
  extractV1Place,
  isAllowedV1Permalink,
  getAutoAlertsV1SourceIds,
  getAutoPublishCategories,
  runAutoAlertsV1,
  AUTO_ALERTS_V1_MIN_CONFIDENCE,
  type AutoAlertV1Evaluation,
} from "@/lib/autoAlertsV1";
import {
  runAutoArchive,
  checkAlertArchivable,
  getAutoArchiveGraceMinutes,
  DEFAULT_AUTO_ARCHIVE_GRACE_MINUTES,
} from "@/lib/autoArchive";
import {
  runAutomationCycle,
  resolveAutomationCycleModes,
  buildAutomationNotifications,
  isAnyAutomationStepOn,
} from "@/lib/autoAlertsCycle";
import { isWriterStale } from "@/lib/operationalNotificationOrchestrator";
import { buildAutoPublishAlertInsert, type AutoPublishCandidateInput } from "@/lib/trustedSourceAutoPublish";
import type {
  ScheduledSourceWriter,
  DedupComparisonItem,
  AutoPublishAlertInsertPayload,
  AutoArchiveAlertRow,
  AutomationDecisionInsert,
} from "@/lib/scheduledWriter";

/**
 * AUTO ALERTS V1 — michalowice-komunikaty auto-publish gate, auto-archive,
 * dry run, monitoring. Pure functions + an in-memory fake writer; no
 * network, no Supabase. Texts below are the real Production notices
 * (read-only, 2026-11-20) so the gate is anchored to real cases.
 */

const REGISTRY_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_KEY = "michalowice-komunikaty";
const BASE_URL = "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/rok-2026/";
// Saturday 21.11.2026 09:00 Warsaw (CET, UTC+1).
const NOW = new Date("2026-11-21T08:00:00.000Z");

const REGULY_23_11 =
  "Data wydarzenia: 23.11.2026 10:00\nW dniu 23 listopada 2026 r. (poniedziałek) w godzinach: 10:00-14:00 nastąpi " +
  "przerwa w dostawie wody do posesji położonych w miejscowości Reguły przy ul. Michała (od ul. Wiejskiej).";
const KOMOROW_WIES_20_11 =
  "Data wydarzenia: 20.11.2026 09:00\nW dniu 20 listopada 2026 r., (piątek) w godz. 09:00 - 16:00 nastąpi przerwa w " +
  "dostawie wody do posesji położonych w miejscowości Komorów-Wieś, tj.: ul. Słoneczna, ul. Polna, ul. Stara Droga, " +
  "ul. Zielna, ul. Paproci, ul. Rumiankowa oraz ul. Pod Borem.";
const REGULY_TORFOWA_16_11 =
  "Data wydarzenia: 16.11.2026 12:00\nW dniu 16 listopada 2026 r., (poniedziałek) w godz. 12:00 - 16:00 nastąpi przerwa " +
  "w dostawie wody do posesji położonych w miejscowości Reguły ul. Torfowa (odcinek od Al. Powstańców Warszawy łącznie " +
  "ze stacją BP do ul. Berberysowej) oraz boczne ulice pomiędzy Torfową, a Graniczną.";
const REGULY_WIEJSKA_13_11 =
  "Data wydarzenia: 13.11.2026 10:00\nInformujemy, że 13 listopada 2026 r. (piątek), w godz. 10:00–16:00, nastąpi " +
  "przerwa w dostawie wody w miejscowości Reguły, przy ul. Wiejskiej (na odcinku od ronda do posesji nr 2).";
const NABOR =
  "Data wydarzenia: 07.12.2026 23:59\nWójt Gminy Michałowice ogłasza nabór na wolne stanowisko urzędnicze – Kierownik " +
  "Referatu Rozwoju i Funduszy Zewnętrznych (K/M).";
const KAMPANIA =
  "16.10.2026 15:15\nPolska Spółka Gazownictwa sp. z o.o., jako operator systemu dystrybucyjnego gazowego, prowadzi " +
  "kampanię informacyjno-prewencyjną „Bezpieczne Gazociągi”. Jej celem jest ograniczenie liczby uszkodzeń infrastruktury.";

/** Existing published alerts on Production (other events) — the dedup pool. */
const EXISTING_ALERTS: DedupComparisonItem[] = [
  { text: `Brak wody - Reguły, ul. Torfowa ${REGULY_TORFOWA_16_11}`, url: `${BASE_URL}brak-wody-reguly,p2076792032` },
  { text: `Brak wody - Reguły, ul. Wiejska ${REGULY_WIEJSKA_13_11}`, url: `${BASE_URL}brak-wody-reguly,p1480836792` },
];

function candidate(overrides: Partial<AutoPublishCandidateInput> = {}): AutoPublishCandidateInput {
  return {
    id: "aaaaaaaa-1111-4111-8111-000000000001",
    sourceKey: SOURCE_KEY,
    sourceName: "Gmina Michałowice — komunikaty",
    sourceUrl: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty",
    candidateUrl: `${BASE_URL}brak-wody-reguly,p2001270077`,
    title: "Brak wody- Reguły",
    text: REGULY_23_11,
    status: "pending",
    convertedAlertId: null,
    detectedAt: "2026-11-21T06:00:00.000Z",
    registrySourceId: REGISTRY_ID,
    ...overrides,
  };
}

const OPTS = { now: NOW, enabledCategories: ["water"] as const, allowedSourceIds: [SOURCE_KEY] };
const evaluate = (c: AutoPublishCandidateInput, pool: DedupComparisonItem[] = EXISTING_ALERTS) =>
  evaluateAutoAlertV1(c, pool, OPTS);
const reasonOf = (e: AutoAlertV1Evaluation) => (e.eligible ? "eligible" : e.reason);

const ENV_KEYS = [
  "SCHEDULED_AUTO_PUBLISH_SOURCE_IDS",
  "SCHEDULED_WRITER_SOURCE_REGISTRY_IDS",
  "SCHEDULED_AUTO_PUBLISH_CATEGORIES",
  "SCHEDULED_AUTO_PUBLISH_ENABLED",
  "SCHEDULED_AUTO_ARCHIVE_ENABLED",
  "SCHEDULED_AUTOMATION_DRY_RUN",
  "SCHEDULED_AUTO_ARCHIVE_GRACE_MINUTES",
] as const;
let savedEnv: Record<string, string | undefined> = {};
test.beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = JSON.stringify([SOURCE_KEY]);
  process.env.SCHEDULED_WRITER_SOURCE_REGISTRY_IDS = JSON.stringify({ [SOURCE_KEY]: REGISTRY_ID });
  process.env.SCHEDULED_AUTO_PUBLISH_CATEGORIES = JSON.stringify(["water"]);
});
test.afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// ── Fake writer ──────────────────────────────────────────────────────────────

interface FakeState {
  candidates: AutoPublishCandidateInput[];
  alerts: DedupComparisonItem[];
  candidateTexts: string[];
  archiveRows: (AutoArchiveAlertRow & { autoArchivedAt?: string | null })[];
  inserted: AutoPublishAlertInsertPayload[];
  marked: string[];
  archivedIds: string[];
  decisions: AutomationDecisionInsert[];
  mutations: number;
  failInsert?: boolean;
  failMark?: boolean;
  failArchiveFor?: string;
  failAlertRead?: boolean;
  failArchiveRead?: boolean;
  lastRunFinishedAt?: string | null;
  lastDetectedAfter?: string;
}

function fakeWriter(state: FakeState): ScheduledSourceWriter {
  return {
    async findExistingCandidateTexts() {
      return state.candidateTexts;
    },
    async findExistingAlertComparisons() {
      if (state.failAlertRead) throw new Error("read failed");
      return state.alerts;
    },
    async insertPendingCandidate() {
      state.mutations++;
      return { ok: true };
    },
    async insertSourceCheck() {
      state.mutations++;
      return { ok: true };
    },
    async findPendingAutoPublishCandidates(sourceIds, detectedAfterIso) {
      state.lastDetectedAfter = detectedAfterIso;
      return state.candidates.filter((c) => sourceIds.includes(c.sourceKey) && c.status === "pending");
    },
    async insertPublishedAlert(payload) {
      state.mutations++;
      if (state.failInsert) return { ok: false, reason: "unknown_error" };
      state.inserted.push(payload);
      state.alerts = [...state.alerts, { text: `${payload.title} ${payload.change}`, url: payload.source_url }];
      return { ok: true, id: `alert-${state.inserted.length}` };
    },
    async markCandidateAutoPublished(candidateId, alertId) {
      state.mutations++;
      if (state.failMark) return { ok: false };
      state.marked.push(candidateId);
      const c = state.candidates.find((x) => x.id === candidateId);
      if (c) {
        c.status = "published";
        c.convertedAlertId = alertId;
      }
      return { ok: true };
    },
    async findAlertsForAutoArchive(cutoffIso, limit) {
      if (state.failArchiveRead) throw new Error("read failed");
      return state.archiveRows
        .filter((r) => r.status === "published" && r.endsAt && r.endsAt < cutoffIso)
        .slice(0, limit)
        .map(({ id, status, startsAt, endsAt }) => ({ id, status, startsAt, endsAt }));
    },
    async archiveEndedAlert(alertId, cutoffIso, archivedAtIso) {
      state.mutations++;
      if (state.failArchiveFor === alertId) return { ok: false };
      // Mirrors the real statement: id + status=published + ends_at < cutoff.
      const row = state.archiveRows.find((r) => r.id === alertId && r.status === "published" && r.endsAt! < cutoffIso);
      if (!row) return { ok: true, archived: false };
      row.status = "archived";
      row.autoArchivedAt = archivedAtIso;
      state.archivedIds.push(alertId);
      return { ok: true, archived: true };
    },
    async insertAutomationDecision(row) {
      state.decisions.push(row);
      return { ok: true };
    },
    async findLastSourceRunFinishedAt() {
      return state.lastRunFinishedAt ?? null;
    },
  };
}

function state(overrides: Partial<FakeState> = {}): FakeState {
  return {
    candidates: [candidate()],
    alerts: [...EXISTING_ALERTS],
    candidateTexts: [],
    archiveRows: [],
    inserted: [],
    marked: [],
    archivedIds: [],
    decisions: [],
    mutations: 0,
    ...overrides,
  };
}

const okUrl = async () => ({ ok: true as const });

// ── 1. Correct water notice qualifies ────────────────────────────────────────

test.describe("V1 gate — positive case", () => {
  test("1. the real Reguły 23.11 water notice qualifies with exact Warsaw times and the official permalink", () => {
    const result = evaluate(candidate());
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.fields.category).toBe("water");
    expect(result.fields.place).toBe("Reguły");
    expect(result.fields.startsAt).toBe("2026-11-23T09:00:00.000Z"); // 10:00 CET
    expect(result.fields.endsAt).toBe("2026-11-23T13:00:00.000Z"); // 14:00 CET
    expect(result.fields.sourceUrl).toBe(`${BASE_URL}brak-wody-reguly,p2001270077`);
    expect(result.fields.sourceName).toBe("Gmina Michałowice — komunikaty");
    expect(result.fields.sourceId).toBe(REGISTRY_ID);
    expect(result.confidence).toBeGreaterThanOrEqual(AUTO_ALERTS_V1_MIN_CONFIDENCE);
  });

  test("Google Play — the insert payload always carries the exact permalink, source name and ends_at", () => {
    const result = evaluate(candidate());
    if (!result.eligible) throw new Error("expected eligible");
    const payload = buildAutoPublishAlertInsert(result.fields);
    expect(payload.source_url).toBe(`${BASE_URL}brak-wody-reguly,p2001270077`);
    expect(payload.source_url).not.toBe("https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty");
    expect(payload.source_name).toBe("Gmina Michałowice — komunikaty");
    expect(payload.ends_at).toBe("2026-11-23T13:00:00.000Z");
    expect(payload.status).toBe("published");
  });
});

// ── 2–9. Negative cases ─────────────────────────────────────────────────────

test.describe("V1 gate — fails closed", () => {
  test("2. no place → not published (needs review)", () => {
    const text = REGULY_23_11.replace("w miejscowości Reguły przy ul. Michała (od ul. Wiejskiej)", "przy ul. Michała");
    const r = evaluate(candidate({ title: "Brak wody - komunikat", text }));
    expect(reasonOf(r)).toBe("place_not_detected");
    expect(!r.eligible && r.needsReview).toBe(true);
  });

  test("2b. compound locality (real Komorów-Wieś) is ambiguous, never folded into Komorów", () => {
    const r = extractV1Place("BRAK WODY – KOMORÓW-WIEŚ", KOMOROW_WIES_20_11);
    expect(r).toEqual({ ok: false, reason: "place_ambiguous" });
  });

  test("2c. two localities in one notice → place_ambiguous", () => {
    const text = REGULY_23_11.replace("miejscowości Reguły", "miejscowościach Reguły i Granica");
    expect(reasonOf(evaluate(candidate({ text })))).toBe("place_ambiguous");
  });

  test("3. no hours → not published", () => {
    const text = REGULY_23_11.replace(" w godzinach: 10:00-14:00", "");
    const noLabel = text.replace("Data wydarzenia: 23.11.2026 10:00\n", "");
    expect(reasonOf(evaluate(candidate({ text: noLabel })))).toBe("time_not_detected");
  });

  test("3b. start hour without end hour → end_time_not_detected", () => {
    const text = REGULY_23_11.replace("w godzinach: 10:00-14:00", "od godz. 10:00");
    expect(reasonOf(evaluate(candidate({ text })))).toBe("end_time_not_detected");
  });

  test("4. already ended (real Komorów-Wieś 20.11, evaluated 21.11) → not published, not a review item", () => {
    const r = evaluate(
      candidate({
        title: "Brak wody - Komorów",
        text: KOMOROW_WIES_20_11.replace("Komorów-Wieś", "Komorów"),
        candidateUrl: `${BASE_URL}brak-wody-komorow-wies,p702857621`,
        detectedAt: "2026-11-20T22:00:00.000Z",
      })
    );
    expect(reasonOf(r)).toBe("event_ended");
    expect(!r.eligible && r.needsReview).toBe(false);
  });

  test("4b. an event still in progress is NOT 'ended' (ends_at in the future)", () => {
    const during = new Date("2026-11-23T10:00:00.000Z"); // 11:00 Warsaw, inside 10–14
    const r = evaluateAutoAlertV1(candidate({ detectedAt: "2026-11-23T06:00:00.000Z" }), EXISTING_ALERTS, { ...OPTS, now: during });
    expect(r.eligible).toBe(true);
  });

  test("5. duplicate — same permalink already published → not published", () => {
    const pool = [...EXISTING_ALERTS, { text: "Brak wody- Reguły (ręcznie)", url: `${BASE_URL}brak-wody-reguly,p2001270077` }];
    expect(reasonOf(evaluate(candidate(), pool))).toBe("duplicate");
  });

  test("5b. duplicate — same event already published manually under the listing URL (real 23.11 case)", () => {
    const pool = [
      ...EXISTING_ALERTS,
      { text: `Brak wody- Reguły ${REGULY_23_11}`, url: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty" },
    ];
    expect(reasonOf(evaluate(candidate(), pool))).toBe("duplicate");
  });

  test("5c. near-identical notice, same place, different date → possible change, never auto-published", () => {
    const earlier = REGULY_23_11.replace(/23\.11\.2026/g, "09.11.2026")
      .replace("23 listopada", "9 listopada");
    const pool = [...EXISTING_ALERTS, { text: earlier }];
    expect(reasonOf(evaluate(candidate(), pool))).toBe("possible_change");
  });

  test("5d. other real Reguły notices (different date/street) do not block the 23.11 notice", () => {
    expect(evaluate(candidate()).eligible).toBe(true);
  });

  test("6. other source (WKD, Pruszków) → not published even if on the env allowlist", () => {
    expect(reasonOf(evaluate(candidate({ sourceKey: "pruszkow-aktualnosci" })))).toBe("source_not_in_v1_scope");
    expect(reasonOf(evaluate(candidate({ sourceKey: "wkd-komunikaty" })))).toBe("source_not_in_v1_scope");
    process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = JSON.stringify(["pruszkow-aktualnosci", SOURCE_KEY]);
    expect(getAutoAlertsV1SourceIds()).toEqual([SOURCE_KEY]);
  });

  test("6b. registry provenance mismatch → not published", () => {
    expect(reasonOf(evaluate(candidate({ registrySourceId: "33333333-3333-4333-8333-333333333333" })))).toBe(
      "candidate_source_id_mismatch"
    );
    expect(reasonOf(evaluate(candidate({ registrySourceId: null })))).toBe("candidate_source_id_missing");
  });

  test("7. ambiguity — two dates, two time ranges, contradicting label, wrong weekday, multi-day", () => {
    const twoDates = REGULY_23_11.replace("(poniedziałek)", "oraz 24 listopada 2026 r.");
    expect(reasonOf(evaluate(candidate({ text: twoDates })))).toBe("multiple_dates");
    const twoRanges = REGULY_23_11.replace("10:00-14:00", "10:00-14:00 oraz w godz. 16:00-18:00");
    expect(reasonOf(evaluate(candidate({ text: twoRanges })))).toBe("multiple_time_ranges");
    const labelDate = REGULY_23_11.replace("Data wydarzenia: 23.11.2026", "Data wydarzenia: 24.11.2026");
    expect(reasonOf(evaluate(candidate({ text: labelDate })))).toBe("contradictory_dates");
    const labelTime = REGULY_23_11.replace("23.11.2026 10:00", "23.11.2026 09:00");
    expect(reasonOf(evaluate(candidate({ text: labelTime })))).toBe("contradictory_start_time");
    const weekday = REGULY_23_11.replace("(poniedziałek)", "(wtorek)");
    expect(reasonOf(evaluate(candidate({ text: weekday })))).toBe("contradictory_dates");
    const multiDay = REGULY_23_11.replace("W dniu 23 listopada 2026 r. (poniedziałek)", "od 23 do 25 listopada 2026 r.");
    expect(reasonOf(evaluate(candidate({ text: multiDay })))).toBe("multi_day_event");
    const yearless = REGULY_23_11.replace("(poniedziałek)", "(oraz 24.11)");
    expect(reasonOf(evaluate(candidate({ text: yearless })))).toBe("multiple_dates");
  });

  test("7b. a year-less numeric date range is never read as hours", () => {
    const w = extractEventWindow("Data wydarzenia: 01.12.2026 08:00\nPrzerwa w dostawie wody od 1.12 do 3.12 w Regułach.");
    expect(w.ok).toBe(false);
  });

  test("8. campaign / job offer / event invitation → not published, not a review item", () => {
    const kampania = evaluate(
      candidate({ title: "Kampania „Bezpieczne Gazociągi”", text: KAMPANIA, candidateUrl: `${BASE_URL}kampania,p1` })
    );
    expect(reasonOf(kampania)).toBe("not_alert_notice");
    expect(!kampania.eligible && kampania.needsReview).toBe(false);
    const nabor = evaluate(candidate({ title: "Nabór na wolne stanowisko pracy", text: NABOR }));
    expect(reasonOf(nabor)).toBe("not_alert_notice");
  });

  test("8b. 'posesji' in every water notice does not trip the 'sesja' (council session) marker", () => {
    expect(REGULY_23_11).toContain("posesji");
    expect(evaluate(candidate()).eligible).toBe(true);
  });

  test("8c. a cancellation / change notice goes to manual review", () => {
    const text = REGULY_23_11.replace("nastąpi przerwa", "zostaje odwołana zaplanowana przerwa");
    const r = evaluate(candidate({ text }));
    expect(reasonOf(r)).toBe("change_or_cancellation_notice");
    expect(!r.eligible && r.needsReview).toBe(true);
  });

  test("8d. category not enabled (roads while only water is on) → not published", () => {
    const text =
      "Data wydarzenia: 24.11.2026 08:00\nW dniu 24 listopada 2026 r. w godz. 08:00-15:00 nastąpi zamknięcie drogi " +
      "w miejscowości Granica, ul. Główna. Zostanie wprowadzona czasowa organizacja ruchu.";
    expect(reasonOf(evaluate(candidate({ title: "Zamknięcie drogi - Granica", text })))).toBe("category_not_enabled");
  });

  test("9. bad permalink → not published", () => {
    const cases: Array<[string | null, string]> = [
      [null, "missing_or_unsafe_candidate_url"],
      ["https://www.michalowice.pl/wp-json/wp/v2/posts/1", "missing_or_unsafe_candidate_url"],
      ["http://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/rok-2026/x,p1", "permalink_not_official_notice"],
      ["https://evil.example/dzieje-sie/aktualnosci/komunikaty/rok-2026/x,p1", "permalink_not_official_notice"],
      ["https://www.michalowice.pl/dzieje-sie/zaproszenia/kulturalne/wystawa,p1", "permalink_not_official_notice"],
      ["https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty", "permalink_not_official_notice"],
      ["https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/rok-2026/x,p1?a=1", "permalink_not_official_notice"],
    ];
    for (const [url, reason] of cases) {
      expect(reasonOf(evaluate(candidate({ candidateUrl: url })))).toBe(reason);
    }
    expect(isAllowedV1Permalink(`${BASE_URL}brak-wody-reguly,p2001270077`)).toBe(true);
  });

  test("9b. SSRF guard rejection blocks the publish even after the gate passed", async () => {
    const s = state();
    const r = await runAutoAlertsV1(fakeWriter(s), {
      mode: "live",
      runId: null,
      now: NOW,
      checkUrl: async () => ({ ok: false, reason: "private_ip" }),
    });
    expect(s.inserted).toHaveLength(0);
    expect(r.decisions[0]).toMatchObject({ decision: "skipped", reason: "permalink_ssrf_rejected" });
  });

  test("stale / not-pending candidates are never evaluated as publishable", () => {
    expect(reasonOf(evaluate(candidate({ detectedAt: "2026-11-19T06:00:00.000Z" })))).toBe("candidate_too_old");
    expect(reasonOf(evaluate(candidate({ detectedAt: "not-a-date" })))).toBe("candidate_too_old");
    expect(reasonOf(evaluate(candidate({ status: "published" })))).toBe("not_pending_or_already_converted");
  });

  test("source-structure anomaly (HTML in text) → not published", () => {
    expect(reasonOf(evaluate(candidate({ text: `${REGULY_23_11} <div>x</div>` })))).toBe("suspicious_source_structure");
  });

  test("categories env is fail-closed: unset / invalid / unknown → no category", () => {
    delete process.env.SCHEDULED_AUTO_PUBLISH_CATEGORIES;
    expect(getAutoPublishCategories()).toEqual([]);
    process.env.SCHEDULED_AUTO_PUBLISH_CATEGORIES = "water";
    expect(getAutoPublishCategories()).toEqual([]);
    process.env.SCHEDULED_AUTO_PUBLISH_CATEGORIES = JSON.stringify(["water", "transport", "power"]);
    expect(getAutoPublishCategories()).toEqual(["water"]);
  });
});

// ── 10. Europe/Warsaw ────────────────────────────────────────────────────────

test.describe("10. Europe/Warsaw time handling", () => {
  test("winter (CET, UTC+1)", () => {
    expect(extractEventWindow(REGULY_23_11)).toMatchObject({
      ok: true,
      startsAt: "2026-11-23T09:00:00.000Z",
      endsAt: "2026-11-23T13:00:00.000Z",
    });
  });
  test("summer (CEST, UTC+2)", () => {
    const text = "Data wydarzenia: 15.07.2026 10:00\nW dniu 15 lipca 2026 r. (środa) w godz. 10:00 - 14:00 brak wody w Regułach.";
    expect(extractEventWindow(text)).toMatchObject({
      ok: true,
      startsAt: "2026-07-15T08:00:00.000Z",
      endsAt: "2026-07-15T12:00:00.000Z",
    });
  });
  test("overnight range (end before start) is rejected, not shifted to the next day", () => {
    const text = "W dniu 23 listopada 2026 r. w godz. 22:00 - 06:00 przerwa w dostawie wody.";
    expect(extractEventWindow(text)).toEqual({ ok: false, reason: "starts_not_before_ends" });
  });
  test("invalid hour is rejected", () => {
    expect(extractEventWindow("W dniu 23 listopada 2026 r. w godz. 10:00 - 25:00 brak wody.")).toEqual({
      ok: false,
      reason: "invalid_time",
    });
  });
});

// ── Orchestration (publish) ──────────────────────────────────────────────────

test.describe("runAutoAlertsV1 — orchestration", () => {
  test("live: publishes exactly one, marks the candidate, logs the decision", async () => {
    const s = state();
    const r = await runAutoAlertsV1(fakeWriter(s), { mode: "live", runId: "run-1", now: NOW, checkUrl: okUrl });
    expect(r.status).toBe("published");
    expect(s.inserted).toHaveLength(1);
    expect(s.marked).toEqual([candidate().id]);
    expect(s.decisions[0]).toMatchObject({ kind: "auto_publish", mode: "live", decision: "published", run_id: "run-1" });
  });

  test("5e. re-running after a publish does not publish a second time (idempotent)", async () => {
    const s = state();
    await runAutoAlertsV1(fakeWriter(s), { mode: "live", runId: null, now: NOW, checkUrl: okUrl });
    s.candidates[0].status = "pending"; // even if the mark had been lost
    s.candidates[0].convertedAlertId = null;
    const second = await runAutoAlertsV1(fakeWriter(s), { mode: "live", runId: null, now: NOW, checkUrl: okUrl });
    expect(s.inserted).toHaveLength(1);
    expect(second.decisions[0]).toMatchObject({ decision: "skipped", reason: "duplicate" });
  });

  test("cap = 1: a second eligible candidate in the same run is deferred, not published", async () => {
    const second = candidate({
      id: "aaaaaaaa-1111-4111-8111-000000000002",
      title: "Brak wody - Granica",
      text: REGULY_23_11.replace("Reguły przy ul. Michała (od ul. Wiejskiej)", "Granica przy ul. Głównej"),
      candidateUrl: `${BASE_URL}brak-wody-granica,p9`,
    });
    const s = state({ candidates: [candidate(), second] });
    await runAutoAlertsV1(fakeWriter(s), { mode: "live", runId: null, now: NOW, checkUrl: okUrl });
    expect(s.inserted).toHaveLength(1);
    expect(s.decisions.map((d) => d.decision)).toEqual(["published", "deferred"]);
  });

  test("only candidates from the last 24 h are requested — old pending rows cannot crowd out new notices", async () => {
    const s = state();
    await runAutoAlertsV1(fakeWriter(s), { mode: "dry_run", runId: null, now: NOW, checkUrl: okUrl });
    expect(s.lastDetectedAfter).toBe("2026-11-20T08:00:00.000Z");
  });

  test("dry run: zero alert/candidate mutations, decision recorded as would_publish", async () => {
    const s = state();
    const r = await runAutoAlertsV1(fakeWriter(s), { mode: "dry_run", runId: null, now: NOW, checkUrl: okUrl });
    expect(r.status).toBe("would_publish");
    expect(s.mutations).toBe(0);
    expect(s.decisions[0]).toMatchObject({ mode: "dry_run", decision: "would_publish" });
  });

  test("17a. alert pool read failure → nothing published (dedup would be blind)", async () => {
    const s = state({ failAlertRead: true });
    const r = await runAutoAlertsV1(fakeWriter(s), { mode: "live", runId: null, now: NOW, checkUrl: okUrl });
    expect(r.status).toBe("dedup_pool_unavailable");
    expect(s.mutations).toBe(0);
  });

  test("17b. empty alert pool (RLS-filtered read) → nothing published", async () => {
    const s = state({ alerts: [] });
    const r = await runAutoAlertsV1(fakeWriter(s), { mode: "live", runId: null, now: NOW, checkUrl: okUrl });
    expect(r.status).toBe("dedup_pool_unavailable");
    expect(s.mutations).toBe(0);
  });

  test("17c. insert failure → candidate stays pending, nothing marked", async () => {
    const s = state({ failInsert: true });
    const r = await runAutoAlertsV1(fakeWriter(s), { mode: "live", runId: null, now: NOW, checkUrl: okUrl });
    expect(r.status).toBe("insert_failed");
    expect(s.marked).toHaveLength(0);
    expect(s.candidates[0].status).toBe("pending");
  });

  test("17d. mark failure is reported distinctly (alert exists, needs reconciliation)", async () => {
    const s = state({ failMark: true });
    const r = await runAutoAlertsV1(fakeWriter(s), { mode: "live", runId: null, now: NOW, checkUrl: okUrl });
    expect(r.status).toBe("mark_converted_failed");
    expect(buildAutomationNotifications({ writerStale: false, archive: offArchive(), publish: r })[0].eventType).toBe(
      "auto_publish_failed"
    );
  });
});

// ── 11–15. Auto-archive ──────────────────────────────────────────────────────

const ARCHIVE_NOW = new Date("2026-11-23T15:00:00.000Z"); // 16:00 Warsaw
function archiveRow(id: string, overrides: Partial<AutoArchiveAlertRow> = {}) {
  return {
    id,
    status: "published",
    startsAt: "2026-11-23T09:00:00.000Z",
    endsAt: "2026-11-23T13:00:00.000Z", // 14:00 Warsaw → +60 min = 15:00 Warsaw
    ...overrides,
  };
}
function offArchive() {
  return { mode: "off" as const, status: "off" as const, graceMinutes: 60, archived: [], wouldArchive: [], skipped: [], failed: [], decisionLogFailures: 0 };
}

test.describe("auto-archive", () => {
  test("default grace is 60 min; env is clamped to [30, 1440]", () => {
    expect(DEFAULT_AUTO_ARCHIVE_GRACE_MINUTES).toBe(60);
    expect(getAutoArchiveGraceMinutes(undefined)).toBe(60);
    expect(getAutoArchiveGraceMinutes("5")).toBe(30);
    expect(getAutoArchiveGraceMinutes("45")).toBe(45);
    expect(getAutoArchiveGraceMinutes("99999")).toBe(1440);
    expect(getAutoArchiveGraceMinutes("abc")).toBe(60);
  });

  test("11. archives after ends_at + grace, never before", async () => {
    const s = state({ archiveRows: [archiveRow("a1")] });
    const early = await runAutoArchive(fakeWriter(s), { mode: "live", runId: null, now: new Date("2026-11-23T13:30:00.000Z") });
    expect(early.archived).toEqual([]);
    const late = await runAutoArchive(fakeWriter(s), { mode: "live", runId: null, now: ARCHIVE_NOW });
    expect(late.archived).toEqual(["a1"]);
    expect(s.archiveRows[0].status).toBe("archived");
    expect(s.archiveRows[0].autoArchivedAt).toBe(ARCHIVE_NOW.toISOString());
    expect(s.decisions.at(-1)).toMatchObject({ kind: "auto_archive", decision: "archived", alert_id: "a1" });
  });

  test("12. idempotent — a second run changes nothing", async () => {
    const s = state({ archiveRows: [archiveRow("a1")] });
    await runAutoArchive(fakeWriter(s), { mode: "live", runId: null, now: ARCHIVE_NOW });
    const second = await runAutoArchive(fakeWriter(s), { mode: "live", runId: null, now: ARCHIVE_NOW });
    expect(second.archived).toEqual([]);
    expect(s.archivedIds).toEqual(["a1"]);
  });

  test("12b. a row changed between read and update is left alone (already_changed)", async () => {
    const s = state({ archiveRows: [archiveRow("a1")] });
    const w = fakeWriter(s);
    const read = w.findAlertsForAutoArchive!.bind(w);
    w.findAlertsForAutoArchive = async (c, l) => {
      const rows = await read(c, l);
      s.archiveRows[0].status = "draft"; // admin un-published it meanwhile
      return rows;
    };
    const r = await runAutoArchive(w, { mode: "live", runId: null, now: ARCHIVE_NOW });
    expect(r.skipped).toEqual([{ alertId: "a1", reason: "already_changed" }]);
    expect(s.archiveRows[0].status).toBe("draft");
  });

  test("13/14. drafts and archived rows are never touched; missing/invalid ends_at is never archived", () => {
    const cutoff = ARCHIVE_NOW.getTime() - 60 * 60_000;
    expect(checkAlertArchivable(archiveRow("d", { status: "draft" }), cutoff)).toBe("not_published");
    expect(checkAlertArchivable(archiveRow("x", { status: "archived" }), cutoff)).toBe("not_published");
    expect(checkAlertArchivable(archiveRow("n", { endsAt: null }), cutoff)).toBe("ends_at_missing");
    expect(checkAlertArchivable(archiveRow("i", { endsAt: "garbage" }), cutoff)).toBe("ends_at_invalid");
    expect(checkAlertArchivable(archiveRow("b", { endsAt: "2026-11-23T08:00:00.000Z" }), cutoff)).toBe("ends_before_start");
    expect(checkAlertArchivable(archiveRow("ok"), cutoff)).toBeNull();
  });

  test("13/14b. a mixed set: only the ended published alert is archived", async () => {
    const s = state({
      archiveRows: [
        archiveRow("draft", { status: "draft" }),
        archiveRow("already", { status: "archived" }),
        archiveRow("open", { endsAt: null }),
        archiveRow("ended"),
      ],
    });
    const r = await runAutoArchive(fakeWriter(s), { mode: "live", runId: null, now: ARCHIVE_NOW });
    expect(r.archived).toEqual(["ended"]);
    expect(s.archiveRows.map((x) => x.status)).toEqual(["draft", "archived", "published", "archived"]);
  });

  test("15. auto-archive (and the whole automation cycle) never imports or sends push", () => {
    for (const file of ["src/lib/autoArchive.ts", "src/lib/autoAlertsV1.ts", "src/lib/autoAlertsCycle.ts", "src/app/api/cron/auto-publish-trusted-source/route.ts"]) {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src, file).not.toMatch(/@\/lib\/push|web-push|alert-published/);
    }
  });

  test("never DELETE — the writer's archive call only ever updates", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/scheduledWriter.ts"), "utf8");
    const archiveBlock = src.slice(src.indexOf("async archiveEndedAlert"), src.indexOf("async insertAutomationDecision"));
    expect(archiveBlock).toContain(".update(");
    expect(archiveBlock).not.toContain(".delete(");
    expect(archiveBlock).toContain('.eq("status", "published")');
  });

  test("dry run archives nothing and records would_archive", async () => {
    const s = state({ archiveRows: [archiveRow("a1")] });
    const r = await runAutoArchive(fakeWriter(s), { mode: "dry_run", runId: null, now: ARCHIVE_NOW });
    expect(r.wouldArchive).toEqual(["a1"]);
    expect(s.mutations).toBe(0);
    expect(s.archiveRows[0].status).toBe("published");
  });

  test("17e. one failing update does not stop the others; reported as partial failure", async () => {
    const s = state({ archiveRows: [archiveRow("a1"), archiveRow("a2")], failArchiveFor: "a1" });
    const r = await runAutoArchive(fakeWriter(s), { mode: "live", runId: null, now: ARCHIVE_NOW });
    expect(r.status).toBe("partial_failure");
    expect(r.archived).toEqual(["a2"]);
  });

  test("17f. archive read failure → no updates, reported", async () => {
    const s = state({ archiveRows: [archiveRow("a1")], failArchiveRead: true });
    const r = await runAutoArchive(fakeWriter(s), { mode: "live", runId: null, now: ARCHIVE_NOW });
    expect(r.status).toBe("read_failed");
    expect(s.mutations).toBe(0);
  });
});

// ── 16. Feature flags ────────────────────────────────────────────────────────

test.describe("16. feature flags / kill switches", () => {
  test("everything is OFF by default", () => {
    expect(resolveAutomationCycleModes({})).toEqual({ publish: "off", archive: "off" });
    expect(isAnyAutomationStepOn(resolveAutomationCycleModes({}))).toBe(false);
  });

  test("dry run wins over both live flags", () => {
    expect(
      resolveAutomationCycleModes({
        SCHEDULED_AUTO_PUBLISH_ENABLED: "true",
        SCHEDULED_AUTO_ARCHIVE_ENABLED: "true",
        SCHEDULED_AUTOMATION_DRY_RUN: "true",
      })
    ).toEqual({ publish: "dry_run", archive: "dry_run" });
  });

  test("flags are independent; only the exact string 'true' enables", () => {
    expect(resolveAutomationCycleModes({ SCHEDULED_AUTO_ARCHIVE_ENABLED: "true" })).toEqual({ publish: "off", archive: "live" });
    expect(resolveAutomationCycleModes({ SCHEDULED_AUTO_PUBLISH_ENABLED: "1" })).toEqual({ publish: "off", archive: "off" });
  });

  test("flags OFF → zero mutations of any kind, zero decision rows", async () => {
    const s = state({ archiveRows: [archiveRow("a1")] });
    await runAutomationCycle(fakeWriter(s), { modes: { publish: "off", archive: "off" }, runId: null, now: ARCHIVE_NOW, checkUrl: okUrl });
    expect(s.mutations).toBe(0);
    expect(s.decisions).toHaveLength(0);
  });

  test("empty env allowlist → zero mutations even with publish live", async () => {
    process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = "";
    const s = state();
    await runAutoAlertsV1(fakeWriter(s), { mode: "live", runId: null, now: NOW, checkUrl: okUrl });
    expect(s.mutations).toBe(0);
  });
});

// ── Monitoring ───────────────────────────────────────────────────────────────

test.describe("monitoring", () => {
  test("a normal run sends nothing", async () => {
    const s = state({ lastRunFinishedAt: "2026-11-21T06:30:00.000Z" });
    const r = await runAutomationCycle(fakeWriter(s), { modes: { publish: "live", archive: "live" }, runId: null, now: NOW, checkUrl: okUrl });
    expect(r.publish.status).toBe("published");
    expect(r.notifications).toEqual([]);
  });

  test("non-alert notices (campaigns, job offers) never trigger a review email", async () => {
    const s = state({
      candidates: [candidate({ title: "Nabór na wolne stanowisko pracy", text: NABOR })],
      lastRunFinishedAt: "2026-11-21T06:30:00.000Z",
    });
    const r = await runAutomationCycle(fakeWriter(s), { modes: { publish: "live", archive: "off" }, runId: null, now: NOW, checkUrl: okUrl });
    expect(r.notifications).toEqual([]);
  });

  test("a real notice the automation could not handle → one needs-review notification", async () => {
    const text = REGULY_23_11.replace(" w godzinach: 10:00-14:00", " od godz. 10:00");
    const s = state({ candidates: [candidate({ text })], lastRunFinishedAt: "2026-11-21T06:30:00.000Z" });
    const r = await runAutomationCycle(fakeWriter(s), { modes: { publish: "live", archive: "off" }, runId: null, now: NOW, checkUrl: okUrl });
    expect(r.notifications.map((n) => n.eventType)).toEqual(["auto_alert_needs_review"]);
    expect(r.notifications[0].summary.length).toBeLessThanOrEqual(200);
  });

  test("stale writer → notification; unknown (read error) → no false alarm", () => {
    expect(isWriterStale("2026-11-20T05:00:00.000Z", NOW)).toBe(true);
    expect(isWriterStale("2026-11-21T06:30:00.000Z", NOW)).toBe(false);
    expect(isWriterStale(null, NOW)).toBe(true);
    expect(buildAutomationNotifications({ writerStale: null, archive: offArchive(), publish: { mode: "off", status: "off", decisions: [], decisionLogFailures: 0 } })).toEqual([]);
  });

  test("archive failure → auto_archive_failed notification", async () => {
    const s = state({ archiveRows: [archiveRow("a1")], failArchiveFor: "a1", lastRunFinishedAt: "2026-11-23T14:00:00.000Z" });
    const r = await runAutomationCycle(fakeWriter(s), { modes: { publish: "off", archive: "live" }, runId: null, now: ARCHIVE_NOW, checkUrl: okUrl });
    expect(r.hadFailure).toBe(true);
    expect(r.notifications.map((n) => n.eventType)).toEqual(["auto_archive_failed"]);
  });

  test("17g. an exception inside one step does not skip the other step", async () => {
    const s = state({ archiveRows: [archiveRow("a1")], lastRunFinishedAt: "2026-11-23T14:00:00.000Z" });
    const w = fakeWriter(s);
    w.findPendingAutoPublishCandidates = async () => {
      throw new Error("boom");
    };
    const r = await runAutomationCycle(w, { modes: { publish: "live", archive: "live" }, runId: null, now: ARCHIVE_NOW, checkUrl: okUrl });
    expect(r.archive.archived).toEqual(["a1"]);
    expect(r.publish.status).toBe("dedup_pool_unavailable");
    expect(s.inserted).toHaveLength(0);
  });
});
