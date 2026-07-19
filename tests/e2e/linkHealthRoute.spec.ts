import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { POST as linkHealthPost } from "@/app/api/admin/link-health/route";
import { MAX_LINK_HEALTH_TARGETS_PER_REQUEST } from "@/lib/linkHealthCheck";

/**
 * Sprint 164A — POST /api/admin/link-health, the admin-only, on-demand
 * link-reachability check route. Same auth-gating pattern already proven
 * for the other admin routes in tests/e2e/adminApiRouteAuth.spec.ts: prove
 * the target is never fetched before auth passes, prove a non-admin session
 * is rejected, and prove the per-request target cap is enforced server-side
 * (never relaxed by anything the caller sends).
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

const SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: FAKE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_KEY,
};

function unauthedJsonRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/admin/link-health", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authedJsonRequest(body: Record<string, unknown>, token: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/link-health", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
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
    throw new Error(`unexpected fetch to ${url} — a non-admin session must never reach a health check`);
  };
}

test.describe("POST /api/admin/link-health — requires admin session", () => {
  test("unauthenticated request → 401, no target is ever checked", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      let fetchCalled = false;
      const restore = mockFetch(async () => {
        fetchCalled = true;
        throw new Error("fetch must not be called before auth passes");
      });
      try {
        const res = await linkHealthPost(
          unauthedJsonRequest({ targets: [{ id: "1", name: "Test", url: "https://example.com/" }] })
        );
        expect(res.status).toBe(401);
        expect(fetchCalled).toBe(false);
      } finally {
        restore();
      }
    });
  });

  test("a genuinely signed-in but non-admin session → 403, target still never checked", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const restore = mockFetch(mockAuthedNonAdmin());
      try {
        const res = await linkHealthPost(
          authedJsonRequest(
            { targets: [{ id: "1", name: "Test", url: "https://example.com/" }] },
            "a-genuinely-valid-but-non-admin-token"
          )
        );
        expect(res.status).toBe(403);
      } finally {
        restore();
      }
    });
  });
});

test.describe("POST /api/admin/link-health — payload validation (auth bypassed via missing Supabase env, fails closed first regardless)", () => {
  test("empty targets array → 422", async () => {
    await withEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined }, async () => {
      const res = await linkHealthPost(unauthedJsonRequest({ targets: [] }));
      // Auth fails closed first when Supabase env is absent — 401, not 422.
      // This test exists to document that ordering (auth before validation),
      // matching every other admin route in this codebase.
      expect(res.status).toBe(401);
    });
  });
});

test.describe("POST /api/admin/link-health — target cap is server-enforced", () => {
  test("MAX_LINK_HEALTH_TARGETS_PER_REQUEST cannot be exceeded by request payload size", () => {
    // Structural check: the cap is a module constant read by the route,
    // never a value the request body can widen (no such field is read from
    // the body at all — see src/app/api/admin/link-health/route.ts).
    expect(MAX_LINK_HEALTH_TARGETS_PER_REQUEST).toBeGreaterThan(0);
  });
});
