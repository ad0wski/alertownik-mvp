import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/write-candidates/route";

/**
 * Sprint 166C, Stage 2b — route-level integration tests for the atomic
 * open_scheduled_writer_run / close_scheduled_writer_run RPC wiring
 * (docs/sql/PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql, NOT YET
 * EXECUTED) plus the retry behavior from the prior Stage.
 *
 * A fake global.fetch simulates three distinct upstream systems by URL:
 *   - Supabase Auth sign-in (/auth/v1/token)
 *   - the two RPC functions (/rest/v1/rpc/open_scheduled_writer_run,
 *     /rest/v1/rpc/close_scheduled_writer_run) — backed by an in-memory
 *     fake that models the atomic unique-index semantics the real SQL
 *     function provides (at most one open row per (environment_tag,
 *     trigger) scope; a stale open row is silently closed first)
 *   - the Michałowice source page itself
 * No live network, no live Supabase project, no real secrets — matching
 * the existing convention in scheduledWriterRoute.spec.ts.
 */

const FAKE_CRON_SECRET = "test-only-fake-secret-not-a-real-value";
const FAKE_EMAIL = "writer@example.test";
const FAKE_PASSWORD = "test-only-fake-password-not-a-real-value";
const FAKE_WRITER_UID = "fake-writer-uuid";
const MICHALOWICE_URL = "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty";
const STALE_AFTER_SECONDS = 300; // must match RUN_LOCK_STALE_AFTER_MS / 1000

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

interface FakeRun {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  environmentTag: string;
  trigger: string;
}

/** An in-memory model of the atomic SQL function pair, sharable across
 *  "concurrent" invocations in a single test (via Promise.all) — mirrors
 *  the exact technique already used in scheduledWriterConcurrency.spec.ts
 *  for the content_fingerprint unique constraint. */
function makeFakeDatabase(seedRuns: FakeRun[] = []) {
  const runs: FakeRun[] = [...seedRuns];

  function openRun(id: string, trigger: string, environmentTag: string, staleAfterSeconds: number): boolean {
    const now = Date.now();
    // Housekeeping: close any stale open run for this scope (mirrors the
    // SQL function's own UPDATE ... WHERE ... AND started_at < now() - interval).
    for (const run of runs) {
      if (
        run.environmentTag === environmentTag &&
        run.trigger === trigger &&
        run.finishedAt === null &&
        now - run.startedAt >= staleAfterSeconds * 1000
      ) {
        run.finishedAt = now;
      }
    }
    // Atomic-equivalent check: is there still an open, non-stale row for
    // this exact scope? (A real unique index would reject a conflicting
    // INSERT at the database level — this single-threaded JS model has
    // no interleaving between the check and the insert, so it correctly
    // represents the atomic guarantee for a test process.)
    const stillOpen = runs.some(
      (r) => r.environmentTag === environmentTag && r.trigger === trigger && r.finishedAt === null
    );
    if (stillOpen) return false;
    runs.push({ id, startedAt: now, finishedAt: null, environmentTag, trigger });
    return true;
  }

  function closeRun(id: string): boolean {
    const run = runs.find((r) => r.id === id && r.finishedAt === null);
    if (!run) return false;
    run.finishedAt = Date.now();
    return true;
  }

  return { runs, openRun, closeRun };
}

/** Builds a fetch router simulating Auth + the two RPC functions + the
 *  source page. Every call is recorded in `log` for assertions. */
function makeRouter(options: {
  db?: ReturnType<typeof makeFakeDatabase>;
  rpcError?: "open" | "close" | null;
  sourceResponder?: (callIndex: number) => Response;
}) {
  const log: RunLog[] = [];
  let sourceCallCount = 0;
  const db = options.db ?? makeFakeDatabase();

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

    if (url.includes("/rest/v1/rpc/open_scheduled_writer_run")) {
      if (options.rpcError === "open") {
        return new Response(JSON.stringify({ message: "simulated rpc failure" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      const body = parsedBody as { p_id: string; p_trigger: string; p_environment_tag: string; p_stale_after_seconds: number };
      const opened = db.openRun(body.p_id, body.p_trigger, body.p_environment_tag, body.p_stale_after_seconds);
      return new Response(JSON.stringify(opened), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (url.includes("/rest/v1/rpc/close_scheduled_writer_run")) {
      if (options.rpcError === "close") {
        return new Response(JSON.stringify({ message: "simulated rpc failure" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      const body = parsedBody as { p_id: string };
      const closed = db.closeRun(body.p_id);
      return new Response(JSON.stringify(closed), { status: 200, headers: { "content-type": "application/json" } });
    }

    // writeCandidatesForSource's own dependencies (src/lib/scheduledWriter.ts).
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

  return {
    impl,
    log,
    db,
    get sourceCallCount() {
      return sourceCallCount;
    },
  };
}

test.describe("write-candidates — atomic lock, no active lock", () => {
  test("a normal successful run opens then closes exactly one row, outcome success", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({});
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.published).toBe(false);

        expect(router.db.runs.length).toBe(1);
        expect(router.db.runs[0].finishedAt).not.toBeNull();

        const opens = router.log.filter((c) => c.url.includes("rpc/open_scheduled_writer_run"));
        const closes = router.log.filter((c) => c.url.includes("rpc/close_scheduled_writer_run"));
        expect(opens.length).toBe(1);
        expect(closes.length).toBe(1);
        expect((closes[0].body as Record<string, unknown>).p_id).toBe(router.db.runs[0].id);
        expect((closes[0].body as Record<string, unknown>).p_outcome).toBe("success");
      } finally {
        restore();
      }
    });
  });

  test("the open RPC is always called with the current RUN_LOCK_STALE_AFTER_MS-derived seconds value", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({});
      const restore = mockFetch(router.impl);
      try {
        await GET(authedRequest());
        const open = router.log.find((c) => c.url.includes("rpc/open_scheduled_writer_run"))!;
        expect((open.body as Record<string, unknown>).p_stale_after_seconds).toBe(STALE_AFTER_SECONDS);
      } finally {
        restore();
      }
    });
  });

  test("no RPC call ever leaks the CRON_SECRET, writer password, or an access token", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({});
      const restore = mockFetch(router.impl);
      try {
        await GET(authedRequest());
        const rpcCalls = router.log.filter((c) => c.url.includes("/rpc/"));
        const serialized = JSON.stringify(rpcCalls);
        expect(serialized).not.toContain(FAKE_CRON_SECRET);
        expect(serialized).not.toContain(FAKE_PASSWORD);
        expect(serialized).not.toContain("fake-access-token");
      } finally {
        restore();
      }
    });
  });
});

test.describe("write-candidates — two concurrent invocations racing on the same lock", () => {
  test("exactly one of two simultaneous invocations opens the run; the other gets lock_held with no source fetch and no candidate write", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const sharedDb = makeFakeDatabase();
      const router = makeRouter({ db: sharedDb });

      // Both invocations share the exact same fake database instance and
      // fetch implementation — this is the same technique
      // scheduledWriterConcurrency.spec.ts already uses to model a
      // genuine race with a single shared in-memory table.
      const restore = mockFetch(router.impl);
      try {
        const [resA, resB] = await Promise.all([GET(authedRequest()), GET(authedRequest())]);
        const bodies = await Promise.all([resA.json(), resB.json()]);
        const statuses = [resA.status, resB.status].sort();
        const oks = bodies.map((b) => b.ok);

        // Exactly one succeeded (200, ok:true), exactly one was blocked (503, ok:false).
        expect(statuses).toEqual([200, 503]);
        expect(oks.filter(Boolean).length).toBe(1);
        expect(oks.filter((v) => !v).length).toBe(1);

        const blocked = bodies.find((b) => !b.ok)!;
        expect(blocked.reason).toBe("lock_held");

        // The database itself only ever recorded one run row, not two —
        // the blocked invocation never even attempted to open a
        // competing row's worth of history.
        expect(sharedDb.runs.length).toBe(1);
      } finally {
        restore();
      }
    });
  });

  test("the blocked invocation never fetches the source page and never writes a candidate", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const sharedDb = makeFakeDatabase();
      const router = makeRouter({ db: sharedDb });
      const restore = mockFetch(router.impl);
      try {
        const [resA, resB] = await Promise.all([GET(authedRequest()), GET(authedRequest())]);
        const bodies = await Promise.all([resA.json(), resB.json()]);
        // Exactly one source fetch total across BOTH invocations — the
        // blocked one contributed zero.
        expect(router.sourceCallCount).toBe(1);
        const winner = bodies.find((b) => b.ok);
        expect(winner.candidatesInserted).toBeLessThanOrEqual(1);
      } finally {
        restore();
      }
    });
  });
});

test.describe("write-candidates — stale lock recovery", () => {
  test("a fresh, unfinished lock blocks a second invocation", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const db = makeFakeDatabase([
        { id: "existing-fresh", startedAt: Date.now(), finishedAt: null, environmentTag: "development", trigger: "manual" },
      ]);
      const router = makeRouter({ db });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.reason).toBe("lock_held");
        expect(router.sourceCallCount).toBe(0);
      } finally {
        restore();
      }
    });
  });

  test("a stale lock (older than RUN_LOCK_STALE_AFTER_MS) is auto-closed and does not block — the run proceeds normally", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const staleStartedAt = Date.now() - (STALE_AFTER_SECONDS + 60) * 1000; // 1 minute past the threshold
      const db = makeFakeDatabase([
        { id: "existing-stale", startedAt: staleStartedAt, finishedAt: null, environmentTag: "development", trigger: "manual" },
      ]);
      const router = makeRouter({ db });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(200);
        expect(router.sourceCallCount).toBeGreaterThan(0);

        // The stale row was closed by the housekeeping step (not deleted,
        // not reopened), and exactly one NEW row now exists alongside it.
        const staleRow = db.runs.find((r) => r.id === "existing-stale")!;
        expect(staleRow.finishedAt).not.toBeNull();
        expect(db.runs.length).toBe(2);
      } finally {
        restore();
      }
    });
  });

  test("a finished lock (finished_at set) never blocks, regardless of age", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const db = makeFakeDatabase([
        {
          id: "existing-finished",
          startedAt: Date.now() - 10_000,
          finishedAt: Date.now(),
          environmentTag: "development",
          trigger: "manual",
        },
      ]);
      const router = makeRouter({ db });
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

test.describe("write-candidates — lock mechanism failure is fail-closed", () => {
  test("an unexpected error from the open RPC blocks the run exactly like a real lock conflict — no source fetch, no candidate write", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({ rpcError: "open" });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(router.sourceCallCount).toBe(0);
      } finally {
        restore();
      }
    });
  });
});

test.describe("write-candidates — retry wiring (route level, unchanged from prior stage)", () => {
  test("one transient 503 then success: exactly one retry, run still closes with outcome success", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({
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
        expect(["success", "no_proposals"]).toContain(body.results[0].outcome);

        const close = router.log.find((c) => c.url.includes("rpc/close_scheduled_writer_run"))!;
        expect((close.body as Record<string, unknown>).p_outcome).toBe("success");
      } finally {
        restore();
      }
    });
  });

  test("a permanent 404 never retries: exactly one source fetch, run closes with outcome total_failure", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({ sourceResponder: () => new Response("not found", { status: 404 }) });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        const body = await res.json();
        expect(router.sourceCallCount).toBe(1);
        expect(body.failedSources).toBe(1);

        const close = router.log.find((c) => c.url.includes("rpc/close_scheduled_writer_run"))!;
        expect((close.body as Record<string, unknown>).p_outcome).toBe("total_failure");
        expect((close.body as Record<string, unknown>).p_error_summary).toBe("1/1 sources failed");
      } finally {
        restore();
      }
    });
  });

  test("two consecutive transient 5xx responses: exactly one retry (two attempts total), reported as a failure", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({ sourceResponder: () => new Response("oops", { status: 503 }) });
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

test.describe("write-candidates — kill switches still fail closed with the atomic lock present", () => {
  test("SCHEDULED_WRITES_ENABLED=false: 503, no auth attempted, no RPC call, no source fetch", async () => {
    await withEnv({ ...ENABLED_ENV, SCHEDULED_WRITES_ENABLED: "false" }, async () => {
      const router = makeRouter({});
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

  test("SCHEDULED_CHECKS_ENABLED=false: 503, no auth attempted, no RPC call, no source fetch", async () => {
    await withEnv({ ...ENABLED_ENV, SCHEDULED_CHECKS_ENABLED: "false" }, async () => {
      const router = makeRouter({});
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

  test("database-environment guard failing (Layer 0): 503, no auth attempted, no RPC call, no source fetch", async () => {
    await withEnv({ ...ENABLED_ENV, SUPABASE_EXPECTED_PROJECT_REF: undefined }, async () => {
      const router = makeRouter({});
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

test.describe("write-candidates — hard cap and alerts isolation still hold with the atomic lock present", () => {
  test("candidatesInserted never exceeds 1 (default cap)", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({});
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

  test("no request in this run ever targets an 'alerts' table path", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({});
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
