import { test, expect } from "@playwright/test";
import { parsePageHtml } from "@/lib/sourceParsers/pageParser";
import {
  checkCronAuth,
  isScheduledChecksEnabled,
  resolveCronSources,
  summarizeParseResult,
  errorResult,
  buildDryRunSummary,
  DRY_RUN_MESSAGE,
  CRON_FETCH_TIMEOUT_MS,
} from "@/lib/cronCheckSources";
import { SAFE_CHECK_SOURCE_IDS } from "@/lib/sourceCheck";

/**
 * Sprint 142 — unit-style tests for the dry-run cron endpoint's pure logic
 * layer (src/lib/cronCheckSources.ts). Fixture HTML and a clearly-fake local
 * token only — no browser page, no dev server, no live external website,
 * and no real CRON_SECRET value anywhere in this file.
 */

// A token used ONLY inside this test process's memory — never written to
// any file, never a real secret, never the value the production endpoint
// would ever be configured with.
const FAKE_TEST_SECRET = "test-only-fake-secret-not-a-real-value";

test.describe("checkCronAuth — fail-closed on missing config", () => {
  test("missing CRON_SECRET configuration fails closed with 'not_configured', regardless of the header", () => {
    expect(checkCronAuth(null, undefined)).toEqual({ ok: false, reason: "not_configured" });
    expect(checkCronAuth(`Bearer ${FAKE_TEST_SECRET}`, undefined)).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(checkCronAuth(`Bearer ${FAKE_TEST_SECRET}`, "")).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });

  test("missing Authorization header is rejected as unauthorized when a secret IS configured", () => {
    expect(checkCronAuth(null, FAKE_TEST_SECRET)).toEqual({ ok: false, reason: "unauthorized" });
  });

  test("wrong bearer token is rejected as unauthorized", () => {
    expect(checkCronAuth("Bearer wrong-value", FAKE_TEST_SECRET)).toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });

  test("malformed Authorization header (no 'Bearer ' prefix) is rejected", () => {
    expect(checkCronAuth(FAKE_TEST_SECRET, FAKE_TEST_SECRET)).toEqual({
      ok: false,
      reason: "unauthorized",
    });
    expect(checkCronAuth("Basic abc123", FAKE_TEST_SECRET)).toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });

  test("correct fake test token, matching the injected expected secret, authorizes", () => {
    expect(checkCronAuth(`Bearer ${FAKE_TEST_SECRET}`, FAKE_TEST_SECRET)).toEqual({ ok: true });
  });

  test("comparison is not a simple prefix/substring match", () => {
    expect(checkCronAuth(`Bearer ${FAKE_TEST_SECRET}extra`, FAKE_TEST_SECRET)).toEqual({
      ok: false,
      reason: "unauthorized",
    });
    expect(checkCronAuth(`Bearer ${FAKE_TEST_SECRET.slice(0, -1)}`, FAKE_TEST_SECRET)).toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });
});

test.describe("isScheduledChecksEnabled — kill switch defaults to disabled", () => {
  test("undefined, empty, or any non-'true' value stays disabled", () => {
    expect(isScheduledChecksEnabled(undefined)).toBe(false);
    expect(isScheduledChecksEnabled("")).toBe(false);
    expect(isScheduledChecksEnabled("false")).toBe(false);
    expect(isScheduledChecksEnabled("1")).toBe(false);
    expect(isScheduledChecksEnabled("TRUE")).toBe(false); // exact literal only
  });

  test("only the exact literal 'true' enables it", () => {
    expect(isScheduledChecksEnabled("true")).toBe(true);
  });
});

test.describe("resolveCronSources — allowlist only, never an arbitrary URL", () => {
  test("no filter resolves every safe-check source, in allowlist order", () => {
    const sources = resolveCronSources();
    expect(sources.map((s) => s.id)).toEqual([...SAFE_CHECK_SOURCE_IDS]);
  });

  test("a valid sourceKey filter resolves to exactly that one source", () => {
    const sources = resolveCronSources("wkd-aktualnosci");
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe("wkd-aktualnosci");
  });

  test("an unknown or arbitrary sourceKey resolves to zero sources — never a fetch of anything", () => {
    expect(resolveCronSources("pruszkow-aktualnosci")).toEqual([]); // real checklist id, but not allowlisted
    expect(resolveCronSources("https://evil.example/page")).toEqual([]);
    expect(resolveCronSources("' OR 1=1")).toEqual([]);
  });
});

test.describe("summarizeParseResult / errorResult — safe per-source result shape", () => {
  const FIXTURE_HTML = `
    <html><head><title>Komunikaty testowe</title></head>
    <body><main>
      <h2>Testowy komunikat z datą 16 lipca 2026</h2>
      <p>Wystarczająco długi fragment testowy, żeby przejść próg minimalnej
      długości propozycji i zostać policzonym jako realny kandydat.</p>
      <h2>Drugi komunikat bez daty</h2>
      <p>Również wystarczająco długi fragment testowy, bez żadnej daty w
      treści, więc hasDate powinno wynosić false dla tego wpisu.</p>
    </main></body></html>
  `;

  test("a successful parse yields counts only — no titles, no excerpts, no HTML", () => {
    const parse = parsePageHtml(FIXTURE_HTML, "https://example.test/komunikaty");
    const result = summarizeParseResult("michalowice-komunikaty", "Test Source", parse, 123);

    expect(result.outcome).toBe("success");
    expect(result.proposalCount).toBe(2);
    expect(result.hasDateSignalCount).toBe(1);
    expect(result.durationMs).toBe(123);
    expect(result).not.toHaveProperty("title");
    expect(result).not.toHaveProperty("excerpt");
    expect(result).not.toHaveProperty("rawText");
    expect(JSON.stringify(result)).not.toContain("<html>");
  });

  test("zero proposals classifies as no_proposals, not an error", () => {
    const parse = parsePageHtml("<html><body><nav>Tylko menu</nav></body></html>", "https://example.test/");
    const result = summarizeParseResult("michalowice-komunikaty", "Test Source", parse, 50);
    expect(result.outcome).toBe("no_proposals");
    expect(result.proposalCount).toBe(0);
  });

  test("errorResult never carries a raw error message — diagnostic is a fixed code only", () => {
    const result = errorResult("wkd-aktualnosci", "WKD", "timeout", "timeout_10s", 10_000);
    expect(result.diagnostic).toBe("timeout_10s");
    expect(result.proposalCount).toBe(0);
    // Only the fixed set of literal codes is possible — type system already
    // enforces this, this assertion documents the property for readers.
    expect(["http_4xx", "http_5xx", "non_html_content_type", "network_error", "timeout_10s", "parse_exception"]).toContain(
      result.diagnostic
    );
  });
});

test.describe("buildDryRunSummary — explicit zero-write / zero-publish guarantee", () => {
  test("summary always states zero saved candidates, zero saved checks, not published", () => {
    const summary = buildDryRunSummary([
      errorResult("wkd-aktualnosci", "WKD", "timeout", "timeout_10s", 10_000),
    ]);
    expect(summary.dryRun).toBe(true);
    expect(summary.savedCandidates).toBe(0);
    expect(summary.savedSourceChecks).toBe(0);
    expect(summary.published).toBe(false);
    expect(summary.message).toBe(DRY_RUN_MESSAGE);
  });

  test("aggregates success/failure counts and total proposals across sources", () => {
    const parse = parsePageHtml(
      `<html><body><main><h2>Wystarczająco długi tytuł testowy</h2>
       <p>Wystarczająco długa treść testowa do przekroczenia progu długości propozycji.</p></main></body></html>`,
      "https://example.test/"
    );
    const results = [
      summarizeParseResult("michalowice-komunikaty", "Michałowice", parse, 100),
      errorResult("wkd-aktualnosci", "WKD", "fetch_error", "http_5xx", 200),
    ];
    const summary = buildDryRunSummary(results);
    expect(summary.checkedSources).toBe(2);
    expect(summary.successfulSources).toBe(1);
    expect(summary.failedSources).toBe(1);
    expect(summary.totalProposalCount).toBe(1);
  });

  test("no copy in the summary message implies automation beyond this dry run", () => {
    const lower = DRY_RUN_MESSAGE.toLowerCase();
    expect(lower).not.toContain("opublikowano");
    expect(lower).not.toContain("zapisano kandydata");
  });
});

test.describe("timeout constant", () => {
  test("per-source fetch timeout matches the existing manual-check timeout (10s)", () => {
    expect(CRON_FETCH_TIMEOUT_MS).toBe(10_000);
  });
});
