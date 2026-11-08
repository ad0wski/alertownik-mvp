import { test, expect } from "@playwright/test";
import {
  formatAlertDateTime,
  formatAlertRange,
  parseAlertTimestamp,
  warsawWallTimeToUtcIso,
  isValidTimeString,
  combineDateAndOptionalTime,
} from "@/lib/formatAlertDate";

/**
 * fix(time) — the real incident that motivated this file: Michałowice's
 * official "Brak wody - Reguły" notice states "10 listopada 2026 r., w
 * godz. 11:00 - 15:00" — Europe/Warsaw LOCAL time. Builder previously had
 * no time input at all; naively writing "11:00:00Z"/"15:00:00Z" face
 * value would have displayed 12:00–16:00 to a Polish user (winter, CET,
 * UTC+1) or 13:00–17:00 (summer, CEST, UTC+2) — always wrong by exactly
 * the DST offset. These tests pin the conversion against real, verified
 * values, not assumptions.
 *
 * No pre-existing test file covered formatAlertDate.ts at all before this
 * fix — the first few tests below establish baseline coverage for the
 * pre-existing display functions too, not just the new ones.
 */

test.describe("formatAlertDateTime / formatAlertRange — pre-existing display behavior (baseline coverage)", () => {
  test("a date-only (UTC-midnight) timestamp displays with no time", () => {
    expect(formatAlertDateTime("2026-07-09T00:00:00+00:00")).toBe("09.07.2026");
  });

  test("a timestamp with a real time displays date + HH:MM", () => {
    expect(formatAlertDateTime("2026-07-29T09:00:00.000Z")).toBe("29.07.2026, 11:00");
  });

  test("a same-day range with explicit hours on both sides formats as one date, two times", () => {
    expect(formatAlertRange("2026-11-10T10:00:00.000Z", "2026-11-10T14:00:00.000Z")).toBe(
      "10.11.2026, 11:00 – 15:00"
    );
  });

  test("an all-day range (Warsaw midnight / 23:59 boundaries) formats as a date-only range", () => {
    // Real values from an existing archived alert ("Remont ul. Głównej w
    // Granicy") — 2026-06-14T22:00Z = Warsaw 2026-06-15 00:00 (summer,
    // CEST); 2026-07-02T21:59Z = Warsaw 2026-07-02 23:59 — both
    // recognized as all-day boundaries by the existing, unchanged logic.
    expect(formatAlertRange("2026-06-14T22:00:00+00:00", "2026-07-02T21:59:00+00:00")).toBe(
      "15.06.2026 – 02.07.2026"
    );
  });
});

test.describe("warsawWallTimeToUtcIso — the core conversion, DST-correct via IANA rules", () => {
  test("winter: Warsaw 11:00 → 10:00Z (CET, UTC+1)", () => {
    expect(warsawWallTimeToUtcIso(2026, 11, 10, 11, 0)).toBe("2026-11-10T10:00:00.000Z");
  });

  test("winter: Warsaw 15:00 → 14:00Z (CET, UTC+1)", () => {
    expect(warsawWallTimeToUtcIso(2026, 11, 10, 15, 0)).toBe("2026-11-10T14:00:00.000Z");
  });

  test("summer: Warsaw 11:00 → 09:00Z (CEST, UTC+2)", () => {
    expect(warsawWallTimeToUtcIso(2026, 7, 29, 11, 0)).toBe("2026-07-29T09:00:00.000Z");
  });

  test("round-trips correctly back through parseAlertTimestamp — the real UI display path", () => {
    const iso = warsawWallTimeToUtcIso(2026, 11, 10, 11, 0);
    expect(iso).not.toBeNull();
    const parsed = parseAlertTimestamp(iso!);
    expect(parsed.date).toBe("2026-11-10");
    expect(parsed.hhmm).toBe("11:00");
  });
});

test.describe("isValidTimeString", () => {
  test("accepts valid HH:MM", () => {
    expect(isValidTimeString("11:00")).toBe(true);
    expect(isValidTimeString("00:00")).toBe(true);
    expect(isValidTimeString("23:59")).toBe(true);
  });

  test("rejects an invalid time", () => {
    expect(isValidTimeString("24:00")).toBe(false);
    expect(isValidTimeString("11:60")).toBe(false);
    expect(isValidTimeString("abc")).toBe(false);
    expect(isValidTimeString("11")).toBe(false);
    expect(isValidTimeString("")).toBe(false);
  });
});

test.describe("combineDateAndOptionalTime — Builder-facing combiner", () => {
  test("date-only behavior is completely unchanged when no time is given", () => {
    expect(combineDateAndOptionalTime("2026-11-10")).toBe("2026-11-10");
    expect(combineDateAndOptionalTime("2026-11-10", "")).toBe("2026-11-10");
    expect(combineDateAndOptionalTime("2026-11-10", undefined)).toBe("2026-11-10");
  });

  test("a date + Warsaw winter time combines to the correct UTC instant", () => {
    expect(combineDateAndOptionalTime("2026-11-10", "11:00")).toBe("2026-11-10T10:00:00.000Z");
  });

  test("a date + Warsaw summer time combines to the correct UTC instant", () => {
    expect(combineDateAndOptionalTime("2026-07-29", "11:00")).toBe("2026-07-29T09:00:00.000Z");
  });

  test("an invalid time is rejected (returns null, never a guessed value)", () => {
    expect(combineDateAndOptionalTime("2026-11-10", "25:00")).toBeNull();
    expect(combineDateAndOptionalTime("2026-11-10", "not-a-time")).toBeNull();
  });

  test("a missing date is rejected regardless of time", () => {
    expect(combineDateAndOptionalTime("", "11:00")).toBeNull();
  });
});

test.describe("end-before-start rejection (the same comparison Builder's validation uses)", () => {
  test("a same-day end time before the start time is detected as backwards", () => {
    const starts = combineDateAndOptionalTime("2026-11-10", "15:00")!;
    const ends = combineDateAndOptionalTime("2026-11-10", "11:00")!;
    expect(new Date(ends).getTime() < new Date(starts).getTime()).toBe(true);
  });

  test("a genuinely forward-ordered same-day range is NOT flagged as backwards", () => {
    const starts = combineDateAndOptionalTime("2026-11-10", "11:00")!;
    const ends = combineDateAndOptionalTime("2026-11-10", "15:00")!;
    expect(new Date(ends).getTime() < new Date(starts).getTime()).toBe(false);
  });
});
