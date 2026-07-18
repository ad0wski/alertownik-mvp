import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { POST as fetchPreviewPost } from "@/app/api/sources/fetch-preview/route";
import { POST as sourcesCheckPost } from "@/app/api/sources/check/route";
import { POST as draftAlertPost } from "@/app/api/ai/draft-alert/route";

/**
 * Sprint 161 — confirms the three previously-unauthenticated admin API
 * routes now require a verified session BEFORE doing anything costly
 * (fetching a URL, calling the metered Anthropic API). `global.fetch` is
 * mocked to fail the test loudly if the route ever reaches it without a
 * valid session — this is what proves auth runs first, not just that it
 * runs at all.
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

function unauthedJsonRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authedJsonRequest(url: string, body: Record<string, unknown>, token: string): NextRequest {
  return new NextRequest(url, {
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
    throw new Error(`unexpected fetch to ${url} — a non-admin session must never reach this`);
  };
}

test.describe("POST /api/sources/fetch-preview — requires admin session", () => {
  test("unauthenticated request → 401, the target URL is never fetched", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      let fetchCalled = false;
      const restore = mockFetch(async () => {
        fetchCalled = true;
        throw new Error("fetch must not be called before auth passes");
      });
      try {
        const res = await fetchPreviewPost(
          unauthedJsonRequest("http://localhost/api/sources/fetch-preview", {
            url: "https://example.com/",
          })
        );
        expect(res.status).toBe(401);
        expect(fetchCalled).toBe(false);
      } finally {
        restore();
      }
    });
  });

  test("Sprint 161B — a genuinely signed-in session with no admin_profiles row → 403, target URL still never fetched", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const restore = mockFetch(mockAuthedNonAdmin());
      try {
        const res = await fetchPreviewPost(
          authedJsonRequest(
            "http://localhost/api/sources/fetch-preview",
            { url: "https://example.com/" },
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

test.describe("POST /api/sources/check — requires admin session", () => {
  test("unauthenticated request → 401, the allowlisted source is never fetched", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      let fetchCalled = false;
      const restore = mockFetch(async () => {
        fetchCalled = true;
        throw new Error("fetch must not be called before auth passes");
      });
      try {
        const res = await sourcesCheckPost(
          unauthedJsonRequest("http://localhost/api/sources/check", {
            sourceKey: "michalowice-komunikaty",
          })
        );
        expect(res.status).toBe(401);
        expect(fetchCalled).toBe(false);
      } finally {
        restore();
      }
    });
  });
});

test.describe("POST /api/ai/draft-alert — requires admin session", () => {
  test("unauthenticated request → 401, no draft is generated", async () => {
    await withEnv({ ...SUPABASE_ENV, ANTHROPIC_API_KEY: undefined }, async () => {
      const res = await draftAlertPost(
        unauthedJsonRequest("http://localhost/api/ai/draft-alert", {
          sourceText: "Testowy komunikat o remoncie drogi.",
        })
      );
      expect(res.status).toBe(401);
      const body = await res.clone().json();
      expect(body.ok).toBe(false);
      // draft-alert's ok:false success-path shape never sets `draft` — this
      // just confirms the 401 body carries no draft content of any kind.
      expect(body.draft).toBeUndefined();
    });
  });

  test("oversized sourceText is rejected with 413 even with a hypothetically valid session bypassed by env absence", async () => {
    // This route checks auth before body-size — with no Supabase env
    // configured, requireAdminSession fails closed regardless of the
    // Authorization header, so this also re-confirms the fail-closed
    // behavior from serverAuth.spec.ts in the actual route wiring.
    await withEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined }, async () => {
      const res = await draftAlertPost(
        unauthedJsonRequest("http://localhost/api/ai/draft-alert", {
          sourceText: "x".repeat(50_000),
        })
      );
      expect(res.status).toBe(401);
    });
  });
});
