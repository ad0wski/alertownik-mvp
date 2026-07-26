import { test, expect } from "@playwright/test";
import {
  nextSessionCheckOutcome,
  describeSessionCheckOutcome,
  type SessionCheckOutcome,
} from "@/lib/sourceHealth";

/**
 * Sprint 171 — Source Health & Observability. source_checks has no
 * failure/error result value (a real schema gap, documented in
 * docs/SPRINT_171_SOURCE_HEALTH_OBSERVABILITY_V1.md), so a failed manual
 * check can never be persisted. These tests cover the one thing this
 * sprint adds without any migration: a session-only (never persisted)
 * running outcome per source, surfaced on the Source Health dashboard row.
 */

test.describe("nextSessionCheckOutcome — pure folding logic", () => {
  test("a first-ever successful outcome has zero consecutive failures", () => {
    const result = nextSessionCheckOutcome(undefined, { ok: true, at: "2026-07-27T09:00:00Z" });
    expect(result).toEqual({ ok: true, message: undefined, at: "2026-07-27T09:00:00Z", consecutiveFailures: 0 });
  });

  test("a first-ever failed outcome counts as exactly 1 consecutive failure", () => {
    const result = nextSessionCheckOutcome(undefined, {
      ok: false,
      message: "Źródło nie odpowiada (timeout 10 s).",
      at: "2026-07-27T09:00:00Z",
    });
    expect(result.consecutiveFailures).toBe(1);
    expect(result.ok).toBe(false);
  });

  test("consecutive failures increment across repeated failed checks", () => {
    let outcome: SessionCheckOutcome | undefined;
    outcome = nextSessionCheckOutcome(outcome, { ok: false, message: "HTTP 500.", at: "2026-07-27T09:00:00Z" });
    outcome = nextSessionCheckOutcome(outcome, { ok: false, message: "HTTP 503.", at: "2026-07-27T09:05:00Z" });
    outcome = nextSessionCheckOutcome(outcome, { ok: false, message: "Timeout.", at: "2026-07-27T09:10:00Z" });
    expect(outcome.consecutiveFailures).toBe(3);
    expect(outcome.message).toBe("Timeout.");
  });

  test("a success resets the consecutive-failure streak to zero", () => {
    let outcome: SessionCheckOutcome | undefined;
    outcome = nextSessionCheckOutcome(outcome, { ok: false, message: "HTTP 500.", at: "2026-07-27T09:00:00Z" });
    outcome = nextSessionCheckOutcome(outcome, { ok: false, message: "HTTP 503.", at: "2026-07-27T09:05:00Z" });
    outcome = nextSessionCheckOutcome(outcome, { ok: true, at: "2026-07-27T09:10:00Z" });
    expect(outcome.consecutiveFailures).toBe(0);
    expect(outcome.ok).toBe(true);
  });

  test("a failure right after a success starts a fresh streak of 1, not accumulating the prior run", () => {
    let outcome: SessionCheckOutcome | undefined;
    outcome = nextSessionCheckOutcome(outcome, { ok: false, message: "HTTP 500.", at: "2026-07-27T09:00:00Z" });
    outcome = nextSessionCheckOutcome(outcome, { ok: false, message: "HTTP 500.", at: "2026-07-27T09:05:00Z" });
    outcome = nextSessionCheckOutcome(outcome, { ok: true, at: "2026-07-27T09:10:00Z" });
    outcome = nextSessionCheckOutcome(outcome, { ok: false, message: "HTTP 500.", at: "2026-07-27T09:15:00Z" });
    expect(outcome.consecutiveFailures).toBe(1);
  });
});

test.describe("describeSessionCheckOutcome — fail-closed rendering", () => {
  test("no outcome yet this session → null (never a false healthy claim)", () => {
    expect(describeSessionCheckOutcome(undefined)).toBeNull();
  });

  test("a healthy outcome mentions success and the never-persisted disclaimer", () => {
    const text = describeSessionCheckOutcome({ ok: true, at: "2026-07-27T09:00:00Z", consecutiveFailures: 0 });
    expect(text).toContain("powodzenie");
    expect(text).toContain("niezapisane w historii");
  });

  test("a failed outcome (single) shows the safe curated message and time, no streak suffix", () => {
    const text = describeSessionCheckOutcome({
      ok: false,
      message: "Źródło zwróciło typ application/json zamiast HTML. Sprawdź stronę ręcznie w przeglądarce.",
      at: "2026-07-27T09:00:00Z",
      consecutiveFailures: 1,
    });
    expect(text).toContain("błąd");
    expect(text).toContain("Źródło zwróciło typ application/json zamiast HTML");
    expect(text).not.toContain("razy z rzędu");
  });

  test("a failed outcome with a streak >1 mentions the consecutive-failure count", () => {
    const text = describeSessionCheckOutcome({
      ok: false,
      message: "HTTP 503.",
      at: "2026-07-27T09:00:00Z",
      consecutiveFailures: 3,
    });
    expect(text).toContain("3 razy z rzędu w tej sesji");
  });

  test("a failed outcome with no message falls back to an honest generic label, never blank", () => {
    const text = describeSessionCheckOutcome({
      ok: false,
      message: undefined,
      at: "2026-07-27T09:00:00Z",
      consecutiveFailures: 1,
    });
    expect(text).toContain("nieznany błąd");
  });

  test("never leaks anything resembling a stack trace or secret — message is passed through verbatim, never derived from an Error object", () => {
    // manualSourceCheckFetch.ts only ever produces hand-written Polish
    // copy for `message` (never err.message/err.stack) — this test pins
    // that the display function itself adds nothing beyond the given
    // message, so it can't accidentally leak more than the caller passed.
    const curatedMessage = "Nie udało się pobrać strony źródła. Spróbuj później albo sprawdź stronę ręcznie.";
    const text = describeSessionCheckOutcome({
      ok: false,
      message: curatedMessage,
      at: "2026-07-27T09:00:00Z",
      consecutiveFailures: 1,
    });
    expect(text).toContain(curatedMessage);
    expect(text).not.toMatch(/at \w+\.\w+ \(|node_modules|\.ts:\d+:\d+|Bearer |sk-|eyJ/);
  });
});
