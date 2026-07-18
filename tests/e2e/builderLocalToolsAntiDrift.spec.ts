import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

/**
 * Sprint 161 §H — the Builder's "Narzędzia" tab has two legacy
 * localStorage-only buttons (`saveDraft`, `publishAlert`) that predate the
 * real Supabase publish flow and never touched it. Sprint 161 relabeled
 * them instead of removing them (see the sprint doc for why: small,
 * self-contained, low risk). This is a static anti-drift check — it reads
 * the source once and fails if either function starts calling a Supabase
 * write helper, or if the relabeled copy regresses back to implying a real
 * publish happened.
 */

const builderSrc = readFileSync(
  path.join(process.cwd(), "src/app/builder/page.tsx"),
  "utf8"
);

function extractFunctionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found in builder/page.tsx`);
  // Find the matching closing brace by brace-depth counting from the
  // function's opening brace.
  const openBrace = source.indexOf("{", start);
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading function ${name}`);
}

test.describe("Builder local-tools anti-drift — Sprint 161", () => {
  test("the local-only saveDraft function never imports or calls a Supabase write helper", () => {
    const body = extractFunctionBody(builderSrc, "saveDraft");
    expect(body.toLowerCase()).not.toContain("supabase");
  });

  test("the local-only publishAlert function never imports or calls a Supabase write helper", () => {
    const body = extractFunctionBody(builderSrc, "publishAlert");
    expect(body.toLowerCase()).not.toContain("supabase");
  });

  test("the Narzędzia tab explicitly states this is not a real publication", () => {
    expect(builderSrc).toContain("to NIE jest publikacja");
    expect(builderSrc).toContain("Nic nie trafia do Supabase");
  });

  test("the real Supabase publish path is the only place status becomes published", () => {
    const alertWritesSrc = readFileSync(
      path.join(process.cwd(), "src/lib/supabaseAlertWrites.ts"),
      "utf8"
    );
    const publishedAssignments = alertWritesSrc.match(/status:\s*["']published["']/g) ?? [];
    // Sprint 160A's audit found exactly 2 — this pins that count so a
    // future change that adds a new publish path fails loudly here too.
    expect(publishedAssignments.length).toBe(2);
  });
});
