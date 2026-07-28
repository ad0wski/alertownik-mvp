import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// Sprint 178A — anti-drift audit found that
// docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql (Sprint 145, the
// origin of the four "Scheduled writer can ..." policies on
// source_checks/source_notice_candidates) still claimed "has NOT been
// executed" even though it was, and its CREATE POLICY statements have no
// `to authenticated` clause — the exact gap that caused the confirmed
// Sprint 177F Production incident when the same pattern was added to
// `alerts`. This file's SQL text is preserved unmodified for historical
// accuracy (the corrective fix lives in a separate file, already applied
// to Production), but it must carry an unmistakable DO-NOT-APPLY warning
// so nobody mistakes it for a safe, ready-to-run proposal again.

// Normalizes CRLF/CR line endings to LF right after reading, so every
// assertion below (all of which reason about "--" comment joins and line
// wraps in terms of "\n") behaves identically regardless of the checkout's
// line-ending config (e.g. Windows core.autocrlf) — the file content and
// the strength of every assertion are otherwise unchanged.
function readFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8").replace(/\r\n?/g, "\n");
}

test.describe("Sprint 178A — historical scheduled-writer RLS migration carries a DO NOT APPLY warning", () => {
  const historicalSql = readFile("docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql");

  test("file opens with a DO NOT APPLY warning before any other content", () => {
    const firstNonEmptyLines = historicalSql.split("\n").slice(0, 5).join("\n");
    expect(firstNonEmptyLines).toMatch(/DO NOT APPLY/i);
  });

  test("warning explains the file was already executed and is historical only", () => {
    expect(historicalSql).toMatch(/ALREADY EXECUTED/i);
    expect(historicalSql).toMatch(/HISTORICAL/i);
  });

  test("warning explicitly says not to re-run it", () => {
    const normalized = historicalSql.toLowerCase().replace(/--\s*/g, "").replace(/\s+/g, " ");
    expect(normalized).toMatch(/do\s+not\s+re-run/);
  });

  test("warning references the real corrective fix file that supersedes it", () => {
    const normalized = historicalSql.replace(/--\s*\n\s*/g, "").replace(/\n--\s*/g, "");
    expect(normalized).toContain(
      "CORRECTIVE_SPRINT_177_SCHEDULED_WRITER_POLICY_ROLE_SCOPE_V1.sql"
    );
  });

  test("the underlying CREATE POLICY statements remain unmodified (still lack `to authenticated`) — preserved as historical record, not silently fixed in place", () => {
    const createPolicyBlocks = historicalSql.match(
      /create policy "Scheduled writer[\s\S]*?;/g
    );
    expect(createPolicyBlocks).not.toBeNull();
    expect((createPolicyBlocks as string[]).length).toBeGreaterThan(0);
    for (const block of createPolicyBlocks as string[]) {
      expect(block.toLowerCase()).not.toMatch(/to\s+authenticated/);
    }
  });
});

test.describe("Sprint 178A — live corrective hotfix file remains the authoritative, correctly-scoped source", () => {
  const correctiveSql = readFile(
    "docs/sql/CORRECTIVE_SPRINT_177_SCHEDULED_WRITER_POLICY_ROLE_SCOPE_V1.sql"
  );

  test("corrective file scopes all four recreated policies to authenticated", () => {
    const matches = correctiveSql.match(/to authenticated/gi) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});
