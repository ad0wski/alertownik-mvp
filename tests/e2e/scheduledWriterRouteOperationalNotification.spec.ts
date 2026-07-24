import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/write-candidates/route";

/**
 * Sprint 166G-1 — route-level integration tests for the runtime ledger
 * wiring in GET /api/cron/write-candidates. Same fake-fetch technique as
 * scheduledWriterRouteHistoryLock.spec.ts (no real network, no real
 * Supabase project, no real Resend). Adds fake handlers for the two
 * operational-notification RPCs so the flag on/off behavior can be proven
 * end-to-end through the real route, not just at the orchestrator layer.
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

interface RunLog {
  method: string;
  url: string;
  body: unknown;
}

/** Minimal router: open/close always succeed (one row), source fetch is
 *  controllable, and the two ledger RPCs are stubbed with a fixed,
 *  test-controlled result so this file tests only the WIRING (flag gate,
 *  call presence/absence, response isolation) — not the ledger's own
 *  atomic semantics, already verified live in Sprint 166F-2B. */
function makeRouter(options: {
  sourceStatus?: number;
  claimResult?: { claimed: boolean; event_id: string | null; suppressed_reason: string | null };
}) {
  const log: RunLog[] = [];
  const claimResult = options.claimResult ?? { claimed: true, event_id: "fake-event-id", suppressed_reason: null };

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
      return new Response("true", { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/rest/v1/rpc/close_scheduled_writer_run")) {
      return new Response("true", { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/rest/v1/rpc/claim_operational_notification_event")) {
      return new Response(JSON.stringify([claimResult]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/finish_operational_notification_event")) {
      return new Response("true", { status: 200, headers: { "content-type": "application/json" } });
    }

    if (url.includes("/rest/v1/source_notice_candidates")) {
      if (method === "GET") return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      if (method === "POST") return new Response("", { status: 201 });
    }
    if (url.includes("/rest/v1/source_checks") && method === "POST") {
      return new Response("", { status: 201 });
    }

    if (url.includes("michalowice.pl")) {
      const status = options.sourceStatus ?? 404;
      if (status === 200) {
        return new Response("<html><body><main><article>Brak nowych komunikatów.</article></main></body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("not found", { status });
    }

    throw new Error(`unexpected fetch in test: ${method} ${url}`);
  };

  return { impl, log };
}

test.describe("write-candidates — operational notification runtime flag OFF (default)", () => {
  test("a total_failure run never calls the claim or finish RPC when the flag is absent", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({ sourceStatus: 404 });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        const body = await res.json();
        expect(body.failedSources).toBe(1);
        const claimCalls = router.log.filter((c) => c.url.includes("rpc/claim_operational_notification_event"));
        const finishCalls = router.log.filter((c) => c.url.includes("rpc/finish_operational_notification_event"));
        expect(claimCalls.length).toBe(0);
        expect(finishCalls.length).toBe(0);
      } finally {
        restore();
      }
    });
  });

  test("an explicitly false flag value also results in zero claim/finish calls", async () => {
    await withEnv({ ...ENABLED_ENV, OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED: "false" }, async () => {
      const router = makeRouter({ sourceStatus: 404 });
      const restore = mockFetch(router.impl);
      try {
        await GET(authedRequest());
        const claimCalls = router.log.filter((c) => c.url.includes("rpc/claim_operational_notification_event"));
        expect(claimCalls.length).toBe(0);
      } finally {
        restore();
      }
    });
  });
});

test.describe("write-candidates — operational notification runtime flag ON", () => {
  test("a total_failure run calls claim exactly once, and finish exactly once, after the run history close", async () => {
    await withEnv({ ...ENABLED_ENV, OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED: "true" }, async () => {
      const router = makeRouter({ sourceStatus: 404 });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(200);

        const claimCalls = router.log.filter((c) => c.url.includes("rpc/claim_operational_notification_event"));
        const finishCalls = router.log.filter((c) => c.url.includes("rpc/finish_operational_notification_event"));
        const closeIndex = router.log.findIndex((c) => c.url.includes("rpc/close_scheduled_writer_run"));
        const claimIndex = router.log.findIndex((c) => c.url.includes("rpc/claim_operational_notification_event"));

        expect(claimCalls.length).toBe(1);
        expect(finishCalls.length).toBe(1);
        // The run is always closed before any claim is attempted.
        expect(closeIndex).toBeGreaterThanOrEqual(0);
        expect(claimIndex).toBeGreaterThan(closeIndex);
      } finally {
        restore();
      }
    });
  });

  test("a success run never calls claim at all — the policy suppresses it before any ledger I/O", async () => {
    await withEnv({ ...ENABLED_ENV, OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED: "true" }, async () => {
      const router = makeRouter({ sourceStatus: 200 });
      const restore = mockFetch(router.impl);
      try {
        await GET(authedRequest());
        const claimCalls = router.log.filter((c) => c.url.includes("rpc/claim_operational_notification_event"));
        expect(claimCalls.length).toBe(0);
      } finally {
        restore();
      }
    });
  });

  test("claim suppressed by duplicate → zero finish calls", async () => {
    await withEnv({ ...ENABLED_ENV, OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED: "true" }, async () => {
      const router = makeRouter({
        sourceStatus: 404,
        claimResult: { claimed: false, event_id: null, suppressed_reason: "suppress_duplicate" },
      });
      const restore = mockFetch(router.impl);
      try {
        await GET(authedRequest());
        const finishCalls = router.log.filter((c) => c.url.includes("rpc/finish_operational_notification_event"));
        expect(finishCalls.length).toBe(0);
      } finally {
        restore();
      }
    });
  });

  test("the route's own JSON response never contains ledger or provider data", async () => {
    await withEnv({ ...ENABLED_ENV, OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED: "true" }, async () => {
      const router = makeRouter({ sourceStatus: 404 });
      const restore = mockFetch(router.impl);
      try {
        const res = await GET(authedRequest());
        const body = await res.json();
        const serialized = JSON.stringify(body);
        expect(serialized).not.toContain("fake-event-id");
        expect(serialized).not.toContain("claimed");
        expect(serialized).not.toContain("suppressed_reason");
      } finally {
        restore();
      }
    });
  });

  test("no RPC call ever leaks the CRON_SECRET, writer password, or access token", async () => {
    await withEnv({ ...ENABLED_ENV, OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED: "true" }, async () => {
      const router = makeRouter({ sourceStatus: 404 });
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
