import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { GET as writeCandidatesGet } from "@/app/api/cron/write-candidates/route";

/**
 * Sprint 165B / 165B-2 — integration coverage for the new Layer 0
 * database-environment guard inside GET /api/cron/write-candidates, plus
 * the structural guarantees from the Sprint 165A design's §E acceptance
 * list that don't need a live second Supabase project:
 *   - the guard is additive (it never widens what was already blocked)
 *   - public/read-only routes are untouched by its existence
 *   - no route reaches the scheduled writer except through this one gated
 *     route (nothing bypasses the guard via a direct import elsewhere)
 *   - Sprint 165B-2: the corrected four-signal guard (app environment,
 *     SUPABASE_ENVIRONMENT_TAG, actual Supabase project ref, expected
 *     project ref) is exercised end-to-end through the real route, not
 *     just the pure guard function
 */

const FAKE_CRON_SECRET = "test-only-fake-secret-not-a-real-value";

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return fn().finally(() => {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
}

function mockFetch(impl: typeof fetch) {
  const original = global.fetch;
  global.fetch = impl;
  return () => {
    global.fetch = original;
  };
}

function authedRequest(): NextRequest {
  return new NextRequest("http://localhost/api/cron/write-candidates", {
    headers: { authorization: `Bearer ${FAKE_CRON_SECRET}` },
  });
}

const OTHERWISE_FULLY_ENABLED_ENV = {
  SCHEDULED_CHECKS_ENABLED: "true",
  SCHEDULED_WRITES_ENABLED: "true",
  CRON_SECRET: FAKE_CRON_SECRET,
  SUPABASE_SCHEDULED_WRITER_EMAIL: "writer@example.test",
  SUPABASE_SCHEDULED_WRITER_PASSWORD: "test-only-fake-password-not-a-real-value",
};

test.describe("§E — Layer 0 guard inside write-candidates: additive, never widens", () => {
  test("today (no SUPABASE_ENVIRONMENT_TAG configured anywhere), the route stays blocked even with layers 1-3 fully satisfied and a valid bearer token", async () => {
    await withEnv(
      { ...OTHERWISE_FULLY_ENABLED_ENV, VERCEL_ENV: "production", SUPABASE_ENVIRONMENT_TAG: undefined },
      async () => {
        let fetchCalled = false;
        const restore = mockFetch(async () => {
          fetchCalled = true;
          throw new Error("fetch must not be called — Layer 0 must block first");
        });
        try {
          const res = await writeCandidatesGet(authedRequest());
          expect(res.status).toBe(503);
          expect(fetchCalled).toBe(false);
          const body = await res.json();
          expect(body.ok).toBe(false);
        } finally {
          restore();
        }
      }
    );
  });

  test("VERCEL_ENV unset (unknown app environment) blocks the route even with everything else configured", async () => {
    await withEnv(
      { ...OTHERWISE_FULLY_ENABLED_ENV, VERCEL_ENV: undefined, SUPABASE_ENVIRONMENT_TAG: "production" },
      async () => {
        const res = await writeCandidatesGet(authedRequest());
        expect(res.status).toBe(503);
      }
    );
  });

  test("a mismatched pairing (Preview app, Production-tagged database) blocks the route even with everything else configured", async () => {
    await withEnv(
      { ...OTHERWISE_FULLY_ENABLED_ENV, VERCEL_ENV: "preview", SUPABASE_ENVIRONMENT_TAG: "production" },
      async () => {
        const res = await writeCandidatesGet(authedRequest());
        expect(res.status).toBe(503);
      }
    );
  });

  test("the guard's block response never contains the CRON_SECRET or writer password values", async () => {
    await withEnv(
      { ...OTHERWISE_FULLY_ENABLED_ENV, VERCEL_ENV: "production", SUPABASE_ENVIRONMENT_TAG: undefined },
      async () => {
        const res = await writeCandidatesGet(authedRequest());
        const text = await res.text();
        expect(text).not.toContain(FAKE_CRON_SECRET);
        expect(text).not.toContain(OTHERWISE_FULLY_ENABLED_ENV.SUPABASE_SCHEDULED_WRITER_PASSWORD);
      }
    );
  });
});

test.describe("§C (Sprint 165B-2) — the real gap this correction closes, exercised through the actual route", () => {
  const PREVIEW_PROJECT_URL = "https://previewrefabcdef.supabase.co";
  const PREVIEW_PROJECT_REF = "previewrefabcdef";
  const PRODUCTION_PROJECT_URL = "https://prodrefabcdefghij.supabase.co";
  const PRODUCTION_PROJECT_REF = "prodrefabcdefghij";

  test("matching app environment + tag alone is NOT sufficient — a Preview app/tag pairing wired to the Production project URL is still blocked, even with layers 1-3 fully satisfied", async () => {
    await withEnv(
      {
        ...OTHERWISE_FULLY_ENABLED_ENV,
        VERCEL_ENV: "preview",
        SUPABASE_ENVIRONMENT_TAG: "preview",
        // The exact misconfiguration this sprint's re-audit named: labels
        // agree, but the actually-configured project is Production's.
        NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_PROJECT_URL,
        SUPABASE_EXPECTED_PROJECT_REF: PREVIEW_PROJECT_REF,
      },
      async () => {
        let fetchCalled = false;
        const restore = mockFetch(async () => {
          fetchCalled = true;
          throw new Error("fetch must not be called — the corrected guard must block first");
        });
        try {
          const res = await writeCandidatesGet(authedRequest());
          expect(res.status).toBe(503);
          expect(fetchCalled).toBe(false);
        } finally {
          restore();
        }
      }
    );
  });

  test("all four signals genuinely matching lets the route proceed past Layer 0 (reaching later layers, e.g. a real fetch attempt)", async () => {
    await withEnv(
      {
        ...OTHERWISE_FULLY_ENABLED_ENV,
        VERCEL_ENV: "preview",
        SUPABASE_ENVIRONMENT_TAG: "preview",
        NEXT_PUBLIC_SUPABASE_URL: PREVIEW_PROJECT_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-only-fake-anon-key-not-a-real-value",
        SUPABASE_EXPECTED_PROJECT_REF: PREVIEW_PROJECT_REF,
      },
      async () => {
        let fetchCalled = false;
        const restore = mockFetch(async () => {
          fetchCalled = true;
          // Simulate Supabase Auth rejecting the fake credentials — this
          // proves Layer 0 passed and the route reached Layer 3's sign-in
          // attempt, without ever needing a real Supabase project.
          return new Response(JSON.stringify({ error: "invalid_grant" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        });
        try {
          await writeCandidatesGet(authedRequest());
          expect(fetchCalled).toBe(true);
        } finally {
          restore();
        }
      }
    );
  });

  test("the response never contains the actual or expected Supabase project ref, or the full Supabase URL, in either the blocked or the pass-through case", async () => {
    await withEnv(
      {
        ...OTHERWISE_FULLY_ENABLED_ENV,
        VERCEL_ENV: "preview",
        SUPABASE_ENVIRONMENT_TAG: "preview",
        NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_PROJECT_URL,
        SUPABASE_EXPECTED_PROJECT_REF: PREVIEW_PROJECT_REF,
      },
      async () => {
        const res = await writeCandidatesGet(authedRequest());
        const text = await res.text();
        expect(text).not.toContain(PREVIEW_PROJECT_REF);
        expect(text).not.toContain(PRODUCTION_PROJECT_REF);
        expect(text).not.toMatch(/supabase\.co/);
      }
    );
  });
});

test.describe("§E.9 — read-only/public routes are untouched by the new guard", () => {
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

  test("only write-candidates and specifically reviewed consumers import databaseEnvironmentGuard; every reviewed consumer's use of the actual gate and the writer is exactly what it's reviewed for", () => {
    // Matches an actual import statement only (`from "@/lib/databaseEnvironmentGuard"`),
    // never a prose mention of the module's name in a comment elsewhere.
    const importPattern = /from\s+["']@\/lib\/databaseEnvironmentGuard["']/;
    const allFiles = listFilesRecursive(srcDir);
    const writeCandidatesRoute = path.join(srcDir, "app", "api", "cron", "write-candidates", "route.ts");
    // Sprint 180C — /api/cron/auto-publish-trusted-source is structurally
    // identical to write-candidates itself (full guard + real writer
    // construction, both reviewed together), not one of the narrower
    // read-only/guard-only consumers below — excluded here the same way.
    const autoPublishRoute = path.join(srcDir, "app", "api", "cron", "auto-publish-trusted-source", "route.ts");
    // Sprint 166D-2B/2C — /api/admin/automation-status legitimately imports
    // this module too, but only the pure, non-secret-exposing
    // getConfiguredDatabaseEnvironmentTag() helper, for a read-only,
    // admin-session-gated run-history display. It never calls
    // checkDatabaseEnvironmentGuard() (the actual write gate) and never
    // constructs the scheduled writer.
    const knownReadOnlyConsumers = [path.join(srcDir, "app", "api", "admin", "automation-status", "route.ts")];
    // Sprint 166N-B — /api/admin/operational-notification-ledger-test
    // legitimately calls the REAL gate (checkDatabaseEnvironmentGuard),
    // mirroring write-candidates' own Layer 0, because it too signs in as
    // the scheduled writer (via signInScheduledWriter, checked below) to
    // reach the ledger RPCs' automation_identities check. It never calls
    // createSupabaseScheduledWriter — it never writes a candidate or
    // source_check, only a ledger claim/finish — so it stays out of the
    // §E.10 createSupabaseScheduledWriter caller list untouched.
    const knownFullGateConsumers = [
      path.join(srcDir, "app", "api", "admin", "operational-notification-ledger-test", "route.ts"),
    ];
    const importers = allFiles.filter((f) => {
      if (f === writeCandidatesRoute) return false;
      if (f === autoPublishRoute) return false;
      if (f.endsWith(path.join("lib", "databaseEnvironmentGuard.ts"))) return false;
      const content = readFileSync(f, "utf8");
      return importPattern.test(content);
    });
    expect(importers.slice().sort()).toEqual([...knownReadOnlyConsumers, ...knownFullGateConsumers].sort());

    for (const importer of knownReadOnlyConsumers) {
      const content = readFileSync(importer, "utf8");
      expect(content).not.toMatch(/checkDatabaseEnvironmentGuard\s*\(/);
      expect(content).not.toMatch(/createSupabaseScheduledWriter\s*\(/);
    }
    for (const importer of knownFullGateConsumers) {
      const content = readFileSync(importer, "utf8");
      expect(content).toMatch(/checkDatabaseEnvironmentGuard\s*\(/);
      expect(content).not.toMatch(/createSupabaseScheduledWriter\s*\(/);
    }
  });

  test("the two dry-run cron routes (check-sources, check-michalowice) never import the guard or the scheduled writer — their zero-write guarantee stays purely structural, unchanged by this sprint", () => {
    const dryRunRoutes = [
      path.join(srcDir, "app/api/cron/check-sources/route.ts"),
      path.join(srcDir, "app/api/cron/check-michalowice/route.ts"),
    ];
    for (const routePath of dryRunRoutes) {
      const content = readFileSync(routePath, "utf8");
      expect(content).not.toMatch(/databaseEnvironmentGuard/);
      expect(content).not.toMatch(/scheduledWriter/);
    }
  });
});

test.describe("§E.10 — nothing bypasses the guard via a direct import of the scheduled writer elsewhere", () => {
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

  test("createSupabaseScheduledWriter is only ever called from the two guarded, reviewed routes", () => {
    const allFiles = listFilesRecursive(srcDir);
    const callers = allFiles.filter((f) => {
      if (f.endsWith(path.join("lib", "scheduledWriter.ts"))) return false;
      const content = readFileSync(f, "utf8");
      return /createSupabaseScheduledWriter\s*\(/.test(content);
    });
    expect(callers.slice().sort()).toEqual(
      [
        path.join(srcDir, "app/api/cron/write-candidates/route.ts"),
        path.join(srcDir, "app/api/cron/auto-publish-trusted-source/route.ts"),
      ].sort()
    );
  });

  test("the guarded route itself calls checkDatabaseEnvironmentGuard before constructing any writer", () => {
    const routeSrc = readFileSync(
      path.join(srcDir, "app/api/cron/write-candidates/route.ts"),
      "utf8"
    );
    const guardIndex = routeSrc.indexOf("checkDatabaseEnvironmentGuard(");
    const writerIndex = routeSrc.indexOf("createSupabaseScheduledWriter(");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(writerIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(writerIndex);
  });

  test("the auto-publish route itself calls checkDatabaseEnvironmentGuard before constructing any writer", () => {
    const routeSrc = readFileSync(
      path.join(srcDir, "app/api/cron/auto-publish-trusted-source/route.ts"),
      "utf8"
    );
    const guardIndex = routeSrc.indexOf("checkDatabaseEnvironmentGuard(");
    const writerIndex = routeSrc.indexOf("createSupabaseScheduledWriter(");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(writerIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(writerIndex);
  });
});
