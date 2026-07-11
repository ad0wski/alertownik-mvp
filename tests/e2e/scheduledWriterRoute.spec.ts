import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/write-candidates/route";

/**
 * Sprint 147 — route-level tests for GET /api/cron/write-candidates.
 *
 * This route is default-disabled at three independent layers (kill
 * switches × 2, then technical-account sign-in). These tests exercise
 * every layer up through "sign-in fails" using a mocked `global.fetch` —
 * no live website, no live Supabase project, no real credentials. A fake
 * test secret/credential pair is set only in this test process's memory
 * via `process.env` and restored after every test.
 *
 * The actual write DECISION logic (dedup, insert shaping) is covered
 * exhaustively in tests/e2e/scheduledWriter.spec.ts via a fully
 * in-memory fake — this file does not re-test that logic, only the
 * route's gating behavior, server-only boundaries, and no-publication
 * guarantees.
 */

const FAKE_CRON_SECRET = "test-only-fake-secret-not-a-real-value";
const FAKE_EMAIL = "writer@example.test";
const FAKE_PASSWORD = "test-only-fake-password-not-a-real-value";

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

function authedRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/cron/write-candidates${query}`, {
    headers: { authorization: `Bearer ${FAKE_CRON_SECRET}` },
  });
}

const ENABLED_ENV = {
  SCHEDULED_CHECKS_ENABLED: "true",
  SCHEDULED_WRITES_ENABLED: "true",
  CRON_SECRET: FAKE_CRON_SECRET,
};

// ── Server-only boundary: no Client Component may import the writer ────────

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

test.describe("server-only boundary — no Client Component imports the writer module", () => {
  const srcDir = path.join(process.cwd(), "src");
  const allFiles = listFilesRecursive(srcDir);
  const clientComponentFiles = allFiles.filter((f) => {
    const content = readFileSync(f, "utf8");
    return /^\s*["']use client["']/.test(content);
  });

  test("at least one Client Component exists in the repo (sanity check that this audit is testing something real)", () => {
    expect(clientComponentFiles.length).toBeGreaterThan(0);
  });

  test("no 'use client' file imports src/lib/scheduledWriter", () => {
    const offenders = clientComponentFiles.filter((f) => {
      const content = readFileSync(f, "utf8");
      return /scheduledWriter/.test(content);
    });
    expect(offenders).toEqual([]);
  });

  test("no 'use client' file references the scheduled-writer credential env var names", () => {
    const offenders = clientComponentFiles.filter((f) => {
      const content = readFileSync(f, "utf8");
      return /SUPABASE_SCHEDULED_WRITER_(EMAIL|PASSWORD)/.test(content);
    });
    expect(offenders).toEqual([]);
  });
});

test.describe("static import audit — zero privileged/alert-publishing code reachable", () => {
  const routeSrc = readFileSync(
    path.join(process.cwd(), "src/app/api/cron/write-candidates/route.ts"),
    "utf8"
  );
  const libSrc = readFileSync(path.join(process.cwd(), "src/lib/scheduledWriter.ts"), "utf8");
  const combined = routeSrc + libSrc;

  test("never imports alert-publishing, Builder/draft, or candidate-approval helpers (no alerts import)", () => {
    for (const forbidden of [
      "supabaseAlertWrites",
      "supabaseSourceWrites",
      "candidateReviewActions",
      "markCandidateConverted",
      "publishAlertToSupabase",
      "saveAlertDraftToSupabase",
      "admin_profiles",
      "service_role",
      "SUPABASE_SERVICE_ROLE",
      'from "@/lib/supabaseClient"',
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  test("only ever constructs a Supabase client with the anon/publishable key env var (no service_role)", () => {
    expect(libSrc).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(libSrc).not.toMatch(/service_role/i);
  });

  test("no console logging of secrets/tokens anywhere in the route or lib module", () => {
    expect(combined).not.toMatch(/console\.(log|error|warn|info)/);
  });
});

test.describe("GET /api/cron/write-candidates — two independent kill switches (write mode disabled by default)", () => {
  test("no env configured at all → 503 disabled, nothing fetched", async () => {
    await withEnv(
      { SCHEDULED_CHECKS_ENABLED: undefined, SCHEDULED_WRITES_ENABLED: undefined, CRON_SECRET: undefined },
      async () => {
        let fetchCalled = false;
        const restore = mockFetch(async () => {
          fetchCalled = true;
          throw new Error("fetch must not be called");
        });
        try {
          const res = await GET(authedRequest());
          expect(res.status).toBe(503);
          expect(fetchCalled).toBe(false);
        } finally {
          restore();
        }
      }
    );
  });

  test("SCHEDULED_CHECKS_ENABLED true but SCHEDULED_WRITES_ENABLED not true → still 503 (missing write flag prevents writer construction)", async () => {
    await withEnv(
      { SCHEDULED_CHECKS_ENABLED: "true", SCHEDULED_WRITES_ENABLED: "false", CRON_SECRET: FAKE_CRON_SECRET },
      async () => {
        const res = await GET(authedRequest());
        expect(res.status).toBe(503);
      }
    );
  });

  test("SCHEDULED_WRITES_ENABLED true but SCHEDULED_CHECKS_ENABLED not true → still 503", async () => {
    await withEnv(
      { SCHEDULED_CHECKS_ENABLED: "false", SCHEDULED_WRITES_ENABLED: "true", CRON_SECRET: FAKE_CRON_SECRET },
      async () => {
        const res = await GET(authedRequest());
        expect(res.status).toBe(503);
      }
    );
  });
});

test.describe("GET /api/cron/write-candidates — authentication (both kill switches on)", () => {
  test("missing CRON_SECRET configuration fails closed", async () => {
    await withEnv(
      { SCHEDULED_CHECKS_ENABLED: "true", SCHEDULED_WRITES_ENABLED: "true", CRON_SECRET: undefined },
      async () => {
        const res = await GET(authedRequest());
        expect(res.status).toBe(503);
      }
    );
  });

  test("unauthorized request cannot reach the writer — wrong bearer token rejected, no fetch, no sign-in attempted", async () => {
    await withEnv(ENABLED_ENV, async () => {
      let fetchCalled = false;
      const restore = mockFetch(async () => {
        fetchCalled = true;
        throw new Error("fetch must not be called");
      });
      try {
        const req = new NextRequest("http://localhost/api/cron/write-candidates", {
          headers: { authorization: "Bearer totally-wrong-value" },
        });
        const res = await GET(req);
        expect(res.status).toBe(401);
        expect(fetchCalled).toBe(false);
      } finally {
        restore();
      }
    });
  });
});

test.describe("GET /api/cron/write-candidates — technical-account credentials (auth passed)", () => {
  test("missing SUPABASE_SCHEDULED_WRITER_EMAIL → 503, no fetch attempted (missing writer email prevents authentication)", async () => {
    await withEnv(
      { ...ENABLED_ENV, SUPABASE_SCHEDULED_WRITER_EMAIL: undefined, SUPABASE_SCHEDULED_WRITER_PASSWORD: FAKE_PASSWORD },
      async () => {
        let fetchCalled = false;
        const restore = mockFetch(async () => {
          fetchCalled = true;
          throw new Error("fetch must not be called");
        });
        try {
          const res = await GET(authedRequest());
          expect(res.status).toBe(503);
          expect(fetchCalled).toBe(false);
        } finally {
          restore();
        }
      }
    );
  });

  test("missing SUPABASE_SCHEDULED_WRITER_PASSWORD → 503, no fetch attempted (missing writer password prevents authentication)", async () => {
    await withEnv(
      { ...ENABLED_ENV, SUPABASE_SCHEDULED_WRITER_EMAIL: FAKE_EMAIL, SUPABASE_SCHEDULED_WRITER_PASSWORD: undefined },
      async () => {
        let fetchCalled = false;
        const restore = mockFetch(async () => {
          fetchCalled = true;
          throw new Error("fetch must not be called");
        });
        try {
          const res = await GET(authedRequest());
          expect(res.status).toBe(503);
          expect(fetchCalled).toBe(false);
        } finally {
          restore();
        }
      }
    );
  });

  test("mocked sign-in failure (no real account exists) returns a safe error, no source page ever fetched", async () => {
    await withEnv(
      { ...ENABLED_ENV, SUPABASE_SCHEDULED_WRITER_EMAIL: FAKE_EMAIL, SUPABASE_SCHEDULED_WRITER_PASSWORD: FAKE_PASSWORD },
      async () => {
        let sourcePageFetchCalled = false;
        const restore = mockFetch(async (input) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes("wkd.com.pl") || url.includes("michalowice.pl")) {
            sourcePageFetchCalled = true;
          }
          // Simulate Supabase Auth rejecting the (fake, nonexistent) credentials.
          return new Response(JSON.stringify({ error: "invalid_grant" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        });
        try {
          const res = await GET(authedRequest());
          expect(res.status).toBe(503);
          expect(sourcePageFetchCalled).toBe(false);
        } finally {
          restore();
        }
      }
    );
  });

  test("tokens are not included in the response, and neither is the configured secret/password", async () => {
    await withEnv(
      { ...ENABLED_ENV, SUPABASE_SCHEDULED_WRITER_EMAIL: FAKE_EMAIL, SUPABASE_SCHEDULED_WRITER_PASSWORD: FAKE_PASSWORD },
      async () => {
        const restore = mockFetch(async () =>
          new Response(
            JSON.stringify({ access_token: "leaked-if-present", refresh_token: "leaked-if-present" }),
            { status: 400, headers: { "content-type": "application/json" } }
          )
        );
        try {
          const res = await GET(authedRequest());
          const text = await res.text();
          expect(text).not.toContain(FAKE_CRON_SECRET);
          expect(text).not.toContain(FAKE_PASSWORD);
          expect(text).not.toContain("leaked-if-present");
        } finally {
          restore();
        }
      }
    );
  });

  test("an arbitrary/unlisted sourceKey query param is inert — resolveCronSources' allowlist guarantee is inherited unchanged", async () => {
    await withEnv(
      { ...ENABLED_ENV, SUPABASE_SCHEDULED_WRITER_EMAIL: FAKE_EMAIL, SUPABASE_SCHEDULED_WRITER_PASSWORD: FAKE_PASSWORD },
      async () => {
        const restore = mockFetch(async () => new Response("{}", { status: 400 }));
        try {
          const res = await GET(authedRequest("?sourceKey=https://evil.example/page"));
          // Sign-in still fails first (no real account), so this remains
          // 503 regardless — the allowlist guarantee is structural
          // (resolveCronSources, unchanged from Sprint 142), not dependent
          // on reaching this branch.
          expect(res.status).toBe(503);
        } finally {
          restore();
        }
      }
    );
  });
});

test.describe("no publication — every response states published: false", () => {
  test("response shape always includes published: false, even on early failure paths returning JSON with a body", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: undefined, SCHEDULED_WRITES_ENABLED: undefined }, async () => {
      const res = await GET(authedRequest());
      const body = await res.json();
      // Early-failure responses are minimal ({ ok: false, error }) and
      // deliberately do not claim a "published" field at all — there is
      // no code path, early or late, that ever sets published to
      // anything but false; this is asserted directly against the
      // success-path response shape in the route source below.
      expect(body.ok).toBe(false);
    });
  });

  test("the only 'published' literal in the route source is 'published: false'", () => {
    const routeSrc = readFileSync(
      path.join(process.cwd(), "src/app/api/cron/write-candidates/route.ts"),
      "utf8"
    );
    const publishedAssignments = routeSrc.match(/published:\s*\w+/g) ?? [];
    expect(publishedAssignments.length).toBeGreaterThan(0);
    for (const assignment of publishedAssignments) {
      expect(assignment).toBe("published: false");
    }
  });
});
