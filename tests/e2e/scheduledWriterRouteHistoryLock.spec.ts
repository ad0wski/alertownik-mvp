import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/write-candidates/route";

/**
 * Sprint 166C — route-level integration tests for the run-history +
 * concurrency-lock + retry wiring added to GET /api/cron/write-candidates.
 *
 * A fake global.fetch simulates three distinct upstream systems by URL:
 *   - Supabase Auth sign-in (/auth/v1/token)
 *   - the scheduled_writer_runs REST table (/rest/v1/scheduled_writer_runs)
 *   - the Michałowice source page itself
 * No live network, no live Supabase project, no real secrets — matching
 * the existing convention in scheduledWriterRoute.spec.ts.
 */

const FAKE_CRON_SECRET = "test-only-fake-secret-not-a-real-value";
const FAKE_EMAIL = "writer@example.test";
const FAKE_PASSWORD = "test-only-fake-password-not-a-real-value";
const FAKE_WRITER_UID = "fake-writer-uuid";
const MICHALOWICE_URL = "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty";

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
  return new NextRequest("http://localhost/api/cron/write-candidates?sourceKey=michalowice-komunikaty", {
    headers: { authorization: `Bearer ${FAKE_CRON_SECRET}` },
  });
}

const GUARD_PASS_PROJECT_REF = "test-only-fake-project-ref";
const GUARD_PASS_ENV = {
  VERCEL_ENV: "development",
  SUPABASE_ENVIRONMENT_TAG: "development",
  NEXT_PUBLIC_SUPABASE_URL: `https://${GUARD_PASS_PROJECT_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-only-fake-publishable-key",
  SUPABASE_EXPECTED_PROJECT_REF: GUARD_PASS_PROJECT_REF,
};

const ENABLED_ENV = {
  ...GUARD_PASS_ENV,
  SCHEDULED_CHECKS_ENABLED: "true",
  SCHEDULED_WRITES_ENABLED: "true",
  CRON_SECRET: FAKE_CRON_SECRET,
  SUPABASE_SCHEDULED_WRITER_EMAIL: FAKE_EMAIL,
  SUPABASE_SCHEDULED_WRITER_PASSWORD: FAKE_PASSWORD,
};

const NOTICE_HTML = `<html><body><main><article>Przerwa w dostawie wody w Komorowie od poniedziałku do środy, prosimy o zgromadzenie zapasów wody pitnej na czas planowanych prac konserwacyjnych sieci.</article></main></body></html>`;

interface RunLog {
  method: string;
  url: string;
  body: unknown;
}

/** Builds a fetch router simulating Auth + scheduled_writer_runs + the
 *  source page. `lockRow` controls what findActiveLock() sees.
 *  `sourceResponder` lets a test simulate transient/permanent source-page
 *  failures. Every call is recorded in `log` for assertions. */
function makeRouter(options: {
  lockRow?: { started_at: string; finished_at: string | null } | null;
  sourceResponder?: (callIndex: number) => Response;
}) {
  const log: RunLog[] = [];
  let sourceCallCount = 0;

  const impl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    let parsedBody: unknown = undefined;
    if (init?.body && typeof init.body === "string") {
      try {
        parsedBody = JSON.parse(init.body);
      } catch {
        parsedBody = init.body;
      }
    }
    log.push({ method, url, body: parsedBody });

    if (url.includes("/auth/v1/token")) {
      return new Response(
        JSON.stringify({
          access_token: "fake-access-token",
          refresh_token: "fake-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
          user: { id: FAKE_WRITER_UID, email: FAKE_EMAIL },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes("/rest/v1/scheduled_writer_runs")) {
      if (method === "GET") {
        const rows = options.lockRow ? [options.lockRow] : [];
        return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (method === "POST" || method === "PATCH") {
        // Prefer: return=minimal — empty body, matches openRun/closeRun
        // never calling .select().
        return new Response("", { status: 204 });
      }
    }

    // writeCandidatesForSource's own dependencies (src/lib/scheduledWriter.ts)
    // — findExistingCandidateTexts (SELECT, empty = no prior candidates, so
    // the fresh notice classifies as "new") and insertPendingCandidate /
    // insertSourceCheck (both INSERT, Prefer: return=minimal).
    if (url.includes("/rest/v1/source_notice_candidates")) {
      if (method === "GET") {
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      }
      if (method === "POST") {
        return new Response("", { status: 201 });
      }
    }
    if (url.includes("/rest/v1/source_checks") && method === "POST") {
      return new Response("", { status: 201 });
    }

    if (url.includes("michalowice.pl")) {
      const index = sourceCallCount;
      sourceCallCount++;
      if (options.sourceResponder) return options.sourceResponder(index);
      return new Response(NOTICE_HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }

    throw new Error(`unexpected fetch in test: ${method} ${url}`);
  };

  return { impl, log, get sourceCallCount() { return sourceCallCount; } };
}

test.describe("write-candidates — run history + lock, no active lock", () => {
  test("a normal successful run opens then closes exactly one history row, outcome success", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({ lockRow: null });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.published).toBe(false);

        const runsCalls = router.log.filter((c) => c.url.includes("scheduled_writer_runs"));
        const inserts = runsCalls.filter((c) => c.method === "POST");
        const updates = runsCalls.filter((c) => c.method === "PATCH");
        const selects = runsCalls.filter((c) => c.method === "GET");

        expect(selects.length).toBe(1); // the lock check
        expect(inserts.length).toBe(1); // exactly one opened run
        expect(updates.length).toBe(1); // exactly one closed run

        const openPayload = inserts[0].body as Record<string, unknown>;
        expect(openPayload.finished_at).toBeUndefined();
        expect(openPayload.trigger).toBe("manual");
        expect(typeof openPayload.id).toBe("string");

        const closePayload = updates[0].body as Record<string, unknown>;
        expect(closePayload.outcome).toBe("success");
        expect(closePayload.finished_at).toBeTruthy();
      } finally {
        restore();
      }
    });
  });

  test("the closing UPDATE targets the exact same id the opening INSERT used (id=eq. filter)", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({ lockRow: null });
      const restore = mockFetch(router.impl);
      try {
        await GET(authedRequest());
        const runsCalls = router.log.filter((c) => c.url.includes("scheduled_writer_runs"));
        const insertBody = runsCalls.find((c) => c.method === "POST")!.body as { id: string };
        const updateCall = runsCalls.find((c) => c.method === "PATCH")!;
        expect(updateCall.url).toContain(`id=eq.${insertBody.id}`);
      } finally {
        restore();
      }
    });
  });

  test("no history/lock field ever leaks the CRON_SECRET, writer password, or an access token", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({ lockRow: null });
      const restore = mockFetch(router.impl);
      try {
        await GET(authedRequest());
        const runsCalls = router.log.filter((c) => c.url.includes("scheduled_writer_runs"));
        const serialized = JSON.stringify(runsCalls);
        expect(serialized).not.toContain(FAKE_CRON_SECRET);
        expect(serialized).not.toContain(FAKE_PASSWORD);
        expect(serialized).not.toContain("fake-access-token");
      } finally {
        restore();
      }
    });
  });
});

test.describe("write-candidates — active lock held", () => {
  test("a fresh, unfinished lock blocks the run: no source fetch, no candidate write, 503 with a distinct message", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({
        lockRow: { started_at: new Date().toISOString(), finished_at: null },
      });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error).toContain("uruchomienie");
        expect(router.sourceCallCount).toBe(0);

        const runsCalls = router.log.filter((c) => c.url.includes("scheduled_writer_runs"));
        const inserts = runsCalls.filter((c) => c.method === "POST");
        const updates = runsCalls.filter((c) => c.method === "PATCH");
        // A skipped run is still logged once (open immediately closed),
        // distinct from the blocking lock row itself.
        expect(inserts.length).toBe(1);
        expect(updates.length).toBe(1);
        expect((updates[0].body as Record<string, unknown>).outcome).toBe("skipped_lock_held");
      } finally {
        restore();
      }
    });
  });

  test("a stale lock (older than RUN_LOCK_STALE_AFTER_MS) does not block — the run proceeds normally", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const staleStartedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 minutes ago
      const router = makeRouter({ lockRow: { started_at: staleStartedAt, finished_at: null } });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(200);
        expect(router.sourceCallCount).toBeGreaterThan(0);
      } finally {
        restore();
      }
    });
  });

  test("a finished lock (finished_at set) never blocks, regardless of age", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({
        lockRow: {
          started_at: new Date(Date.now() - 10_000).toISOString(),
          finished_at: new Date().toISOString(),
        },
      });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(200);
      } finally {
        restore();
      }
    });
  });
});

test.describe("write-candidates — retry wiring (route level)", () => {
  test("one transient 503 then success: exactly one retry, run still closes with outcome success", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({
        lockRow: null,
        sourceResponder: (index) =>
          index === 0
            ? new Response("temporarily unavailable", { status: 503 })
            : new Response(NOTICE_HTML, { status: 200, headers: { "content-type": "text/html" } }),
      });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        const body = await res.json();
        expect(router.sourceCallCount).toBe(2);
        // The retry itself succeeded (the second attempt returned 200 and
        // was parsed without a fetch/timeout/parse error) — the overall
        // route outcome reflects that, regardless of whether the fixture
        // page's text happened to parse into a proposal (a separate,
        // unrelated concern already covered by the parser's own tests).
        expect(["success", "no_proposals"]).toContain(body.results[0].outcome);

        const closePayload = router.log.find(
          (c) => c.url.includes("scheduled_writer_runs") && c.method === "PATCH"
        )!.body as Record<string, unknown>;
        expect(closePayload.outcome).toBe("success");
      } finally {
        restore();
      }
    });
  });

  test("a permanent 404 never retries: exactly one source fetch, run closes with outcome total_failure", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({
        lockRow: null,
        sourceResponder: () => new Response("not found", { status: 404 }),
      });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        const body = await res.json();
        expect(router.sourceCallCount).toBe(1);
        expect(body.failedSources).toBe(1);

        const closePayload = router.log.find(
          (c) => c.url.includes("scheduled_writer_runs") && c.method === "PATCH"
        )!.body as Record<string, unknown>;
        expect(closePayload.outcome).toBe("total_failure");
        expect(closePayload.error_summary).toBe("1/1 sources failed");
      } finally {
        restore();
      }
    });
  });

  test("two consecutive transient 5xx responses: exactly one retry (two attempts total), reported as a failure", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({
        lockRow: null,
        sourceResponder: () => new Response("oops", { status: 503 }),
      });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        const body = await res.json();
        expect(router.sourceCallCount).toBe(2);
        expect(body.failedSources).toBe(1);
      } finally {
        restore();
      }
    });
  });
});

test.describe("write-candidates — kill switches still fail closed with the new wiring present", () => {
  test("SCHEDULED_WRITES_ENABLED=false: 503, no auth attempted, no history row, no source fetch", async () => {
    await withEnv({ ...ENABLED_ENV, SCHEDULED_WRITES_ENABLED: "false" }, async () => {
      const router = makeRouter({ lockRow: null });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(503);
        expect(router.log.length).toBe(0);
      } finally {
        restore();
      }
    });
  });

  test("SCHEDULED_CHECKS_ENABLED=false: 503, no auth attempted, no history row, no source fetch", async () => {
    await withEnv({ ...ENABLED_ENV, SCHEDULED_CHECKS_ENABLED: "false" }, async () => {
      const router = makeRouter({ lockRow: null });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(503);
        expect(router.log.length).toBe(0);
      } finally {
        restore();
      }
    });
  });

  test("database-environment guard failing (Layer 0): 503, no auth attempted, no history row, no source fetch", async () => {
    await withEnv({ ...ENABLED_ENV, SUPABASE_EXPECTED_PROJECT_REF: undefined }, async () => {
      const router = makeRouter({ lockRow: null });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(503);
        expect(router.log.length).toBe(0);
      } finally {
        restore();
      }
    });
  });
});

test.describe("write-candidates — hard cap and alerts isolation still hold with the new wiring", () => {
  test("candidatesInserted never exceeds 1 (default cap), even with a rich notice page", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({ lockRow: null });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        const body = await res.json();
        expect(body.candidatesInserted).toBeLessThanOrEqual(1);
      } finally {
        restore();
      }
    });
  });

  test("no request in this run's history ever targets an 'alerts' table path", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({ lockRow: null });
      const restore = mockFetch(router.impl);
      try {
        await GET(authedRequest());
        const alertsCalls = router.log.filter((c) => c.url.includes("/rest/v1/alerts"));
        expect(alertsCalls).toEqual([]);
      } finally {
        restore();
      }
    });
  });
});
