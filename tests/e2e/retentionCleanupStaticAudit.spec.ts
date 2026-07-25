import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * Sprint 166K-C — static, text-only safety audit of the prepared (never
 * executed) retention SQL files. This file NEVER connects to a database
 * and NEVER runs any SQL — every assertion below is a plain-text/regex
 * check against the .sql files' own source, matching this codebase's
 * existing structural-source-text-audit convention (see
 * tests/e2e/databaseEnvironmentGuardIntegration.spec.ts §E.9/§E.10 and
 * tests/e2e/operationalHealthPanelIntegration.spec.ts for the same
 * pattern applied to .tsx files instead of .sql).
 *
 * Covers docs/sql/PROPOSED_SPRINT_166J_RETENTION_CLEANUP_V1.sql (the
 * write-performing file) and, where relevant, its read-only sibling
 * docs/sql/PREFLIGHT_SPRINT_166J_RETENTION_READONLY_V1.sql.
 */

const CLEANUP_SQL_PATH = path.join(process.cwd(), "docs/sql/PROPOSED_SPRINT_166J_RETENTION_CLEANUP_V1.sql");
const PREFLIGHT_SQL_PATH = path.join(process.cwd(), "docs/sql/PREFLIGHT_SPRINT_166J_RETENTION_READONLY_V1.sql");

const cleanupSql = readFileSync(CLEANUP_SQL_PATH, "utf8");
const preflightSql = readFileSync(PREFLIGHT_SQL_PATH, "utf8");

// Strips `--` comment lines, leaving only executable SQL — both files
// document their own safety properties in prose (e.g. "no CASCADE,
// TRUNCATE, or DROP anywhere in this file"), which would otherwise
// self-trip a naive keyword ban. Used only for the negative
// (must-not-appear) keyword checks below; every other assertion in this
// file intentionally reads the full text including comments.
function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

const cleanupSqlCode = stripSqlComments(cleanupSql);
const preflightSqlCode = stripSqlComments(preflightSql);

test.describe("Retention cleanup script — dry-run defaults and gating", () => {
  test("v_dry_run defaults to true", () => {
    expect(cleanupSql).toMatch(/v_dry_run\s+boolean\s*:=\s*true\s*;/);
  });

  test("real execution requires a second, independent confirmation phrase, not just v_dry_run = false", () => {
    expect(cleanupSql).toMatch(/v_execute_confirmation\s+text\s*:=\s*null\s*;/);
    expect(cleanupSql).toMatch(/v_required_confirmation\s+constant\s+text\s*:=/);
    expect(cleanupSql).toMatch(/if\s+not\s+v_dry_run\s+and\s+coalesce\(v_execute_confirmation/);
  });

  test("every DELETE statement is reachable only through an `if v_dry_run then ... else <DELETE> end if` branch", () => {
    // Matches an actual DELETE statement (a real SQL clause), never a
    // prose mention of the word elsewhere in a comment.
    const deleteStatementPattern = /delete\s+from\s+public\./gi;
    const deleteMatches = [...cleanupSql.matchAll(deleteStatementPattern)];
    expect(deleteMatches.length).toBeGreaterThan(0);
    for (const match of deleteMatches) {
      const before = cleanupSql.slice(0, match.index);
      const lastIf = before.lastIndexOf("if v_dry_run then");
      const lastElse = before.lastIndexOf("else");
      // Every DELETE must be textually preceded by an `else` that itself
      // comes after an `if v_dry_run then` — i.e. every DELETE sits inside
      // the non-dry-run branch of a dry-run check.
      expect(lastIf).toBeGreaterThan(-1);
      expect(lastElse).toBeGreaterThan(lastIf);
    }
  });

  test("at default settings (v_dry_run = true, v_execute_confirmation = null) there is no executable path that reaches a DELETE", () => {
    // Structural proxy for "no executable DELETE path at defaults": the
    // guard raising before any DELETE fires whenever v_dry_run is true
    // (since `not v_dry_run` is false, the confirmation check is skipped,
    // but so is every `else` branch containing a DELETE, by the same
    // v_dry_run condition checked immediately above each DELETE per the
    // previous test). This test pins that the confirmation guard exists
    // and precedes the first DELETE in file order.
    const guardIndex = cleanupSql.indexOf("if not v_dry_run and coalesce(v_execute_confirmation");
    const firstDeleteIndex = cleanupSql.search(/delete\s+from\s+public\./i);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(firstDeleteIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(firstDeleteIndex);
  });
});

test.describe("Retention cleanup script — protected Preview synthetic records", () => {
  test("the operational_notification_events placeholder is never an all-zero UUID", () => {
    expect(cleanupSql).not.toMatch(/00000000-0000-0000-0000-000000000000/);
    expect(preflightSql).not.toMatch(/00000000-0000-0000-0000-000000000000/);
  });

  test("the ledger protected row is resolved dynamically by its durable business key, never a hardcoded UUID default", () => {
    expect(cleanupSql).toMatch(/v_preview_synthetic_test_id\s+uuid\s*;/);
    expect(cleanupSql).not.toMatch(/v_preview_synthetic_test_id\s+uuid\s*:=\s*'[0-9a-f-]{36}'/i);
    expect(cleanupSql).toMatch(/v_preview_ledger_test_fingerprint\s+constant\s+text\s*:=\s*'sprint-166f-2b-controlled-preview-ledger-test-1'/);
  });

  test("zero or more than one matching ledger row stops the script before any count or DELETE", () => {
    expect(cleanupSql).toMatch(/v_ledger_match_count\s*<>\s*1/);
    const guardIndex = cleanupSql.indexOf("v_ledger_match_count <> 1");
    const firstDeleteIndex = cleanupSql.search(/delete\s+from\s+public\./i);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(firstDeleteIndex);
  });

  test("the scheduled_writer_runs protected row requires an explicit, NULL-by-default parameter — never an invented or hardcoded id", () => {
    expect(cleanupSql).toMatch(/v_preview_synthetic_run_id\s+uuid\s*:=\s*null\s*;/);
    // The real, documented id must never appear as a compiled-in default
    // anywhere in this file — only permitted in prose/comments pointing at
    // the doc that contains it, which this regex cannot distinguish, so
    // instead assert it does not appear as an assignment target.
    expect(cleanupSql).not.toMatch(/v_preview_synthetic_run_id\s+uuid\s*:=\s*'f16fb737-c836-411a-a509-d3b0aea4d5cc'/i);
  });

  test("a null or mismatched scheduled_writer_runs protected-id parameter stops the script before any count or DELETE on that table", () => {
    expect(cleanupSql).toMatch(/if\s+v_preview_synthetic_run_id\s+is\s+null\s+then/);
    expect(cleanupSql).toMatch(/v_run_match_count\s*<>\s*1/);
    const nullGuardIndex = cleanupSql.indexOf("if v_preview_synthetic_run_id is null then");
    const mismatchGuardIndex = cleanupSql.indexOf("v_run_match_count <> 1");
    const runsDeleteIndex = cleanupSql.indexOf("delete from public.scheduled_writer_runs");
    expect(nullGuardIndex).toBeGreaterThan(-1);
    expect(mismatchGuardIndex).toBeGreaterThan(-1);
    expect(runsDeleteIndex).toBeGreaterThan(-1);
    expect(nullGuardIndex).toBeLessThan(runsDeleteIndex);
    expect(mismatchGuardIndex).toBeLessThan(runsDeleteIndex);
  });

  test("both DELETE statements exclude the protected records by id in their WHERE clause", () => {
    expect(cleanupSql).toMatch(/id\s*<>\s*v_preview_synthetic_test_id/);
    expect(cleanupSql).toMatch(/r\.id\s*<>\s*v_preview_synthetic_run_id/);
  });

  test("a post-delete, pre-commit self-check confirms both protected records still exist", () => {
    expect(cleanupSql).toMatch(/INVARIANT VIOLATION/);
    expect(cleanupSql).toMatch(/not exists \(select 1 from public\.operational_notification_events where id = v_preview_synthetic_test_id\)/);
    expect(cleanupSql).toMatch(/not exists \(select 1 from public\.scheduled_writer_runs where id = v_preview_synthetic_run_id\)/);
  });
});

test.describe("Retention cleanup script — limits, scope, and structural safety", () => {
  test("v_batch_limit is validated as a positive, bounded integer", () => {
    expect(cleanupSql).toMatch(/v_batch_limit\s+integer\s*:=\s*500\s*;/);
    expect(cleanupSql).toMatch(/v_batch_limit is null or v_batch_limit <= 0 or v_batch_limit > 500/);
  });

  test("required tables are checked for existence before any query runs against them", () => {
    expect(cleanupSql).toMatch(/to_regclass\('public\.scheduled_writer_runs'\) is null/);
    expect(cleanupSql).toMatch(/to_regclass\('public\.operational_notification_events'\) is null/);
  });

  test("the script refuses to run outside its one designed-for environment", () => {
    expect(cleanupSql).toMatch(/v_expected_environment_tag\s+constant\s+text\s*:=\s*'preview'/);
    expect(cleanupSql).toMatch(/if\s+v_expected_environment_tag\s+<>\s+'preview'\s+then/);
  });

  test("no executable TRUNCATE in either file (prose safety notes documenting its absence are fine)", () => {
    expect(cleanupSqlCode).not.toMatch(/truncate/i);
    expect(preflightSqlCode).not.toMatch(/truncate/i);
  });

  test("no executable DROP in either file (prose safety notes documenting its absence are fine)", () => {
    expect(cleanupSqlCode).not.toMatch(/\bdrop\s+(table|schema|database|function|index|policy)\b/i);
    expect(preflightSqlCode).not.toMatch(/\bdrop\s+(table|schema|database|function|index|policy)\b/i);
  });

  test("no executable CASCADE in either file (prose safety notes documenting its absence are fine)", () => {
    expect(cleanupSqlCode).not.toMatch(/cascade/i);
    expect(preflightSqlCode).not.toMatch(/cascade/i);
  });

  test("no dynamic SQL — no EXECUTE, no string-built statement/identifier", () => {
    expect(cleanupSqlCode).not.toMatch(/\bexecute\s+(format|'|")/i);
    expect(cleanupSqlCode).not.toMatch(/\bexecute\s+immediate\b/i);
  });

  test("the FK-safe deletion order is preserved: events (children) deleted before runs (parents)", () => {
    const eventsDeleteIndex = cleanupSql.indexOf("delete from public.operational_notification_events");
    const runsDeleteIndex = cleanupSql.indexOf("delete from public.scheduled_writer_runs");
    expect(eventsDeleteIndex).toBeGreaterThan(-1);
    expect(runsDeleteIndex).toBeGreaterThan(-1);
    expect(eventsDeleteIndex).toBeLessThan(runsDeleteIndex);
  });

  test("the scheduled_writer_runs DELETE only targets rows with zero remaining referencing events (NOT EXISTS guard present)", () => {
    expect(cleanupSql).toMatch(/not exists \(\s*select 1 from public\.operational_notification_events e\s*where e\.scheduled_writer_run_id = r\.id\s*\)/);
  });

  test("the whole script is a single controlled transaction", () => {
    // \r?\n rather than a literal \n: on Windows checkouts with
    // core.autocrlf enabled, this file is materialized with CRLF line
    // endings — readFileSync returns the raw bytes with no newline
    // normalization, so a literal \n-only regex silently fails to match
    // regardless of the SQL's actual (line-ending-independent) safety
    // properties.
    expect(cleanupSql.trimStart().startsWith("--") || /\r?\nbegin;\r?\n/.test(cleanupSql)).toBe(true);
    expect(cleanupSql).toMatch(/\r?\nbegin;\r?\n/);
    expect(cleanupSql).toMatch(/\r?\ncommit;\r?\n/);
    // Exactly one begin/commit pair wrapping exactly one DO block.
    expect((cleanupSql.match(/\r?\nbegin;\r?\n/g) ?? []).length).toBe(1);
    expect((cleanupSql.match(/\r?\ncommit;\r?\n/g) ?? []).length).toBe(1);
  });
});

test.describe("Retention SQL files — no secrets, no automatic invocation, no unrelated side effects", () => {
  test("neither file contains a plausible secret, credential, or token value", () => {
    for (const sql of [cleanupSql, preflightSql]) {
      expect(sql).not.toMatch(/CRON_SECRET\s*=\s*['"][^'"]+['"]/);
      expect(sql).not.toMatch(/service_role/i);
      expect(sql).not.toMatch(/api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_-]{10,}/i);
      expect(sql).not.toMatch(/password\s*[:=]\s*['"][^'"]+['"]/i);
      // No real personal email address (the codebase's own convention:
      // ak.jurkowski@gmail.com or any other @gmail/@outlook/etc. address).
      expect(sql).not.toMatch(/[a-z0-9._%+-]+@(gmail|outlook|hotmail|yahoo)\.[a-z]{2,}/i);
    }
  });

  test("neither file contains a Supabase project ref written where it could be mistaken for a live default", () => {
    // The real project refs (puhcjyffosgohbmxrczb, nowvcdbtgaigutyxpmdp)
    // are documented elsewhere in docs/*.md checkpoints, but must never
    // appear inside the executable SQL files themselves — this script
    // never needs to know which project it is running against.
    expect(cleanupSql).not.toMatch(/puhcjyffosgohbmxrczb|nowvcdbtgaigutyxpmdp/);
    expect(preflightSql).not.toMatch(/puhcjyffosgohbmxrczb|nowvcdbtgaigutyxpmdp/);
  });

  test("neither file is referenced, imported, or read from any application source file (no automatic invocation)", () => {
    const srcDir = path.join(process.cwd(), "src");
    const filenames = ["PROPOSED_SPRINT_166J_RETENTION_CLEANUP_V1.sql", "PREFLIGHT_SPRINT_166J_RETENTION_READONLY_V1.sql"];

    function listFilesRecursive(dir: string): string[] {
      const entries = readdirSync(dir);
      let files: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) files = files.concat(listFilesRecursive(full));
        else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(full);
      }
      return files;
    }

    const allSrcFiles = listFilesRecursive(srcDir);
    const referencingFiles = allSrcFiles.filter((f) => {
      const content = readFileSync(f, "utf8");
      return filenames.some((name) => content.includes(name));
    });
    expect(referencingFiles).toEqual([]);
  });

  test("the cleanup script cannot invoke the scheduled writer, any RPC function, Cron, Resend, or an email send action — it performs only SELECT and DELETE against its two named tables", () => {
    // Checked against the comment-stripped code only: both files legitimately
    // document in prose that they cannot reach the writer/Resend/email (the
    // very claim this test verifies structurally), which would otherwise
    // self-trip a naive full-text keyword ban.
    expect(cleanupSqlCode).not.toMatch(/write-candidates/);
    expect(cleanupSqlCode).not.toMatch(/claim_operational_notification_event|finish_operational_notification_event/);
    expect(cleanupSqlCode).not.toMatch(/resend/i);
    // "channel = 'email'" is a legitimate column-value filter carried over
    // from the schema's own CHECK constraint vocabulary — this only rules
    // out an actual send call (a function/network verb), never that
    // string literal comparison.
    expect(cleanupSqlCode).not.toMatch(/send(_?)email|emailAdapter|RESEND_API_KEY/i);
    expect(cleanupSqlCode).toMatch(/channel\s*=\s*'email'/);
  });
});

test.describe("Sprint 166K-D — Production retention design stays design-only", () => {
  const PRODUCTION_RETENTION_DESIGN_PATH = path.join(
    process.cwd(),
    "docs/SPRINT_166K_D_PRODUCTION_RETENTION_DESIGN_V1.md"
  );

  test("no executable SQL file exists yet for Production retention", () => {
    const sqlDir = path.join(process.cwd(), "docs/sql");
    const files = readdirSync(sqlDir);
    const productionRetentionFiles = files.filter(
      (f) => /production/i.test(f) && /retention|cleanup/i.test(f)
    );
    expect(productionRetentionFiles).toEqual([]);
  });

  test("the Production retention design document contains no runnable SQL statement", () => {
    const content = readFileSync(PRODUCTION_RETENTION_DESIGN_PATH, "utf8");
    // Prose may mention column/status names in backticks, but must never
    // contain an actual DO block, transaction, or DML statement.
    expect(content).not.toMatch(/\bdo\s*\$\$/i);
    expect(content).not.toMatch(/^\s*delete\s+from\s+public\./im);
    expect(content).not.toMatch(/^\s*begin;\s*$/im);
    expect(content).not.toMatch(/^\s*commit;\s*$/im);
  });

  test("the design document does not weaken or modify the existing Preview-only cleanup file's environment guard", () => {
    const content = readFileSync(PRODUCTION_RETENTION_DESIGN_PATH, "utf8");
    expect(content).toMatch(/does not change that file/i);
    expect(cleanupSql).toMatch(/v_expected_environment_tag\s+constant\s+text\s*:=\s*'preview'/);
  });

  test("the design document is not referenced or read by any application source file", () => {
    const srcDir = path.join(process.cwd(), "src");
    function listFilesRecursive(dir: string): string[] {
      const entries = readdirSync(dir);
      let files: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) files = files.concat(listFilesRecursive(full));
        else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(full);
      }
      return files;
    }
    const referencing = listFilesRecursive(srcDir).filter((f) =>
      readFileSync(f, "utf8").includes("SPRINT_166K_D_PRODUCTION_RETENTION_DESIGN_V1")
    );
    expect(referencing).toEqual([]);
  });
});
