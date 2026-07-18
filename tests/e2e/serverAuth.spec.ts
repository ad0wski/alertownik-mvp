import { test, expect } from "@playwright/test";
import { requireAdminSession } from "@/lib/serverAuth";

/**
 * Sprint 161 — tests for the shared server-side admin-session check used by
 * /api/sources/fetch-preview, /api/sources/check, and /api/ai/draft-alert.
 *
 * `global.fetch` is mocked to stand in for Supabase's Auth server (GoTrue) —
 * no real network call, no real Supabase project involved. `NEXT_PUBLIC_*`
 * env vars use fake test-only values, restored after every test.
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

test.describe("requireAdminSession — valid session", () => {
  test("Auth server confirms the user → returns ok:true with the user id", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const restore = mockFetch(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({ id: "fake-admin-user-id", aud: "authenticated", email: "admin@example.com" }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected fetch to ${url}`);
      });
      try {
        const result = await requireAdminSession(
          makeRequest({ authorization: "Bearer a-valid-looking-token" })
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
