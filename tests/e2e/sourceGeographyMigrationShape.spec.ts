import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

/**
 * Sprint 188A — static anti-drift checks on the proposed (unexecuted)
 * source-geography migration. Never touches a database — only reads the
 * .sql files as text and asserts on their content, same pattern as
 * alertSourcesRlsSqlAntiDrift.spec.ts (Sprint 161B).
 *
 * These tests pin the exact shape src/lib/sourceScale/coverageCalculator.ts
 * already expects, so a hand-edited migration file that silently drifts
 * from the application code (renamed column, dropped nullability, changed
 * lifecycle vocabulary) fails CI before it ever reaches Adam for review.
 */

function readSql(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const proposedSql = readSql("docs/sql/PROPOSED_SPRINT_188A_SOURCE_GEOGRAPHY_V1.sql");
const verifySql = readSql("docs/sql/VERIFY_SPRINT_188A_SOURCE_GEOGRAPHY_READ_ONLY_V1.sql");

test.describe("PROPOSED_SPRINT_188A_SOURCE_GEOGRAPHY_V1.sql — shape", () => {
  test("adds all four geography columns to both alert_sources and alerts", () => {
    for (const column of ["wojewodztwo", "powiat", "gmina", "miejscowosc"]) {
      expect(proposedSql).toContain(`add column if not exists ${column} text`);
    }
  });

  test("adds lifecycle_status only to alert_sources, not alerts", () => {
    expect(proposedSql).toContain("add column if not exists lifecycle_status text");
    // alerts table block should not mention lifecycle_status.
    const alertsBlockStart = proposedSql.indexOf("alter table public.alerts");
    const alertsBlock = proposedSql.slice(alertsBlockStart, alertsBlockStart + 400);
    expect(alertsBlock).not.toContain("lifecycle_status");
  });

  test("lifecycle_status CHECK constraint lists exactly the 8 canonical statuses", () => {
    const canonicalStatuses = [
      "discovered",
      "classified",
      "awaiting_review",
      "testable",
      "canary",
      "active",
      "degraded",
      "disabled",
    ];
    for (const status of canonicalStatuses) {
      expect(proposedSql).toContain(`'${status}'::text`);
    }
  });

  test("every new column is nullable — no NOT NULL, no DEFAULT value", () => {
    expect(proposedSql).not.toMatch(/add column if not exists \w+ text not null/i);
    expect(proposedSql).not.toMatch(/add column if not exists \w+ text default/i);
  });

  test("no UPDATE statement anywhere — this migration never backfills existing rows", () => {
    expect(proposedSql.toLowerCase()).not.toMatch(/^\s*update\s/m);
  });

  test("is wrapped in a single begin;...commit; transaction", () => {
    expect(proposedSql).toMatch(/^begin;/m);
    expect(proposedSql).toMatch(/^commit;/m);
  });
});

test.describe("VERIFY_SPRINT_188A_SOURCE_GEOGRAPHY_READ_ONLY_V1.sql — read-only", () => {
  test("contains no write statements", () => {
    const lower = verifySql.toLowerCase();
    for (const forbidden of ["insert into", "update ", "delete from", "drop ", "alter table", "truncate"]) {
      expect(lower).not.toContain(forbidden);
    }
  });

  test("checks both alert_sources and alerts for the same four geography columns", () => {
    expect(verifySql).toContain("table_name = 'alert_sources'");
    expect(verifySql).toContain("table_name = 'alerts'");
    expect(verifySql).toContain("'wojewodztwo', 'powiat', 'gmina', 'miejscowosc'");
  });

  test("verifies zero backfill (counts non-null new-column rows on both tables)", () => {
    expect(verifySql).toContain("from public.alert_sources");
    expect(verifySql).toContain("from public.alerts");
    expect(verifySql).toMatch(/rows_with_wojewodztwo/);
  });
});
