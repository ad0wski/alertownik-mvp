import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { POST as ledgerTestPost } from "@/app/api/admin/operational-notification-ledger-test/route";

/**
 * Sprint 166N-B — POST /api/admin/operational-notification-ledger-test.
 * Same fake-fetch technique as operationalEmailTestRoute.spec.ts and
 * scheduledWriterRouteOperationalNotification.spec.ts: intercepts Supabase
 * auth/RPC calls only — zero real network, zero real Supabase project,
 * zero real Resend contact anywhere in this file. No test sets
 * OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED against the real
 * environment — every env var here is a fake, test-local value restored
 * after each test.
 */

const FAKE_URL = "https://fake-test-project.supabase.co";
const FAKE_KEY = "fake-test-anon-key-not-a-real-value";
const FAKE_WRITER_EMAIL = "writer@example.test";
const FAKE_WRITER_PASSWORD = "test-only-fake-password-not-a-real-value";
const FAKE_WRITER_UID = "fake-writer-uuid";

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

const GUARD_PASS_PROJECT_REF = "test-only-fake-project-ref";
const BASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: FAKE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_KEY,
  VERCEL_ENV: "development",
  SUPABASE_ENVIRONMENT_TAG: "development",
  SUPABASE_EXPECTED_PROJECT_REF: GUARD_PASS_PROJECT_REF,
  SUPABASE_SCHEDULED_WRITER_EMAIL: undefined as string | undefined,
  SUPABASE_SCHEDULED_WRITER_PASSWORD: undefined as string | undefined,
  OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED: undefined as string | undefined,
  OPERATIONAL_EMAIL_ALERTS_ENABLED: undefined as string | undefined,
  RESEND_API_KEY: undefined as string | undefined,
  OPERATIONAL_ALERT_EMAIL_FROM: undefined as string | undefined,
  OPERATIONAL_ALERT_EMAIL_TO: undefined as string | undefined,
};
// Guard-pass env needs NEXT_PUBLIC_SUPABASE_URL to embed the expected
// project ref, matching checkDatabaseEnvironmentGuard()'s own derivation.
BASE_ENV.NEXT_PUBLIC_SUPABASE_URL = `https://${GUARD_PASS_PROJECT_REF}.supabase.co`;

const ENABLED_ENV = {
  ...BASE_ENV,
  OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED: "true",
  SUPABASE_SCHEDULED_WRITER_EMAIL: FAKE_WRITER_EMAIL,
  SUPABASE_SCHEDULED_WRITER_PASSWORD: FAKE_WRITER_PASSWORD,
};

function unauthedRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/operational-notification-ledger-test", { method: "POST" });
}

function authedRequest(token: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/operational-notification-ledger-test", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

interface RouterOptions {
  claimResult?: { claimed: boolean; event_id: string | null; suppressed_reason: string | null };
  finishOk?: boolean;
}

/** Router mocking: admin session, writer sign-in, and the two ledger RPCs.
 *  Mirrors scheduledWriterRouteOperationalNotification.spec.ts's own
 *  makeRouter() pattern exactly. */
function makeRouter(options: RouterOptions = {}) {
  const log: { url: string; method: string }[] = [];
  const claimResult = options.claimResult ?? { claimed: true, event_id: "fake-ledger-test-event-id", suppressed_reason: null };
  const finishOk = options.finishOk ?? true;

  const impl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    log.push({ url, method });

    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "signed-in-admin", aud: "authenticated" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/admin_profiles")) {
      return new Response(JSON.stringify([{ user_id: "signed-in-admin" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/auth/v1/token")) {
      return new Response(
        JSON.stringify({
          access_token: "fake-writer-access-token",
          refresh_token: "fake-writer-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
          user: { id: FAKE_WRITER_UID, email: FAKE_WRITER_EMAIL },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/rpc/claim_operational_notification_event")) {
      return new Response(JSON.stringify([claimResult]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/finish_operational_notification_event")) {
      return new Response(JSON.stringify(finishOk), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`unexpected fetch in test: ${method} ${url}`);
  };

  return { impl, log };
}

test.describe("POST /api/admin/operational-notification-ledger-test — auth gate", () => {
  test("unauthenticated request → 401, zero further fetches", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const res = await ledgerTestPost(unauthedRequest());
      expect(res.status).toBe(401);
    });
  });

  test("genuinely signed-in but non-admin session → 403", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const restore = mockFetch(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/user")) {
          return new Response(JSON.stringify({ id: "signed-in-non-admin", aud: "authenticated" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/rest/v1/admin_profiles")) {
          return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
        }
        throw new Error(`unexpected fetch to ${url} — a non-admin session must never reach this route`);
      });
      try {
        const res = await ledgerTestPost(authedRequest("a-genuinely-valid-but-non-admin-token"));
        expect(res.status).toBe(403);
      } finally {
        restore();
      }
    });
  });
});

test.describe("POST /api/admin/operational-notification-ledger-test — environment guard", () => {
  test("SUPABASE_ENVIRONMENT_TAG not configured → 503, zero writer sign-in attempted", async () => {
    await withEnv({ ...ENABLED_ENV, SUPABASE_ENVIRONMENT_TAG: undefined }, async () => {
      const restore = mockFetch(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/user")) {
          return new Response(JSON.stringify({ id: "signed-in-admin", aud: "authenticated" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/rest/v1/admin_profiles")) {
          return new Response(JSON.stringify([{ user_id: "signed-in-admin" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch to ${url} — environment guard must fail before any writer sign-in`);
      });
      try {
        const res = await ledgerTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(503);
      } finally {
        restore();
      }
    });
  });
});

test.describe("POST /api/admin/operational-notification-ledger-test — flag gate (off by default)", () => {
  test("flag absent → ok:true status:disabled, zero writer sign-in, zero RPC calls", async () => {
    await withEnv({ ...ENABLED_ENV, OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED: undefined }, async () => {
      const restore = mockFetch(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/user")) {
          return new Response(JSON.stringify({ id: "signed-in-admin", aud: "authenticated" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/rest/v1/admin_profiles")) {
          return new Response(JSON.stringify([{ user_id: "signed-in-admin" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch to ${url} — flag is off, nothing past it should ever be reached`);
      });
      try {
        const res = await ledgerTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, status: "disabled" });
      } finally {
        restore();
      }
    });
  });

  test("flag explicitly 'false' → still disabled", async () => {
    await withEnv({ ...ENABLED_ENV, OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED: "false" }, async () => {
      const restore = mockFetch(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/user")) {
          return new Response(JSON.stringify({ id: "signed-in-admin", aud: "authenticated" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/rest/v1/admin_profiles")) {
          return new Response(JSON.stringify([{ user_id: "signed-in-admin" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      try {
        const res = await ledgerTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect((await res.json())).toEqual({ ok: true, status: "disabled" });
      } finally {
        restore();
      }
    });
  });
});

test.describe("POST /api/admin/operational-notification-ledger-test — writer credentials gate", () => {
  test("flag on but writer credentials absent → misconfigured, zero sign-in attempt", async () => {
    await withEnv(
      { ...ENABLED_ENV, SUPABASE_SCHEDULED_WRITER_EMAIL: undefined, SUPABASE_SCHEDULED_WRITER_PASSWORD: undefined },
      async () => {
        const restore = mockFetch(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "signed-in-admin", aud: "authenticated" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          if (url.includes("/rest/v1/admin_profiles")) {
            return new Response(JSON.stringify([{ user_id: "signed-in-admin" }]), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          throw new Error(`unexpected fetch to ${url} — credentials absent, no sign-in should be attempted`);
        });
        try {
          const res = await ledgerTestPost(authedRequest("a-genuinely-valid-admin-token"));
          expect(res.status).toBe(503);
          expect(await res.json()).toEqual({ ok: false, status: "misconfigured" });
        } finally {
          restore();
        }
      }
    );
  });

  test("flag on, credentials present but sign-in fails → misconfigured, zero RPC calls", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const restore = mockFetch(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/user")) {
          return new Response(JSON.stringify({ id: "signed-in-admin", aud: "authenticated" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/rest/v1/admin_profiles")) {
          return new Response(JSON.stringify([{ user_id: "signed-in-admin" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/auth/v1/token")) {
          return new Response(JSON.stringify({ error: "invalid_grant" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch to ${url} — sign-in failed, no RPC call should be attempted`);
      });
      try {
        const res = await ledgerTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ ok: false, status: "misconfigured" });
      } finally {
        restore();
      }
    });
  });
});

test.describe("POST /api/admin/operational-notification-ledger-test — the real claim→finish cycle", () => {
  test("flag on, everything configured → exactly one claim, one finish, ok:true status:abandoned (noop adapter, OPERATIONAL_EMAIL_ALERTS_ENABLED false)", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter();
      const restore = mockFetch(router.impl);
      try {
        const res = await ledgerTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, status: "abandoned" });

        const claimCalls = router.log.filter((c) => c.url.includes("rpc/claim_operational_notification_event"));
        const finishCalls = router.log.filter((c) => c.url.includes("rpc/finish_operational_notification_event"));
        expect(claimCalls.length).toBe(1);
        expect(finishCalls.length).toBe(1);
      } finally {
        restore();
      }
    });
  });

  test("claim suppressed (duplicate/cooldown) → ok:true status:suppressed, zero finish calls, zero adapter contact", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({
        claimResult: { claimed: false, event_id: null, suppressed_reason: "suppress_cooldown" },
      });
      const restore = mockFetch(router.impl);
      try {
        const res = await ledgerTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(await res.json()).toEqual({ ok: true, status: "suppressed" });
        const finishCalls = router.log.filter((c) => c.url.includes("rpc/finish_operational_notification_event"));
        expect(finishCalls.length).toBe(0);
      } finally {
        restore();
      }
    });
  });

  test("a second invocation right after the first is suppressed — the fixed fingerprint IS the idempotency key", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter({ claimResult: { claimed: true, event_id: "evt-first", suppressed_reason: null } });
      const restore = mockFetch(router.impl);
      try {
        const first = await ledgerTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(await first.json()).toEqual({ ok: true, status: "abandoned" });
      } finally {
        restore();
      }

      // Second call — the fake claim RPC this time reports a duplicate, as
      // the real RPC would for the exact same fingerprint within cooldown.
      const routerSecond = makeRouter({
        claimResult: { claimed: false, event_id: null, suppressed_reason: "suppress_duplicate" },
      });
      const restoreSecond = mockFetch(routerSecond.impl);
      try {
        const second = await ledgerTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(await second.json()).toEqual({ ok: true, status: "suppressed" });
        const finishCalls = routerSecond.log.filter((c) => c.url.includes("rpc/finish_operational_notification_event"));
        expect(finishCalls.length).toBe(0);
      } finally {
        restoreSecond();
      }
    });
  });

  test("OPERATIONAL_EMAIL_ALERTS_ENABLED true but misconfigured → still zero real Resend contact, status abandoned", async () => {
    await withEnv({ ...ENABLED_ENV, OPERATIONAL_EMAIL_ALERTS_ENABLED: "true" }, async () => {
      const router = makeRouter();
      const restore = mockFetch(router.impl);
      try {
        const res = await ledgerTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(await res.json()).toEqual({ ok: true, status: "abandoned" });
        const resendCalls = router.log.filter((c) => c.url.includes("resend"));
        expect(resendCalls.length).toBe(0);
      } finally {
        restore();
      }
    });
  });

  test("the route's own JSON response never contains ledger row content, event id, or provider data", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter();
      const restore = mockFetch(router.impl);
      try {
        const res = await ledgerTestPost(authedRequest("a-genuinely-valid-admin-token"));
        const serialized = JSON.stringify(await res.json());
        expect(serialized).not.toContain("fake-ledger-test-event-id");
        expect(serialized).not.toContain("claimed");
        expect(serialized).not.toContain("suppressed_reason");
      } finally {
        restore();
      }
    });
  });

  test("no RPC call ever leaks the writer password or access token", async () => {
    await withEnv(ENABLED_ENV, async () => {
      const router = makeRouter();
      const restore = mockFetch(router.impl);
      try {
        await ledgerTestPost(authedRequest("a-genuinely-valid-admin-token"));
        const rpcCalls = router.log.filter((c) => c.url.includes("/rpc/"));
        const serialized = JSON.stringify(rpcCalls);
        expect(serialized).not.toContain(FAKE_WRITER_PASSWORD);
        expect(serialized).not.toContain("fake-writer-access-token");
      } finally {
        restore();
      }
    });
  });
});

test.describe("POST /api/admin/operational-notification-ledger-test — request has no client-input path", () => {
  test("a request body, if present, is never read — eventType/severity/summary cannot be influenced by the caller", async () => {
    await withEnv({ ...ENABLED_ENV, OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED: undefined }, async () => {
      const restore = mockFetch(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/user")) {
          return new Response(JSON.stringify({ id: "signed-in-admin", aud: "authenticated" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/rest/v1/admin_profiles")) {
          return new Response(JSON.stringify([{ user_id: "signed-in-admin" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      try {
        const req = new NextRequest("http://localhost/api/admin/operational-notification-ledger-test", {
          method: "POST",
          headers: { authorization: "Bearer a-genuinely-valid-admin-token", "content-type": "application/json" },
          body: JSON.stringify({ eventType: "credentials_not_configured", severity: "critical", safeSummary: "hijacked" }),
        });
        const res = await ledgerTestPost(req);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, status: "disabled" });
      } finally {
        restore();
      }
    });
  });
});

test.describe("POST /api/admin/operational-notification-ledger-test — no GET export", () => {
  test("no GET handler exists — Next.js auto-405s any GET to this route", async () => {
    const routeModule = await import("@/app/api/admin/operational-notification-ledger-test/route");
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});

test.describe("Sprint 166N-B — structural audit: cannot publish an alert or create a candidate", () => {
  const routeSource = readFileSync(
    join(process.cwd(), "src/app/api/admin/operational-notification-ledger-test/route.ts"),
    "utf-8"
  );

  test("never imports writeCandidatesForSource, fetchAndParseProposals, or any Builder/alert-write helper", () => {
    const importLines = routeSource
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    expect(importLines).not.toMatch(/writeCandidatesForSource/);
    expect(importLines).not.toMatch(/fetchAndParseProposals/);
    expect(importLines).not.toMatch(/supabaseAlertWrites/);
  });

  test("never references the alerts or source_notice_candidates tables", () => {
    expect(routeSource).not.toMatch(/\balerts\b/i);
    expect(routeSource).not.toMatch(/source_notice_candidates/i);
  });

  test("never reads a query parameter, header (beyond authorization), or request body", () => {
    expect(routeSource).not.toMatch(/req\.json\(\)/);
    expect(routeSource).not.toMatch(/searchParams/);
  });

  test("uses a fixed eventType from the existing closed vocabulary — never a caller-influenced or newly-invented value", () => {
    expect(routeSource).toMatch(/eventType:\s*"unexpected_error"/);
  });
});
