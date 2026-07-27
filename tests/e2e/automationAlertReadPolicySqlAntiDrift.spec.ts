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

  test("issues no GRANT or REVOKE statement — role scoping is via CREATE POLICY TO only", () => {
    expect(migrationSql.toLowerCase()).not.toContain("service_role");
    expect(activeTransactionCodeOnly.toLowerCase()).not.toMatch(/^\s*grant\s/m);
    expect(activeTransactionCodeOnly.toLowerCase()).not.toMatch(/^\s*revoke\s/m);
  });

  test("the created policy is scoped TO authenticated, never TO public or TO anon — Sprint 177F-E incident regression guard", () => {
    // A CREATE POLICY with no `to <role>` clause defaults to PUBLIC (every
    // role, including anon). That exact gap — this policy's original,
    // already-executed-on-Production text had no `to` clause at all — is
    // what caused the confirmed Sprint 177F-E incident: anon's own read
    // of published alerts started failing with "permission denied for
    // table automation_identities", because RLS must evaluate this
    // policy's automation_identities EXISTS clause for anon too, and anon
    // has zero grant on that table. This file has since been retroactively
    // corrected to include `to authenticated`; the real Production fix is
    // the separate corrective hotfix migration, not a re-run of this file.
    expect(activeTransactionCodeOnly).toMatch(
      /create policy "Scheduled writer can select alerts for deduplication"\s*\n\s*on public\.alerts for select\s*\n\s*to authenticated\b/
    );
    expect(activeTransactionCodeOnly).not.toMatch(/to\s+public\b/i);
    expect(activeTransactionCodeOnly).not.toMatch(/to\s+anon\b/i);
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

// ============================================================================
// Sprint 177F-E — corrective hotfix (role-scope regression fix) static audit.
// The proposed migration above was already executed on Production without
// a `to authenticated` clause, causing a confirmed anon-read incident (see
// the note atop PROPOSED_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_V1.sql).
// The corrective file below narrows four existing scheduled-writer
// policies to `to authenticated` — it must never widen any grant.
// ============================================================================

const correctiveSql = readSql(
  "docs/sql/CORRECTIVE_SPRINT_177_SCHEDULED_WRITER_POLICY_ROLE_SCOPE_V1.sql"
);
const correctiveTransaction = extractActiveTransaction(correctiveSql);
const correctiveTransactionCodeOnly = stripSqlComments(correctiveTransaction);

const HOTFIX_POLICIES = [
  { name: "Scheduled writer can select alerts for deduplication", table: "public.alerts", forClause: "select" },
  { name: "Scheduled writer can insert automated source_checks", table: "public.source_checks", forClause: "insert" },
  {
    name: "Scheduled writer can insert pending source_notice_candidates",
    table: "public.source_notice_candidates",
    forClause: "insert",
  },
  {
    name: "Scheduled writer can select source_notice_candidates",
    table: "public.source_notice_candidates",
    forClause: "select",
  },
];

test.describe("CORRECTIVE_SPRINT_177_SCHEDULED_WRITER_POLICY_ROLE_SCOPE_V1.sql — active transaction content", () => {
  test("is wrapped in exactly one begin/commit transaction", () => {
    expect((correctiveSql.match(/^begin;/gm) ?? []).length).toBe(1);
    expect((correctiveSql.match(/^commit;/gm) ?? []).length).toBe(1);
  });

  test("drops and recreates exactly the four confirmed scheduled-writer policies, nothing else", () => {
    const dropped = [...correctiveTransaction.matchAll(/drop policy if exists "([^"]+)"/g)].map((m) => m[1]);
    const created = [...correctiveTransaction.matchAll(/create policy "([^"]+)"/g)].map((m) => m[1]);
    const expectedNames = HOTFIX_POLICIES.map((p) => p.name);
    expect(dropped.sort()).toEqual([...expectedNames].sort());
    expect(created.sort()).toEqual([...expectedNames].sort());
  });

  test("every recreated policy is scoped TO authenticated — never TO public or TO anon", () => {
    expect(correctiveTransactionCodeOnly).not.toMatch(/to\s+public\b/i);
    expect(correctiveTransactionCodeOnly).not.toMatch(/to\s+anon\b/i);
    for (const policy of HOTFIX_POLICIES) {
      const blockPattern = new RegExp(
        `create policy "${policy.name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"\\s*\\n\\s*on ${policy.table.replace(".", "\\.")} for ${policy.forClause}\\s*\\n\\s*to authenticated\\b`
      );
      expect(correctiveTransactionCodeOnly).toMatch(blockPattern);
    }
  });

  test("each recreated policy keeps its FOR clause exactly as before — no FOR ALL, no added command type", () => {
    // Each policy's `for <cmd>` must match its known original command
    // (select or insert) — the hotfix must only add a role scope, never
    // broaden what operation the policy governs.
    for (const policy of HOTFIX_POLICIES) {
      const forbidden = policy.forClause === "select" ? ["for insert", "for update", "for delete", "for all"] : ["for select", "for update", "for delete", "for all"];
      const escapedName = policy.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const blockMatch = correctiveTransactionCodeOnly.match(
        new RegExp(`create policy "${escapedName}"[\\s\\S]*?(?=create policy|$)`)
      );
      expect(blockMatch).not.toBeNull();
      const block = (blockMatch as RegExpMatchArray)[0].toLowerCase();
      for (const term of forbidden) {
        expect(block).not.toContain(term);
      }
    }
  });

  test("preserves the automation_identities.user_id = auth.uid() condition in every recreated policy", () => {
    const matches = [...correctiveTransaction.matchAll(/automation_identities\.user_id = auth\.uid\(\)/g)];
    expect(matches.length).toBe(HOTFIX_POLICIES.length);
  });

  test("issues no GRANT or REVOKE statement anywhere in the file", () => {
    const lower = correctiveTransactionCodeOnly.toLowerCase();
    expect(lower).not.toMatch(/^\s*grant\s/m);
    expect(lower).not.toMatch(/^\s*revoke\s/m);
    expect(lower).not.toContain("service_role");
  });

  test("never touches automation_identities itself — no ALTER TABLE, no new column, no GRANT to anon", () => {
    expect(correctiveTransactionCodeOnly.toLowerCase()).not.toContain("alter table public.automation_identities");
    expect(correctiveTransactionCodeOnly.toLowerCase()).not.toMatch(/grant[\s\S]*automation_identities[\s\S]*to\s+anon/);
  });

  test("never touches the public anon read policy or the admin policies on alerts", () => {
    for (const untouchedPolicyName of [
      "Public can read published alerts",
      "Admins can select alerts",
      "Admins can read all alerts",
      "Admins can insert alerts",
      "Admins can update alerts",
      "Admins can delete alerts",
    ]) {
      expect(correctiveTransaction).not.toContain(`drop policy if exists "${untouchedPolicyName}"`);
      expect(correctiveTransaction).not.toContain(`create policy "${untouchedPolicyName}"`);
    }
  });

  test("changes no data — no INSERT/UPDATE/DELETE/TRUNCATE row-level statement anywhere", () => {
    const lower = correctiveTransactionCodeOnly.toLowerCase();
    for (const forbidden of ["insert into", "delete from", "truncate"]) {
      expect(lower).not.toContain(forbidden);
    }
    expect(lower).not.toMatch(/(^|;)\s*update\s+\w+\s+set\b/);
  });

  test("never disables row level security", () => {
    expect(correctiveTransactionCodeOnly.toLowerCase()).not.toContain("disable row level security");
  });

  test("contains no secrets, tokens, emails, or concrete user_id/UUID literals", () => {
    const lower = correctiveSql.toLowerCase();
    expect(lower).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
    expect(lower).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(lower).not.toContain("anon_key");
    expect(lower).not.toContain("service_role");
    expect(lower).not.toMatch(/bearer\s+[a-z0-9._-]+/);
  });
});

test.describe("VERIFY_SPRINT_177_SCHEDULED_WRITER_POLICY_ROLE_SCOPE_READ_ONLY_V1.sql — read-only guarantee", () => {
  const hotfixVerifySql = readSql(
    "docs/sql/VERIFY_SPRINT_177_SCHEDULED_WRITER_POLICY_ROLE_SCOPE_READ_ONLY_V1.sql"
  );
  const hotfixVerifySqlCodeOnly = stripSqlComments(hotfixVerifySql);

  test("contains only SELECT statements — no mutation keywords anywhere", () => {
    const lower = hotfixVerifySqlCodeOnly.toLowerCase();
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

  test("checks all four corrected policies by exact name", () => {
    for (const policy of HOTFIX_POLICIES) {
      expect(hotfixVerifySql).toContain(policy.name);
    }
  });

  test("asserts roles must equal exactly {authenticated}, not merely 'not anon'", () => {
    expect(hotfixVerifySql).toContain("{authenticated}");
  });

  test("includes a live check that anon still has zero grant on automation_identities", () => {
    expect(hotfixVerifySqlCodeOnly.toLowerCase()).toMatch(/has_table_privilege\('anon',\s*c\.oid,\s*'select'\)/);
    expect(hotfixVerifySql).toContain("automation_identities");
  });
});
