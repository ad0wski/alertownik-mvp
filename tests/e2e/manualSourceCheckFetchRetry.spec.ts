import { test, expect } from "@playwright/test";
import { fetchAndParseManualCheck } from "@/lib/manualSourceCheckFetch";

/**
 * Sprint 167 — bounded retry behavior for the admin's manual
 * "Sprawdź teraz przez aplikację" check. Mirrors
 * scheduledSourceFetchRetry.spec.ts exactly (same policy, same test
 * shape) — see that file's own header for why a fast delay override is
 * used instead of the real RETRY_DELAY_MS.
 */

function mockFetch(impl: typeof fetch) {
  const original = global.fetch;
  global.fetch = impl;
  return () => {
    global.fetch = original;
  };
}

const SAMPLE_URL = "https://example.test/komunikaty";
const HTML = `<html><body><main><article>Przerwa w dostawie wody w Komorowie od poniedziałku do środy, prosimy o zgromadzenie zapasów wody pitnej na czas prac.</article></main></body></html>`;

function htmlResponse() {
  return new Response(HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

test.describe("fetchAndParseManualCheck — retry only on transient failure", () => {
  test("a single successful attempt never retries (exactly one fetch call)", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return htmlResponse();
    });
    try {
      const result = await fetchAndParseManualCheck(SAMPLE_URL, 1);
      expect(result.ok).toBe(true);
      expect(callCount).toBe(1);
    } finally {
      restore();
    }
  });

  test("a permanent failure (404) never retries and keeps the existing admin-facing message", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return new Response("not found", { status: 404 });
    });
    try {
      const result = await fetchAndParseManualCheck(SAMPLE_URL, 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic).toBe("http_4xx");
        expect(result.message).toContain("404");
      }
    } finally {
      restore();
    }
  });

  test("a bot-block (403) never retries and keeps the existing explanatory message", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return new Response("forbidden", { status: 403 });
    });
    try {
      const result = await fetchAndParseManualCheck(SAMPLE_URL, 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic).toBe("http_4xx");
        expect(result.message).toContain("zablokowała");
      }
    } finally {
      restore();
    }
  });

  test("a transient failure (500) followed by success retries exactly once and succeeds", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      if (callCount === 1) return new Response("oops", { status: 503 });
      return htmlResponse();
    });
    try {
      const result = await fetchAndParseManualCheck(SAMPLE_URL, 1);
      expect(callCount).toBe(2);
      expect(result.ok).toBe(true);
    } finally {
      restore();
    }
  });

  test("two consecutive transient failures (500, 500) retry exactly once, then report failure honestly (never a third attempt)", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return new Response("oops", { status: 503 });
    });
    try {
      const result = await fetchAndParseManualCheck(SAMPLE_URL, 1);
      expect(callCount).toBe(2);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostic).toBe("http_5xx");
    } finally {
      restore();
    }
  });

  test("a network error (fetch throws) is classified transient and retried once", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      if (callCount === 1) throw new Error("ECONNRESET");
      return htmlResponse();
    });
    try {
      const result = await fetchAndParseManualCheck(SAMPLE_URL, 1);
      expect(callCount).toBe(2);
      expect(result.ok).toBe(true);
    } finally {
      restore();
    }
  });

  test("a non-HTML content type never retries (permanent, structural failure)", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const result = await fetchAndParseManualCheck(SAMPLE_URL, 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostic).toBe("non_html_content_type");
    } finally {
      restore();
    }
  });

  test("a timeout (AbortError) is classified transient and retried once", async () => {
    let callCount = 0;
    // Simulates the exact exception shape the real 10s timeout handler
    // produces (AbortController firing controller.abort()) without
    // actually waiting 10 seconds in the test.
    const restore = mockFetch(async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      return htmlResponse();
    });
    try {
      const result = await fetchAndParseManualCheck(SAMPLE_URL, 1);
      expect(callCount).toBe(2);
      expect(result.ok).toBe(true);
    } finally {
      restore();
    }
  });
});
