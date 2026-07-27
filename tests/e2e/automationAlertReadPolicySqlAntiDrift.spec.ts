import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

/**
 * Sprint 177E — static anti-drift checks on the proposed (unexecuted)
 * automation alert-read RLS policy SQL package. These never touch a
 * database — they only read the .sql files as text and assert on their
 * content, the same pattern alertSourcesRlsSqlAntiDrift.spec.ts (Sprint
 * 161B) already established for this repo's other proposed-but-unrun
 * migrations. No local Supabase harness exists in this project (no
 * supabase/ CLI config, no docker-based test database) — this static
 * audit plus the runtime dedup tests in alertCrossTableDedup.spec.ts are
 * the full validation this sprint can honestly perform before Adam
 * applies the migration manually. Real RLS enforcement (an actual
 * Postgres session evaluating the policy) is NOT exercised by any test
 * here or elsewhere in this repo — that requires a live or Preview
 * Supabase project, explicitly deferred to a future, separately-approved
 * sprint per this sprint's own instructions.
 */

function readSql(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function extractActiveTransaction(sql: string): string {
  const beginIdx = sql.search(/^begin;/m);
  const commitIdx = sql.search(/^commit;/m);
  if (beginIdx === -1 || commitIdx === -1 || commitIdx < beginIdx) {
    throw new Error("could not locate a begin;...commit; transaction in the SQL file");
  }
  return sql.slice(beginIdx, commitIdx);
}

function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

const migrationSql = readSql("docs/sql/PROPOSED_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_V1.sql");
const activeTransaction = extractActiveTransaction(migrationSql);
const activeTransactionCodeOnly = stripSqlComments(activeTransaction);

test.describe("PROPOSED_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_V1.sql — active transaction content", () => {
  test("creates exactly one policy, on public.alerts, for the scheduled writer", () => {
    const created = [...activeTransaction.matchAll(/create policy "([^"]+)"/g)].map((m) => m[1]);
    expect(created).toEqual(["Scheduled writer can select alerts for deduplication"]);
  });

  test("the created policy is FOR SELECT only — no INSERT/UPDATE/DELETE keyword accompanies it", () => {
    expect(activeTransactionCodeOnly.toLowerCase()).not.toMatch(/create policy[\s\S]*?for insert/);
    expect(activeTransactionCodeOnly.toLowerCase()).not.toMatch(/create policy[\s\S]*?for update/);
    expect(activeTransactionCodeOnly.toLowerCase()).not.toMatch(/create policy[\s\S]*?for delete/);
    expect(activeTransactionCodeOnly).toMatch(/create policy "Scheduled writer can select alerts for deduplication"\s*\n\s*on public\.alerts for select/);
  });

  test("only drops the same policy name it creates (idempotent re-run guard), nothing else", () => {
    const dropped = [...activeTransaction.matchAll(/drop policy if exists "([^"]+)"/g)].map((m) => m[1]);
    expect(dropped).toEqual(["Scheduled writer can select alerts for deduplication"]);
  });

  test("the four existing admin policies and the public anon policy are never dropped or redefined", () => {
    for (const existingPolicyName of [
      "Admins can select alerts",
      "Admins can insert alerts",
      "Admins can update alerts",
      "Admins can delete alerts",
      "Public can read published alerts",
    ]) {
      expect(activeTransaction).not.toContain(`drop policy if exists "${existingPolicyName}"`);
      expect(activeTransaction).not.toContain(`create policy "${existingPolicyName}"`);
    }
  });

  test("the policy condition references automation_identities and auth.uid(), the same shape already live for source_notice_candidates/source_checks", () => {
    expect(activeTransaction).toContain("public.automation_identities");
    expect(activeTransaction).toContain("automation_identities.user_id = auth.uid()");
  });

  test("grants nothing to service_role, anon, or the generic authenticated role as a class", () => {
    expect(migrationSql.toLowerCase()).not.toContain("service_role");
    expect(activeTransactionCodeOnly).not.toMatch(/to\s+anon\b/i);
    expect(activeTransactionCodeOnly).not.toMatch(/to\s+authenticated\b/i);
  });

  test("never disables row level security", () => {
    expect(activeTransactionCodeOnly.toLowerCase()).not.toContain("disable row level security");
  });

  test("touches only public.alerts — creates/drops no policy on any other table", () => {
    // automation_identities/alert_sources/etc. are legitimately referenced
    // in prose and in the EXISTS subquery (an ordinary read, not a policy
    // definition) — what must never appear is this file defining or
    // dropping a policy on any table other than alerts.
    const policyTableRefs = [
      ...activeTransactionCodeOnly.matchAll(/(?:create|drop) policy[^\n]*\n\s*on (public\.\w+)/g),
    ].map((m) => m[1]);
    for (const ref of policyTableRefs) {
      expect(ref).toBe("public.alerts");
    }
    expect(policyTableRefs.length).toBeGreaterThan(0);
  });

  test("changes no data — no INSERT/UPDATE/DELETE/TRUNCATE statement anywhere in the active transaction", () => {
    const lower = activeTransactionCodeOnly.toLowerCase();
    for (const forbidden of ["insert into", "update public.alerts", "delete from", "truncate"]) {
      expect(lower).not.toContain(forbidden);
    }
  });

  test("is wrapped in exactly one begin/commit transaction", () => {
    expect((migrationSql.match(/^begin;/gm) ?? []).length).toBe(1);
    expect((migrationSql.match(/^commit;/gm) ?? []).length).toBe(1);
  });

  test("does not add a role/purpose/active column to automation_identities — membership alone is the signal, matching the live two-column schema", () => {
    expect(activeTransactionCodeOnly.toLowerCase()).not.toContain("alter table public.automation_identities");
  });
});

test.describe("VERIFY_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_READ_ONLY_V1.sql — read-only guarantee", () => {
  const verifySql = readSql("docs/sql/VERIFY_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_READ_ONLY_V1.sql");
  const verifySqlCodeOnly = stripSqlComments(verifySql);

  test("contains only SELECT statements — no mutation keywords anywhere", () => {
    // "update " as a bare substring would false-positive on the legitimate
    // policy-name string literal 'Admins can update alerts' used in a
    // read-only WHERE ... in (...) clause below — checked as a real SQL
    // UPDATE statement shape instead (statement-start or "update <table>").
    const lower = verifySqlCodeOnly.toLowerCase();
    for (const forbidden of [
      "insert into",
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
    expect(lower).not.toMatch(/(^|;)\s*update\s+\w+\s+set\b/);
  });

  test("does not query auth.users — every SELECT targets public.* tables/catalogs only", () => {
    expect(verifySqlCodeOnly.toLowerCase()).not.toMatch(/from\s+auth\.users/);
  });

  test("checks the new policy by its exact name, not a guessed/looser match", () => {
    expect(verifySql).toContain("Scheduled writer can select alerts for deduplication");
  });
});
