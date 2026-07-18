import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

/**
 * Sprint 161B — static anti-drift checks on the proposed (unexecuted)
 * alert_sources RLS hardening SQL package. These never touch a database —
 * they only read the .sql files as text and assert on their content, the
 * same pattern the existing cron-route "static import audit" tests use.
 */

function readSql(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

// Extracts the single active migration transaction (the first begin;...
// commit; pair) so assertions below don't accidentally match text that
// only appears inside header comments or the commented-out rollback block.
function extractActiveTransaction(sql: string): string {
  const beginIdx = sql.search(/^begin;/m);
  const commitIdx = sql.search(/^commit;/m);
  if (beginIdx === -1 || commitIdx === -1 || commitIdx < beginIdx) {
    throw new Error("could not locate a begin;...commit; transaction in the SQL file");
  }
  return sql.slice(beginIdx, commitIdx);
}

// Strips `-- ...` line comments so "does this SQL actually DO X" assertions
// check real, executable statements — not prose that explains, in English,
// what a nearby statement does or doesn't do. Every file here is written
// with generous inline commentary (project convention), and phrases like
// "these currently read auth.role() = 'authenticated'" or "no policy for
// automation_identities is created here" are exactly the kind of
// explanatory sentence that would otherwise trip a naive substring check
// despite describing the absence of the thing, not its presence.
function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

const migrationSql = readSql("docs/sql/SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql");
const activeTransaction = extractActiveTransaction(migrationSql);
const activeTransactionCodeOnly = stripSqlComments(activeTransaction);

test.describe("SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql — active transaction content", () => {
  test("replaces alert_sources admin policies with an admin_profiles check", () => {
    expect(activeTransaction).toContain("public.admin_profiles");
    expect(activeTransaction).toContain("admin_profiles.user_id = auth.uid()");
  });

  test("does not reintroduce auth.role() = 'authenticated' as the CRUD barrier", () => {
    // Checked against the comment-stripped SQL — the file legitimately
    // *mentions* auth.role() in prose explaining what's being replaced;
    // what must never appear is an actual USING/WITH CHECK clause using it.
    expect(activeTransactionCodeOnly.toLowerCase()).not.toContain("auth.role()");
  });

  test("grants the scheduled writer (automation_identities) nothing on alert_sources", () => {
    // Same reasoning — the file legitimately explains, in a comment, that
    // no automation_identities policy is created; the code itself must
    // contain no such reference.
    expect(activeTransactionCodeOnly).not.toContain("automation_identities");
  });

  test("touches only alert_sources — never alerts, source_checks, or source_notice_candidates", () => {
    // Table-qualified references only, so this doesn't false-positive on
    // "alert_sources" itself containing the substring "alert".
    expect(activeTransactionCodeOnly).not.toMatch(/\bpublic\.alerts\b/);
    expect(activeTransactionCodeOnly).not.toMatch(/\bpublic\.source_checks\b/);
    expect(activeTransactionCodeOnly).not.toMatch(/\bpublic\.source_notice_candidates\b/);
  });

  test("never disables row level security", () => {
    expect(activeTransactionCodeOnly.toLowerCase()).not.toContain("disable row level security");
  });

  test("never uses service_role", () => {
    expect(migrationSql.toLowerCase()).not.toContain("service_role");
  });

  test("drops exactly the four originally-documented policy names, nothing else", () => {
    const dropped = [...activeTransaction.matchAll(/drop policy if exists "([^"]+)"/g)].map((m) => m[1]);
    expect(dropped.sort()).toEqual(
      [
        "Authenticated admins can select sources",
        "Authenticated admins can insert sources",
        "Authenticated admins can update sources",
        "Authenticated admins can delete sources",
      ].sort()
    );
  });

  test("creates exactly four replacement policies, one per CRUD command", () => {
    const created = [...activeTransaction.matchAll(/create policy "([^"]+)"/g)].map((m) => m[1]);
    expect(created.sort()).toEqual(
      [
        "Admins can select alert sources",
        "Admins can insert alert sources",
        "Admins can update alert sources",
        "Admins can delete alert sources",
      ].sort()
    );
  });

  test("is wrapped in a single transaction (begin/commit balance of 1 each in the active block marker)", () => {
    expect((migrationSql.match(/^begin;/gm) ?? []).length).toBe(1);
    expect((migrationSql.match(/^commit;/gm) ?? []).length).toBe(1);
  });
});

test.describe("VERIFY_SPRINT_161B_RLS_READ_ONLY.sql — read-only guarantee", () => {
  const verifySql = readSql("docs/sql/VERIFY_SPRINT_161B_RLS_READ_ONLY.sql");
  const verifySqlCodeOnly = stripSqlComments(verifySql);

  test("contains only SELECT statements — no mutation keywords anywhere", () => {
    // Checked against comment-stripped SQL: the file's own prose legitimately
    // explains, in English, why it avoids granting/mutating anything (e.g.
    // "RLS policies only restrict what an already-GRANTed role can do") —
    // what must never appear is an actual mutation statement.
    const lower = verifySqlCodeOnly.toLowerCase();
    for (const forbidden of [
      "insert into",
      "update ",
      "delete from",
      "alter table",
      "create policy",
      "drop policy",
      "grant ",
      "revoke ",
      "truncate",
    ]) {
      expect(lower).not.toContain(forbidden);
    }
  });

  test("does not query auth.users — every SELECT targets public.* tables only", () => {
    // A prose mention of "auth.users" in a comment is fine (this file's
    // own header explains why it deliberately avoids querying it); what
    // must never appear is an actual query reading from it.
    expect(verifySqlCodeOnly.toLowerCase()).not.toMatch(/from\s+auth\.users/);
  });
});
