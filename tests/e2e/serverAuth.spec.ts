import { test, expect } from "@playwright/test";
import { requireAdminSession } from "@/lib/serverAuth";

/**
 * Sprint 161 / 161B — tests for the shared server-side admin-session check
 * used by /api/sources/fetch-preview, /api/sources/check, and
 * /api/ai/draft-alert.
 *
 * `global.fetch` is mocked to stand in for both Supabase's Auth server
 * (GoTrue, `/auth/v1/user`) and PostgREST's `admin_profiles` endpoint
 * (`/rest/v1/admin_profiles`) — no real network call, no real Supabase
 * project involved. `NEXT_PUBLIC_*` env vars use fake test-only values,
 * restored after every test.
 *
 * Sprint 161B's central point: authentication (a genuine token) is NOT the
 * same thing as authorization (that account being an admin) — this project
 * has more than one Supabase Auth account. Every "valid session" test below
 * mocks BOTH endpoints so a passing test proves the admin_profiles check
 * actually ran, not just that the token was valid.
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

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/sources/fetch-preview", {
    method: "POST",
    headers,
  });
}

const SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: FAKE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_KEY,
};

test.describe("requireAdminSession — no Supabase configured", () => {
  test("missing NEXT_PUBLIC_SUPABASE_URL/KEY fails closed with 401, never calls fetch", async () => {
    await withEnv(
      { NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined },
      async () => {
        let fetchCalled = false;
        const restore = mockFetch(async () => {
          fetchCalled = true;
          throw new Error("fetch must not be called");
        });
        try {
          const result = await requireAdminSession(
            makeRequest({ authorization: "Bearer some-token" })
          );
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.response.status).toBe(401);
          expect(fetchCalled).toBe(false);
        } finally {
          restore();
        }
      }
    );
  });
});

test.describe("requireAdminSession — missing/malformed Authorization header", () => {
  test("no Authorization header at all → 401, fetch never called", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      let fetchCalled = false;
      const restore = mockFetch(async () => {
        fetchCalled = true;
        throw new Error("fetch must not be called");
      });
      try {
        const result = await requireAdminSession(makeRequest());
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.response.status).toBe(401);
        expect(fetchCalled).toBe(false);
      } finally {
        restore();
      }
    });
  });

  test("Authorization header without 'Bearer ' prefix → 401, fetch never called", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      let fetchCalled = false;
      const restore = mockFetch(async () => {
        fetchCalled = true;
        throw new Error("fetch must not be called");
      });
      try {
        const result = await requireAdminSession(makeRequest({ authorization: "some-token" }));
        expect(result.ok).toBe(false);
        expect(fetchCalled).toBe(false);
      } finally {
        restore();
      }
    });
  });

  test("empty Bearer token → 401, fetch never called", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      let fetchCalled = false;
      const restore = mockFetch(async () => {
        fetchCalled = true;
        throw new Error("fetch must not be called");
      });
      try {
        const result = await requireAdminSession(makeRequest({ authorization: "Bearer   " }));
        expect(result.ok).toBe(false);
        expect(fetchCalled).toBe(false);
      } finally {
        restore();
      }
    });
  });
});

test.describe("requireAdminSession — Supabase rejects the token", () => {
  test("invalid/expired token (Auth server returns 401) → requireAdminSession returns 401", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const restore = mockFetch(async () =>
        new Response(JSON.stringify({ error: "invalid_token", error_description: "bad token" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
      );
      try {
        const result = await requireAdminSession(
          makeRequest({ authorization: "Bearer not-a-real-token" })
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.response.status).toBe(401);
      } finally {
        restore();
      }
    });
  });

  test("Auth server unreachable → fails closed with 401, not a 500 or a thrown error", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const restore = mockFetch(async () => {
        throw new Error("network unreachable");
      });
      try {
        const result = await requireAdminSession(
          makeRequest({ authorization: "Bearer some-token" })
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.response.status).toBe(401);
      } finally {
        restore();
      }
    });
  });
});

function mockAuthUser(id: string) {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({ id, aud: "authenticated", email: "someone@example.com" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    throw new Error(`unexpected fetch to ${url}`);
  };
}

test.describe("requireAdminSession — authenticated but NOT an admin (Sprint 161B)", () => {
  test("valid token, no admin_profiles row → 403, not 401 (token was genuinely valid)", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      let profilesQueried = false;
      const restore = mockFetch(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({ id: "signed-in-non-admin", aud: "authenticated", email: "someone@example.com" }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.includes("/rest/v1/admin_profiles")) {
          profilesQueried = true;
          // PostgREST returns an empty array, not a 404, for zero matches.
          return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      try {
        const result = await requireAdminSession(
          makeRequest({ authorization: "Bearer a-valid-non-admin-token" })
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.response.status).toBe(403);
        expect(profilesQueried).toBe(true);
      } finally {
        restore();
      }
    });
  });

  test("the admin_profiles query runs with the caller's own token, not an unauthenticated request", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      let sawAuthHeaderOnProfilesQuery = false;
      const restore = mockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({ id: "some-user-id", aud: "authenticated" }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.includes("/rest/v1/admin_profiles")) {
          const headers = new Headers(init?.headers);
          const authHeader = headers.get("authorization") ?? "";
          sawAuthHeaderOnProfilesQuery = authHeader.includes("a-specific-token-value");
          return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      try {
        await requireAdminSession(makeRequest({ authorization: "Bearer a-specific-token-value" }));
        expect(sawAuthHeaderOnProfilesQuery).toBe(true);
      } finally {
        restore();
      }
    });
  });
});

test.describe("requireAdminSession — valid session AND an admin (PASS)", () => {
  test("Auth server confirms the user, admin_profiles has a matching row → ok:true with the user id", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const restore = mockFetch(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({ id: "fake-admin-user-id", aud: "authenticated", email: "admin@example.com" }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.includes("/rest/v1/admin_profiles")) {
          return new Response(JSON.stringify([{ user_id: "fake-admin-user-id" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      try {
        const result = await requireAdminSession(
          makeRequest({ authorization: "Bearer a-valid-admin-token" })
        );
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.userId).toBe("fake-admin-user-id");
      } finally {
        restore();
      }
    });
  });
});

test.describe("response safety — anti-drift", () => {
  test("unauthorized responses never distinguish failure reasons in their body", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const restore = mockFetch(async () => {
        throw new Error("fetch must not be called for a missing header");
      });
      try {
        const result = await requireAdminSession(makeRequest());
        expect(result.ok).toBe(false);
        if (!result.ok) {
          const body = await result.response.clone().json();
          const text = JSON.stringify(body).toLowerCase();
          for (const leak of ["token", "jwt", "cookie", "supabase.co", "expired"]) {
            expect(text).not.toContain(leak);
          }
        }
      } finally {
        restore();
      }
    });
  });
});
