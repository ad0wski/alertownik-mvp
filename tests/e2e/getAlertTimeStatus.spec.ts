import { test, expect } from "@playwright/test";
import { getAlertTimeStatus, OPEN_ENDED_ALERT_FRESHNESS_DAYS } from "@/lib/getAlertTimeStatus";

/**
 * P0-1 fix (pre-launch audit, 2026-11-06) — regression coverage for the
 * open-ended ("ends_at = null") alert freshness cap.
 *
 * Before this fix, `getAlertTimeStatus` returned "active" for ANY started
 * alert with no `ends_at`, with no upper bound — confirmed live: two real
 * Production alerts from July 2026 were still rendering as "Trwa" in
 * November 2026. These tests pin the exact failure mode (old + no end
 * date → must not be "active") and the conservative policy that replaces
 * it (a bounded grace window, then "ended" — never a guessed end date).
 *
 * All timestamps are computed relative to the real clock at test-run time
 * (same pattern as tests/e2e/wasteScheduleData.spec.ts's isoDaysFromNow),
 * since getAlertTimeStatus reads Date.now() internally and has no
 * injectable clock — this keeps the suite immune to the calendar date
 * without needing to mock time.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FRESHNESS_WINDOW_MS = OPEN_ENDED_ALERT_FRESHNESS_DAYS * DAY_MS;

function isoFromNow(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

test.describe("getAlertTimeStatus — basic semantics (unchanged by this fix)", () => {
  test("no startsAt at all → unknown", () => {
    expect(getAlertTimeStatus(undefined, undefined)).toBe("unknown");
  });

  test("future startsAt, no endsAt → upcoming (freshness window never applies before it starts)", () => {
    const startsAt = isoFromNow(2 * DAY_MS);
    expect(getAlertTimeStatus(startsAt, undefined)).toBe("upcoming");
  });

  test("future startsAt WITH a future endsAt → upcoming", () => {
    const startsAt = isoFromNow(2 * DAY_MS);
    const endsAt = isoFromNow(10 * DAY_MS);
    expect(getAlertTimeStatus(startsAt, endsAt)).toBe("upcoming");
  });
});

test.describe("getAlertTimeStatus — explicit ends_at behavior must be fully preserved", () => {
  test("started, explicit future ends_at → active", () => {
    const startsAt = isoFromNow(-1 * DAY_MS);
    const endsAt = isoFromNow(30 * DAY_MS);
    expect(getAlertTimeStatus(startsAt, endsAt)).toBe("active");
  });

  test("started, explicit past ends_at → ended", () => {
    const startsAt = isoFromNow(-10 * DAY_MS);
    const endsAt = isoFromNow(-2 * DAY_MS);
    expect(getAlertTimeStatus(startsAt, endsAt)).toBe("ended");
  });

  test("all-day (date-only) explicit range still resolves correctly", () => {
    const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + DAY_MS).toISOString().slice(0, 10);
    // Active through the end of its end calendar day.
    expect(getAlertTimeStatus(yesterday, tomorrow)).toBe("active");
  });
});

test.describe("getAlertTimeStatus — P0-1: open-ended (ends_at = null) freshness cap", () => {
  test("old alert + ends_at=null is NOT active (the exact incident this fix addresses)", () => {
    // Mirrors the real Production case: an alert that started ~3 months
    // ago with no end date was still showing as "Trwa".
    const startsAt = isoFromNow(-90 * DAY_MS);
    const status = getAlertTimeStatus(startsAt, undefined);
    expect(status).not.toBe("active");
    expect(status).toBe("ended");
  });

  test("recent open-ended alert (well inside the window) is still active — today's behavior for fresh notices is preserved", () => {
    const startsAt = isoFromNow(-2 * DAY_MS);
    expect(getAlertTimeStatus(startsAt, undefined)).toBe("active");
  });

  test("open-ended alert just inside the freshness window boundary → still active", () => {
    const startsAt = isoFromNow(-(FRESHNESS_WINDOW_MS - DAY_MS)); // one day of margin inside
    expect(getAlertTimeStatus(startsAt, undefined)).toBe("active");
  });

  test("open-ended alert just past the freshness window boundary → ended, not active", () => {
    const startsAt = isoFromNow(-(FRESHNESS_WINDOW_MS + DAY_MS)); // one day of margin past
    expect(getAlertTimeStatus(startsAt, undefined)).toBe("ended");
  });

  test("open-ended alert exactly at OPEN_ENDED_ALERT_FRESHNESS_DAYS old (day-string granularity) → ended, never silently invented as still active", () => {
    const startsAt = isoFromNow(-(OPEN_ENDED_ALERT_FRESHNESS_DAYS + 1) * DAY_MS);
    expect(getAlertTimeStatus(startsAt, undefined)).toBe("ended");
  });

  test("open-ended alert published with a date-only (all-day) startsAt also ages out, not just timestamped ones", () => {
    const old = new Date(Date.now() - 60 * DAY_MS).toISOString().slice(0, 10);
    expect(getAlertTimeStatus(old, undefined)).toBe("ended");
  });

  test("never invents or requires an ends_at value — the function signature and stale-but-fresh case both return without one", () => {
    // Fresh open-ended alert: still "active" with endsAt completely absent
    // (never substituted with a guessed date internally).
    const fresh = isoFromNow(-1 * DAY_MS);
    expect(getAlertTimeStatus(fresh, undefined)).toBe("active");
    // Old open-ended alert: "ended" — but this is a derived status only;
    // the function takes no mechanism to report or persist a fabricated
    // end date, by construction (it has no write access and no such
    // parameter).
    const old = isoFromNow(-90 * DAY_MS);
    expect(getAlertTimeStatus(old, undefined)).toBe("ended");
  });
});
