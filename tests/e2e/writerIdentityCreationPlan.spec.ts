import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * Sprint 166L-D — static, text-only safety audit of the new writer
 * identity creation procedure and its prepared (never executed) SQL
 * file. Never touches Supabase, never runs SQL, never reads a real
 * credential — every assertion is a plain regex/text check.
 */

const docPath = path.join(process.cwd(), "docs/SPRINT_166L_D_WRITER_IDENTITY_CREATION_PROCEDURE_V1.md");
const sqlPath = path.join(process.cwd(), "docs/sql/PROPOSED_SPRINT_166L_D_NEW_WRITER_IDENTITY_V1.sql");
const doc = readFileSync(docPath, "utf8");
const sql = readFileSync(sqlPath, "utf8");

function stripSqlComments(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}
const sqlCode = stripSqlComments(sql);

test.describe("Sprint 166L-D — no secret, credential, or real identity value anywhere", () => {
  test("no real-domain email address appears — only illustrative examples on the RFC 2606 reserved example.com domain", () => {
    const emailPattern = /[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi;
    for (const content of [doc, sql]) {
      const matches = [...content.matchAll(emailPattern)];
      for (const match of matches) {
        expect(match[1].toLowerCase()).toBe("example.com");
      }
    }
  });

  test("no password, token, or API key value appears", () => {
    expect(doc).not.toMatch(/password\s*[:=]\s*['"][^'"]+['"]/i);
    expect(sql).not.toMatch(/password\s*[:=]\s*['"][^'"]+['"]/i);
    expect(doc).not.toMatch(/CRON_SECRET\s*=\s*['"a-zA-Z0-9]/);
  });

  test("the pre-existing identity's real user_id is never printed in full", () => {
    expect(doc).not.toMatch(/104b2caa-2443-4d17-90cc-f10cd41da746/);
    expect(sql).not.toMatch(/104b2caa-2443-4d17-90cc-f10cd41da746/);
  });

  test("the SQL file's user_id placeholder is not a well-formed UUID (fails loudly, never a fabricated working default)", () => {
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(sql).toMatch(/PASTE_NEW_WRITER_USER_ID_HERE/);
    expect(uuidPattern.test("PASTE_NEW_WRITER_USER_ID_HERE")).toBe(false);
  });
});

test.describe("Sprint 166L-D — the SQL file cannot silently do anything unattended", () => {
  test("every executable statement (INSERT, SELECT verification, DELETE) references the same unfilled placeholder — never a hardcoded real UUID", () => {
    const insertMatch = sqlCode.match(/insert into public\.automation_identities[\s\S]*?;/i);
    expect(insertMatch).not.toBeNull();
    expect(insertMatch![0]).toMatch(/PASTE_NEW_WRITER_USER_ID_HERE/);
  });

  test("the rollback DELETE is guarded — fails closed unless exactly one matching row exists", () => {
    expect(sqlCode).toMatch(/if\s+v_match_count\s*<>\s*1\s+then/);
    expect(sqlCode).toMatch(/raise exception/i);
    const guardIndex = sqlCode.search(/if\s+v_match_count\s*<>\s*1\s+then/i);
    const deleteIndex = sqlCode.search(/delete from public\.automation_identities/i);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(deleteIndex);
  });

  test("no TRUNCATE, DROP, or CASCADE anywhere", () => {
    expect(sqlCode).not.toMatch(/truncate/i);
    expect(sqlCode).not.toMatch(/\bdrop\s+(table|schema|database|function|index|policy)\b/i);
    expect(sqlCode).not.toMatch(/cascade/i);
  });

  test("the file touches only automation_identities — no other table referenced", () => {
    expect(sqlCode).not.toMatch(/\bfrom\s+public\.(?!automation_identities)/i);
    expect(sqlCode).not.toMatch(/\binto\s+public\.(?!automation_identities)/i);
    expect(sqlCode).not.toMatch(/\bupdate\s+public\.(?!automation_identities)/i);
  });

  test("never modifies admin_profiles", () => {
    expect(sql).not.toMatch(/admin_profiles/);
  });
});

test.describe("Sprint 166L-D — nothing here is wired into application code or auto-invoked", () => {
  test("neither the doc nor the SQL file is referenced by any application source file", () => {
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
    const names = [
      "SPRINT_166L_D_WRITER_IDENTITY_CREATION_PROCEDURE_V1",
      "PROPOSED_SPRINT_166L_D_NEW_WRITER_IDENTITY_V1.sql",
    ];
    const referencing = listFilesRecursive(srcDir).filter((f) => {
      const content = readFileSync(f, "utf8");
      return names.some((name) => content.includes(name));
    });
    expect(referencing).toEqual([]);
  });

  test("the procedure document requires Auto Confirm User, matching the code's actual sign-in flow (no email-link confirmation path exists)", () => {
    expect(doc).toMatch(/Auto Confirm User/);
    const scheduledWriterSource = readFileSync(
      path.join(process.cwd(), "src/lib/scheduledWriter.ts"),
      "utf8"
    );
    expect(scheduledWriterSource).toMatch(/signInWithPassword/);
    expect(scheduledWriterSource).not.toMatch(/verifyOtp|exchangeCodeForSession/);
  });
});

test.describe("Sprint 166L-D — every risky flag stays false/absent throughout", () => {
  test("the document explicitly confirms SCHEDULED_WRITES_ENABLED, OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED, and OPERATIONAL_EMAIL_ALERTS_ENABLED are unchanged", () => {
    expect(doc).toMatch(/SCHEDULED_WRITES_ENABLED[\s\S]{0,60}absent\/false — unchanged/);
    expect(doc).toMatch(/OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED[\s\S]{0,60}absent\/false — unchanged/);
    expect(doc).toMatch(/OPERATIONAL_EMAIL_ALERTS_ENABLED[\s\S]{0,60}absent\/false — unchanged/);
  });

  test("the document explicitly states no account, SQL, or Environment Variable action has occurred", () => {
    expect(doc).toMatch(/No Supabase Auth account has been created/);
    expect(doc).toMatch(/No row has been inserted into/);
    expect(doc).toMatch(/No Environment Variable has been set/);
  });
});
