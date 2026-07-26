import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * Sprint 166O-B — static, text-only safety audit of the Preview
 * scheduled-writer identity procedure document. Never touches Supabase,
 * never runs SQL, never reads a real credential — every assertion is a
 * plain regex/text check against the document's own text.
 */

const docPath = path.join(process.cwd(), "docs/SPRINT_166O_B_PREVIEW_WRITER_IDENTITY_PROCEDURE_V1.md");
const doc = readFileSync(docPath, "utf8");

test.describe("Sprint 166O-B — no secret, credential, or real full identity value anywhere", () => {
  test("no real-domain email address appears — only the already-documented example.invalid synthetic accounts", () => {
    const emailPattern = /[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi;
    const matches = [...doc.matchAll(emailPattern)];
    expect(matches.length).toBeGreaterThan(0); // the doc does name the known synthetic address
    for (const match of matches) {
      expect(match[1].toLowerCase()).toBe("example.invalid");
    }
  });

  test("no password, token, or API key value appears", () => {
    expect(doc).not.toMatch(/password\s*[:=]\s*['"][^'"]+['"]/i);
    expect(doc).not.toMatch(/CRON_SECRET\s*=\s*['"a-zA-Z0-9]/);
  });

  test("neither user_id (writer or admin) is ever printed in full — only a truncated/masked reference", () => {
    expect(doc).not.toMatch(/2d30d5e3-2074-44b2-9374-e4812a966c52/);
    expect(doc).not.toMatch(/950a90d6-3437-43a4-915a-f10b1be67b0e/);
  });

  test("the Production writer account/credentials are never referenced as a source of values for Preview", () => {
    // The doc explains why copying is meaningless (different accounts,
    // different projects) — it explicitly states there is no value to
    // copy, never an instruction to actually do so.
    expect(doc).toMatch(/no value to "copy" between them/i);
    expect(doc).not.toMatch(/copy the Production/i);
    expect(doc).not.toMatch(/paste the Production/i);
    expect(doc).not.toMatch(/same password as Production/i);
  });
});

test.describe("Sprint 166O-B — reuses the existing, already-documented identity; creates nothing new", () => {
  test("explicitly states no new Supabase Auth account or automation_identities INSERT is needed", () => {
    expect(doc).toMatch(/requires no new Supabase Auth account and no\s*\nnew `automation_identities` INSERT/);
    expect(doc).toMatch(/no prepared SQL file for this sprint/i);
  });

  test("references the Sprint 165C synthetic seed document as the provenance source", () => {
    expect(doc).toMatch(/SPRINT_165C_PHASE_4_AUTH_AND_SYNTHETIC_SEED_V1\.md/);
  });

  test("confirms the writer account is distinct from the admin account and not in admin_profiles", () => {
    expect(doc).toMatch(/\*\*not\*\* a member of `admin_profiles`/i);
    expect(doc).toMatch(/distinct.{0,80}account/i);
  });
});

test.describe("Sprint 166O-B — Environment Variable plan matches this project's own branch-pinning convention", () => {
  test("names exactly the two required variables, Preview scope, branch-pinned", () => {
    expect(doc).toMatch(/SUPABASE_SCHEDULED_WRITER_EMAIL[\s\S]{0,200}Preview scope/);
    expect(doc).toMatch(/SUPABASE_SCHEDULED_WRITER_PASSWORD[\s\S]{0,120}same scope/);
    expect(doc).toMatch(/OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED[\s\S]{0,60}and[\s\S]{0,60}OPERATIONAL_EMAIL_ALERTS_ENABLED[\s\S]{0,60}both already scoped this way/);
  });

  test("does not authorize OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED or any live claim/finish", () => {
    const approvalSection = doc.slice(doc.indexOf("## 12. Separate approval text"));
    expect(approvalSection).toMatch(/does not enable\s*\n?>?\s*OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED/);
    expect(approvalSection).toMatch(/does not extend\s*\n?>?\s*to the actual ledger-test canary invocation/);
  });
});

test.describe("Sprint 166O-B — every risky flag stays unchanged throughout", () => {
  test("the document explicitly confirms every flag's unchanged state in a summary table", () => {
    expect(doc).toMatch(/OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED[\s\S]{0,40}absent everywhere — unchanged/);
    expect(doc).toMatch(/SCHEDULED_WRITES_ENABLED[\s\S]{0,60}absent\/false in every scope — unchanged/);
    expect(doc).toMatch(/Production writer credentials[\s\S]{0,60}never read, never copied/);
  });

  test("explicitly states this document performs no account, SQL, or Environment Variable action", () => {
    expect(doc).toMatch(/Does not create, modify, sign into, or delete any Supabase Auth account/);
    expect(doc).toMatch(/Does not insert, update, or delete any row in `automation_identities`/);
    expect(doc).toMatch(/Does not set, change, or delete any Environment Variable/);
  });
});

test.describe("Sprint 166O-B — nothing here is wired into application code or auto-invoked", () => {
  test("is never referenced or read by any application source file", () => {
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
      readFileSync(f, "utf8").includes("SPRINT_166O_B_PREVIEW_WRITER_IDENTITY_PROCEDURE_V1")
    );
    expect(referencing).toEqual([]);
  });

  test("the ledger-test route grants no capability beyond the existing RPC/RLS mechanism — cross-checked against the live route source", () => {
    const routeSource = readFileSync(
      path.join(process.cwd(), "src/app/api/admin/operational-notification-ledger-test/route.ts"),
      "utf8"
    );
    // The route never constructs the candidate/source-check writer —
    // matching this doc's own §9 claim that the identity gains no new
    // capability beyond claim/finish.
    expect(routeSource).not.toMatch(/createSupabaseScheduledWriter\s*\(/);
    expect(doc).toMatch(/gains \*\*no new capability\*\*/i);
  });
});
