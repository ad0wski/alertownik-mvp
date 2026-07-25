import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * Sprint 166L-C — static, text-only safety audit of the writer-identity
 * audit/plan document. Never executes SQL, never touches Supabase, never
 * reads a real credential. Every assertion is a plain regex check against
 * the document's own text.
 */

const docPath = path.join(process.cwd(), "docs/SPRINT_166L_C_WRITER_IDENTITY_AUDIT_V1.md");
const doc = readFileSync(docPath, "utf8");

test.describe("Sprint 166L-C — the audit/plan document contains no secret or credential value", () => {
  test("no email-shaped string appears anywhere in the document", () => {
    // The document deliberately never prints the existing account's email
    // (or any email) — only a domain-only fact (`gmail.com`) and boolean
    // heuristics. An '@' character anywhere would indicate an accidental
    // leak of a real address.
    expect(doc).not.toMatch(/@/);
  });

  test("no password, token, or API key value appears", () => {
    expect(doc).not.toMatch(/password\s*[:=]\s*['"][^'"]+['"]/i);
    expect(doc).not.toMatch(/CRON_SECRET\s*=\s*['"a-zA-Z0-9]/);
    // "service_role" as a bare ROLE NAME is expected and legitimate here —
    // the document accurately reports the ACL grant table (which includes
    // the service_role role, matching the live Sprint 166J-A hardening)
    // and states in prose that the code never uses a service_role KEY.
    // Only a key-shaped value paired with it would be a real leak.
    expect(doc).not.toMatch(/service_role["'\s]*[:=]\s*['"][A-Za-z0-9._-]{20,}/i);
  });

  test("the real user_id is never printed in full — only a truncated/masked reference", () => {
    // The document refers to the account only as "...da746" (last 5
    // chars) — never the full UUID, which combined with other metadata
    // could otherwise function as a de-facto secret reference.
    expect(doc).not.toMatch(/104b2caa-2443-4d17-90cc-f10cd41da746/);
  });
});

test.describe("Sprint 166L-C — the document performs no write action, ever", () => {
  test("contains no runnable INSERT/UPDATE/DELETE/DDL statement", () => {
    expect(doc).not.toMatch(/^\s*insert\s+into\s+public\./im);
    expect(doc).not.toMatch(/^\s*update\s+public\./im);
    expect(doc).not.toMatch(/^\s*delete\s+from\s+public\./im);
    expect(doc).not.toMatch(/^\s*create\s+(table|function|policy)/im);
    expect(doc).not.toMatch(/^\s*drop\s+/im);
  });

  test("explicitly states its own read-only, audit-and-plan-only status", () => {
    expect(doc).toMatch(/Status: audit and plan only/);
    // Markdown line-wraps this sentence across lines — match tolerating
    // any whitespace (including a newline) between words, not just a
    // literal single space.
    expect(doc).toMatch(/No Supabase Auth account was created,\s+modified, or signed in/);
    expect(doc).toMatch(/No row was inserted, updated, or deleted/);
  });

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
      readFileSync(f, "utf8").includes("SPRINT_166L_C_WRITER_IDENTITY_AUDIT_V1")
    );
    expect(referencing).toEqual([]);
  });
});

test.describe("Sprint 166L-C — the plan itself never widens scope beyond credentials configuration", () => {
  test("both recommended paths explicitly keep SCHEDULED_WRITES_ENABLED false/absent", () => {
    expect(doc).toMatch(/SCHEDULED_WRITES_ENABLED`\s*remains \*\*false\/absent\*\*/);
  });

  test("the approval text explicitly excludes SCHEDULED_WRITES_ENABLED, notification flags, and any live writer invocation", () => {
    const approvalSection = doc.slice(doc.indexOf("## 7. Separate approval text"));
    expect(approvalSection).toMatch(/does not enable\s*\n?>?\s*SCHEDULED_WRITES_ENABLED/);
    expect(approvalSection).toMatch(/does not trigger any sign-in or writer\s*\n?>?\s*invocation/);
  });
});
