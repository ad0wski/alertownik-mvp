import { test, expect } from "@playwright/test";
import { fetchAndParseManualCheck } from "@/lib/manualSourceCheckFetch";

/**
 * Sprint 168 — bounded retry + failure-mode coverage for the manual
 * check's WordPress REST API fetch branch (wodociagimichalowice.pl).
 * Mirrors manualSourceCheckFetchRetry.spec.ts's shape exactly, but
 * exercises the `apiUrl` target so the JSON branch (attemptWordpressRestFetch)
 * runs instead of the HTML branch.
 */

function mockFetch(impl: typeof fetch) {
  const original = global.fetch;
  global.fetch = impl;
  return () => {
    global.fetch = original;
  };
}

const TARGET = {
  officialUrl: "https://wodociagimichalowice.pl/category/aktualnosci/",
  apiUrl: "https://wodociagimichalowice.pl/wp-json/wp/v2/posts?categories=1&per_page=6",
};

const SAMPLE_POSTS = [
  {
    title: { rendered: "Przerwa w dostawie wody" },
    excerpt: {
      rendered:
        "<p>Przerwa w dostawie wody w Komorowie z powodu awarii sieci wodociągowej, prosimy o cierpliwość.</p>",
    },
    date: "2026-07-21T09:00:00",
    link: "https://wodociagimichalowice.pl/2026/07/21/przerwa/",
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test.describe("fetchAndParseManualCheck — WordPress REST branch (apiUrl target)", () => {
  test("a single successful JSON fetch never retries and returns proposals", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return jsonResponse(SAMPLE_POSTS);
    });
    try {
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.proposals.length).toBe(1);
    } finally {
      restore();
    }
  });

  test("an empty posts array is a clean success with zero proposals, not a failure", async () => {
    const restore = mockFetch(async () => jsonResponse([]));
    try {
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.proposals.length).toBe(0);
    } finally {
      restore();
    }
  });

  test("a permanent failure (404) never retries", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return new Response("not found", { status: 404 });
    });
    try {
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostic).toBe("http_4xx");
    } finally {
      restore();
    }
  });

  test("a transient failure (503) followed by success retries exactly once", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      if (callCount === 1) return new Response("oops", { status: 503 });
      return jsonResponse(SAMPLE_POSTS);
    });
    try {
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(callCount).toBe(2);
      expect(result.ok).toBe(true);
    } finally {
      restore();
    }
  });

  test("a network error (fetch throws) is classified transient and retried once", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      if (callCount === 1) throw new Error("ECONNRESET");
      return jsonResponse(SAMPLE_POSTS);
    });
    try {
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(callCount).toBe(2);
      expect(result.ok).toBe(true);
    } finally {
      restore();
    }
  });

  test("malformed JSON body never retries and reports a Polish, admin-facing message", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return new Response("<html>not json</html>", { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic).toBe("parse_exception");
        expect(result.message.length).toBeGreaterThan(0);
      }
    } finally {
      restore();
    }
  });

  test("a JSON response that isn't an array (unexpected shape) never retries and fails closed", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return jsonResponse({ error: "unexpected plugin response shape" });
    });
    try {
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostic).toBe("parse_exception");
    } finally {
      restore();
    }
  });

  test("a timeout (AbortError) is classified transient and retried once", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      return jsonResponse(SAMPLE_POSTS);
    });
    try {
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(callCount).toBe(2);
      expect(result.ok).toBe(true);
    } finally {
      restore();
    }
  });

  test("a non-critical field change on individual posts (extra/renamed plugin fields) never breaks the fetch", async () => {
    const restore = mockFetch(async () =>
      jsonResponse([
        {
          ...SAMPLE_POSTS[0],
          yoast_head: "<html>...</html>",
          _links: { self: [{ href: "https://wodociagimichalowice.pl/wp-json/wp/v2/posts/1" }] },
        },
      ])
    );
    try {
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.proposals.length).toBe(1);
    } finally {
      restore();
    }
  });
});
