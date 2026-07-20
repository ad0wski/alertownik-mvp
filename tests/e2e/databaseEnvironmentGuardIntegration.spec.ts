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

  test("only the write-candidates route imports databaseEnvironmentGuard — no read/public route pulls it in", () => {
    // Matches an actual import statement only (`from "@/lib/databaseEnvironmentGuard"`),
    // never a prose mention of the module's name in a comment elsewhere.
    const importPattern = /from\s+["']@\/lib\/databaseEnvironmentGuard["']/;
    const allFiles = listFilesRecursive(srcDir);
    const importers = allFiles.filter((f) => {
      if (f.endsWith(path.join("app", "api", "cron", "write-candidates", "route.ts"))) return false;
      if (f.endsWith(path.join("lib", "databaseEnvironmentGuard.ts"))) return false;
      const content = readFileSync(f, "utf8");
      return importPattern.test(content);
    });
    expect(importers).toEqual([]);
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

  test("createSupabaseScheduledWriter is only ever called from the one guarded route", () => {
    const allFiles = listFilesRecursive(srcDir);
    const callers = allFiles.filter((f) => {
      if (f.endsWith(path.join("lib", "scheduledWriter.ts"))) return false;
      const content = readFileSync(f, "utf8");
      return /createSupabaseScheduledWriter\s*\(/.test(content);
    });
    expect(callers).toEqual([path.join(srcDir, "app/api/cron/write-candidates/route.ts")]);
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
});
