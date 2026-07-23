import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { POST as operationalEmailTestPost } from "@/app/api/admin/operational-email-test/route";

/**
 * Sprint 166E-2A — POST /api/admin/operational-email-test. Every test in
 * this file that reaches the "would actually call Resend" branch mocks
 * global.fetch to intercept BOTH the Supabase auth calls (same convention
 * as automationStatus.spec.ts / linkHealthRoute.spec.ts) AND any request to
 * api.resend.com — the real `Resend` client the route constructs uses
 * fetch() internally, so intercepting fetch is sufficient to guarantee zero
 * real network requests ever leave this test file, without needing the
 * route itself to accept an injected client. No test sets
 * OPERATIONAL_EMAIL_ALERTS_ENABLED to "true" against the real environment —
 * every env var here is a fake, test-local value restored after each test.
 */

const FAKE_URL = "https://fake-test-project.supabase.co";
const FAKE_KEY = "fake-test-anon-key-not-a-real-value";

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

const BASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: FAKE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_KEY,
  OPERATIONAL_EMAIL_ALERTS_ENABLED: undefined,
  RESEND_API_KEY: undefined,
  OPERATIONAL_ALERT_EMAIL_FROM: undefined,
  OPERATIONAL_ALERT_EMAIL_TO: undefined,
  VERCEL_ENV: undefined,
  VERCEL_GIT_COMMIT_SHA: undefined,
};

const FULL_RESEND_ENV = {
  OPERATIONAL_EMAIL_ALERTS_ENABLED: "true",
  RESEND_API_KEY: "re_test_fake_key_should_never_leak",
  OPERATIONAL_ALERT_EMAIL_FROM: "alerts-from@example-should-not-appear.test",
  OPERATIONAL_ALERT_EMAIL_TO: "admin-to@example-should-not-appear.test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_SHA: "abc123fakecommitshanotreal",
};

function unauthedRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/operational-email-test", { method: "POST" });
}

function authedRequest(token: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/operational-email-test", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

function mockAuthedAdmin(extra?: (url: string) => Response | null) {
  return async (input: RequestInfo | URL) => {
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
    if (extra) {
      const extraResponse = extra(url);
      if (extraResponse) return extraResponse;
    }
    throw new Error(`unexpected fetch to ${url} — this test does not expect any further request`);
  };
}

function mockAuthedNonAdmin() {
  return async (input: RequestInfo | URL) => {
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
  };
}

test.describe("POST /api/admin/operational-email-test — auth gate", () => {
  test("1. unauthenticated request → 401, no Resend call attempted", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV }, async () => {
      const res = await operationalEmailTestPost(unauthedRequest());
      expect(res.status).toBe(401);
    });
  });

  test("2. genuinely signed-in but non-admin session → 403", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV }, async () => {
      const restore = mockFetch(mockAuthedNonAdmin());
      try {
        const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-but-non-admin-token"));
        expect(res.status).toBe(403);
      } finally {
        restore();
      }
    });
  });
});

test.describe("POST /api/admin/operational-email-test — environment gate", () => {
  test("3. VERCEL_ENV=production → 403, never reaches the flag/config check", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV, VERCEL_ENV: "production" }, async () => {
      const restore = mockFetch(mockAuthedAdmin());
      try {
        const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.ok).toBe(false);
      } finally {
        restore();
      }
    });
  });

  test("4. VERCEL_ENV=development → 403", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV, VERCEL_ENV: "development" }, async () => {
      const restore = mockFetch(mockAuthedAdmin());
      try {
        const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(403);
      } finally {
        restore();
      }
    });
  });

  test("5. VERCEL_ENV unset (unknown) → 403", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV, VERCEL_ENV: undefined }, async () => {
      const restore = mockFetch(mockAuthedAdmin());
      try {
        const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(403);
      } finally {
        restore();
      }
    });
  });
});

test.describe("POST /api/admin/operational-email-test — Preview, flag/config gates (zero Resend calls)", () => {
  test("6. Preview + flag false → ok:true status:disabled, zero further fetches", async () => {
    await withEnv(
      { ...BASE_ENV, ...FULL_RESEND_ENV, OPERATIONAL_EMAIL_ALERTS_ENABLED: undefined },
      async () => {
        const restore = mockFetch(mockAuthedAdmin());
        try {
          const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
          expect(res.status).toBe(200);
          const body = await res.json();
          expect(body).toEqual({ ok: true, status: "disabled" });
        } finally {
          restore();
        }
      }
    );
  });

  test("7. Preview + enabled but missing API key → misconfigured, zero further fetches", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV, RESEND_API_KEY: undefined }, async () => {
      const restore = mockFetch(mockAuthedAdmin());
      try {
        const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body).toEqual({ ok: false, status: "misconfigured" });
      } finally {
        restore();
      }
    });
  });

  test("8. Preview + enabled but missing sender → misconfigured", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV, OPERATIONAL_ALERT_EMAIL_FROM: undefined }, async () => {
      const restore = mockFetch(mockAuthedAdmin());
      try {
        const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect((await res.json()).status).toBe("misconfigured");
      } finally {
        restore();
      }
    });
  });

  test("9. Preview + enabled but missing recipient → misconfigured", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV, OPERATIONAL_ALERT_EMAIL_TO: undefined }, async () => {
      const restore = mockFetch(mockAuthedAdmin());
      try {
        const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect((await res.json()).status).toBe("misconfigured");
      } finally {
        restore();
      }
    });
  });

  test("10. Preview + fully configured but missing VERCEL_GIT_COMMIT_SHA → misconfigured, fail-closed, zero Resend calls", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV, VERCEL_GIT_COMMIT_SHA: undefined }, async () => {
      const restore = mockFetch(mockAuthedAdmin());
      try {
        const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(503);
        expect((await res.json()).status).toBe("misconfigured");
      } finally {
        restore();
      }
    });
  });
});

test.describe("POST /api/admin/operational-email-test — Preview, fully configured (mocked Resend call)", () => {
  test("11. successful mocked Resend call → ok:true status:sent, exactly one call to api.resend.com", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV }, async () => {
      let resendCallCount = 0;
      let capturedIdempotencyKey: string | null = null;
      let capturedBody: Record<string, unknown> | null = null;
      const restoreFull = mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
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
        if (url.includes("api.resend.com")) {
          resendCallCount += 1;
          capturedIdempotencyKey = init?.headers ? new Headers(init.headers).get("Idempotency-Key") : null;
          capturedBody = init?.body ? JSON.parse(init.body as string) : null;
          return new Response(JSON.stringify({ id: "fake-resend-id" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      try {
        const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, status: "sent" });
        expect(resendCallCount).toBe(1);
        expect(capturedIdempotencyKey).toBe(`alertownik-preview-operational-email-test/${FULL_RESEND_ENV.VERCEL_GIT_COMMIT_SHA}`);
        expect(capturedBody).not.toBeNull();
        expect((capturedBody as unknown as { from: string }).from).toBe(FULL_RESEND_ENV.OPERATIONAL_ALERT_EMAIL_FROM);
        expect((capturedBody as unknown as { to: string }).to).toBe(FULL_RESEND_ENV.OPERATIONAL_ALERT_EMAIL_TO);
      } finally {
        restoreFull();
      }
    });
  });

  test("12. Resend auth error (401) → ok:false status:provider_auth_error, no raw message leaked", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV }, async () => {
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
        if (url.includes("api.resend.com")) {
          return new Response(
            JSON.stringify({ statusCode: 401, name: "invalid_api_key", message: "API key is invalid." }),
            { status: 401, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      try {
        const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body).toEqual({ ok: false, status: "provider_auth_error" });
        expect(JSON.stringify(body)).not.toContain("API key is invalid");
      } finally {
        restore();
      }
    });
  });

  test("13. Resend 429 rate limit → ok:false status:provider_rate_limited", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV }, async () => {
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
        if (url.includes("api.resend.com")) {
          return new Response(
            JSON.stringify({ statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests." }),
            { status: 429, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      try {
        const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(502);
        expect((await res.json()).status).toBe("provider_rate_limited");
      } finally {
        restore();
      }
    });
  });

  test("14. Resend 500 → ok:false status:provider_transient_error", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV }, async () => {
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
        if (url.includes("api.resend.com")) {
          return new Response(
            JSON.stringify({ statusCode: 500, name: "internal_server_error", message: "Something broke." }),
            { status: 500, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      try {
        const res = await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(res.status).toBe(502);
        expect((await res.json()).status).toBe("provider_transient_error");
      } finally {
        restore();
      }
    });
  });

  test("15. same commit SHA → same idempotency key across two separate calls", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV }, async () => {
      const keys: (string | null)[] = [];
      const restore = mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
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
        if (url.includes("api.resend.com")) {
          keys.push(init?.headers ? new Headers(init.headers).get("Idempotency-Key") : null);
          return new Response(JSON.stringify({ id: "fake-resend-id" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      try {
        await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        expect(keys.length).toBe(2);
        expect(keys[0]).toBe(keys[1]);
        expect(keys[0]).not.toBeNull();
      } finally {
        restore();
      }
    });
  });

  test("16. different commit SHA → different idempotency key", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV, VERCEL_GIT_COMMIT_SHA: "commit-one" }, async () => {
      let keyOne: string | null = null;
      const restoreOne = mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/user")) {
          return new Response(JSON.stringify({ id: "signed-in-admin", aud: "authenticated" }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/rest/v1/admin_profiles")) {
          return new Response(JSON.stringify([{ user_id: "signed-in-admin" }]), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("api.resend.com")) {
          keyOne = init?.headers ? new Headers(init.headers).get("Idempotency-Key") : null;
          return new Response(JSON.stringify({ id: "fake-resend-id" }), { status: 200, headers: { "content-type": "application/json" } });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
      restoreOne();

      await withEnv({ VERCEL_GIT_COMMIT_SHA: "commit-two" }, async () => {
        let keyTwo: string | null = null;
        const restoreTwo = mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "signed-in-admin", aud: "authenticated" }), { status: 200, headers: { "content-type": "application/json" } });
          }
          if (url.includes("/rest/v1/admin_profiles")) {
            return new Response(JSON.stringify([{ user_id: "signed-in-admin" }]), { status: 200, headers: { "content-type": "application/json" } });
          }
          if (url.includes("api.resend.com")) {
            keyTwo = init?.headers ? new Headers(init.headers).get("Idempotency-Key") : null;
            return new Response(JSON.stringify({ id: "fake-resend-id" }), { status: 200, headers: { "content-type": "application/json" } });
          }
          throw new Error(`unexpected fetch to ${url}`);
        });
        try {
          await operationalEmailTestPost(authedRequest("a-genuinely-valid-admin-token"));
        } finally {
          restoreTwo();
        }
        expect(keyOne).not.toBe(keyTwo);
        expect(keyOne).not.toBeNull();
        expect(keyTwo).not.toBeNull();
      });
    });
  });
});

test.describe("POST /api/admin/operational-email-test — request has no client-input path", () => {
  test("17. a request body, if present, is never read — recipient/sender/subject cannot be influenced by the caller", async () => {
    await withEnv({ ...BASE_ENV, ...FULL_RESEND_ENV, OPERATIONAL_EMAIL_ALERTS_ENABLED: undefined }, async () => {
      const restore = mockFetch(mockAuthedAdmin());
      try {
        const req = new NextRequest("http://localhost/api/admin/operational-email-test", {
          method: "POST",
          headers: { authorization: "Bearer a-genuinely-valid-admin-token", "content-type": "application/json" },
          body: JSON.stringify({ to: "attacker@example.test", from: "attacker@example.test", subject: "hijacked" }),
        });
        const res = await operationalEmailTestPost(req);
        // Flag is off in this test — this only proves the route tolerates
        // (and structurally ignores) an arbitrary body without erroring or
        // branching on it; see route source: it never calls req.json().
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, status: "disabled" });
      } finally {
        restore();
      }
    });
  });
});

test.describe("POST /api/admin/operational-email-test — no GET export", () => {
  test("18. no GET handler exists — Next.js auto-405s any GET to this route", async () => {
    const routeModule = await import("@/app/api/admin/operational-email-test/route");
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});
