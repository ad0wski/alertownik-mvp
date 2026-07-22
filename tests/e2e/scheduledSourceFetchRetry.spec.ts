import { test, expect } from "@playwright/test";
import { fetchAndParseProposals } from "@/lib/scheduledSourceFetch";

/**
 * Sprint 166C — bounded retry behavior for the scheduled-writer's
 * source-page fetch. Uses a fast, near-zero delay override (this
 * function's second parameter) instead of the real RETRY_DELAY_MS so the
 * suite stays fast — the delay VALUE itself is covered separately in
 * scheduledWriterRunSafety.spec.ts (MAX_FETCH_ATTEMPTS/RETRY_DELAY_MS
 * constants) and is not what these tests are checking.
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

test.describe("fetchAndParseProposals — retry only on transient failure", () => {
  test("a single successful attempt never retries (exactly one fetch call)", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return htmlResponse();
    });
    try {
      const result = await fetchAndParseProposals(SAMPLE_URL, 1);
      expect(result.ok).toBe(true);
      expect(callCount).toBe(1);
    } finally {
      restore();
    }
  });

  test("a permanent failure (404) never retries (exactly one fetch call)", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return new Response("not found", { status: 404 });
    });
    try {
      const result = await fetchAndParseProposals(SAMPLE_URL, 1);
      expect(result.ok).toBe(false);
      expect(callCount).toBe(1);
      if (!result.ok) expect(result.diagnostic).toBe("http_4xx");
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
      const result = await fetchAndParseProposals(SAMPLE_URL, 1);
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
      const result = await fetchAndParseProposals(SAMPLE_URL, 1);
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
      const result = await fetchAndParseProposals(SAMPLE_URL, 1);
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
      const result = await fetchAndParseProposals(SAMPLE_URL, 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostic).toBe("non_html_content_type");
    } finally {
      restore();
    }
  });
});
