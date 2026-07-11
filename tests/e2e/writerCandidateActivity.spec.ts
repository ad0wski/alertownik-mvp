import { test, expect } from "@playwright/test";
import {
  buildScheduledWriterActivity,
  WRITER_MONITORING_NO_PUBLISH_NOTE,
  WRITER_MONITORING_KILL_SWITCH_NOTE,
  WRITER_MONITORING_UNTRACKED_NOTE,
} from "@/lib/writerCandidateActivity";
import { SAFE_CHECK_SOURCE_IDS } from "@/lib/sourceCheck";

// Sprint 149 — Scheduled Writer Monitoring v1, pure-function layer.

test.describe("buildScheduledWriterActivity", () => {
  test("returns one row per allowlisted source, even with zero candidates", () => {
    const rows = buildScheduledWriterActivity([]);
    expect(rows.map((r) => r.sourceKey)).toEqual([...SAFE_CHECK_SOURCE_IDS]);
    for (const row of rows) {
      expect(row.totalCandidates).toBe(0);
      expect(row.pendingCandidates).toBe(0);
      expect(row.lastCandidateAt).toBeNull();
    }
  });

  test("only counts candidates whose source_key matches — admin-manual candidates (no source_key) are correctly excluded", () => {
    const rows = buildScheduledWriterActivity([
      { sourceKey: "michalowice-komunikaty", status: "pending", detectedAt: "2026-07-11T10:00:00Z" },
      { sourceKey: undefined, status: "pending", detectedAt: "2026-07-11T09:00:00Z" }, // admin-manual save
    ]);
    const michalowice = rows.find((r) => r.sourceKey === "michalowice-komunikaty")!;
    expect(michalowice.totalCandidates).toBe(1);
  });

  test("pendingCandidates counts only status='pending', not ignored/converted/archived", () => {
    const rows = buildScheduledWriterActivity([
      { sourceKey: "michalowice-komunikaty", status: "pending", detectedAt: "2026-07-11T10:00:00Z" },
      { sourceKey: "michalowice-komunikaty", status: "converted", detectedAt: "2026-07-10T10:00:00Z" },
      { sourceKey: "michalowice-komunikaty", status: "archived", detectedAt: "2026-07-09T10:00:00Z" },
    ]);
    const michalowice = rows.find((r) => r.sourceKey === "michalowice-komunikaty")!;
    expect(michalowice.totalCandidates).toBe(3);
    expect(michalowice.pendingCandidates).toBe(1);
  });

  test("lastCandidateAt picks the most recent regardless of input order", () => {
    const rows = buildScheduledWriterActivity([
      { sourceKey: "michalowice-komunikaty", status: "pending", detectedAt: "2026-07-01T10:00:00Z" },
      { sourceKey: "michalowice-komunikaty", status: "pending", detectedAt: "2026-07-11T10:00:00Z" },
      { sourceKey: "michalowice-komunikaty", status: "pending", detectedAt: "2026-07-05T10:00:00Z" },
    ]);
    const michalowice = rows.find((r) => r.sourceKey === "michalowice-komunikaty")!;
    expect(michalowice.lastCandidateAt).toBe("2026-07-11T10:00:00Z");
  });

  test("sources are kept independent — WKD activity never leaks into Michałowice's row", () => {
    const rows = buildScheduledWriterActivity([
      { sourceKey: "wkd-aktualnosci", status: "pending", detectedAt: "2026-07-11T10:00:00Z" },
    ]);
    const michalowice = rows.find((r) => r.sourceKey === "michalowice-komunikaty")!;
    const wkd = rows.find((r) => r.sourceKey === "wkd-aktualnosci")!;
    expect(michalowice.totalCandidates).toBe(0);
    expect(wkd.totalCandidates).toBe(1);
  });
});

test.describe("Monitoring copy — anti-drift (no promise of automation that doesn't exist)", () => {
  test("no-publish note is present and unambiguous", () => {
    expect(WRITER_MONITORING_NO_PUBLISH_NOTE).toMatch(/nigdy publikuje|pending/i);
  });

  test("kill-switch note describes a server-only mechanism, never exposes a value", () => {
    expect(WRITER_MONITORING_KILL_SWITCH_NOTE).toMatch(/SCHEDULED_WRITES_ENABLED/);
    expect(WRITER_MONITORING_KILL_SWITCH_NOTE).not.toMatch(/true|false/);
  });

  test("untracked-counters note is honest about the schema gap instead of faking data", () => {
    expect(WRITER_MONITORING_UNTRACKED_NOTE).toMatch(/nie są nigdzie zapisywane/);
  });
});
