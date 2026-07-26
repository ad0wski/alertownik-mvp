import { test, expect } from "@playwright/test";
import { fetchAndParseProposals } from "@/lib/scheduledSourceFetch";
import { parsePruszkowRestPosts } from "@/lib/sourceParsers/pageParser";

/**
 * Sprint 173 — REST-API-aware fetch branch of the scheduled writer's
 * source fetch layer. Before this sprint, scheduledSourceFetch.ts only
 * knew how to fetch a source's officialUrl as HTML — which meant a
 * scheduled run covering Wodociągi Michałowice or Pruszków aktualności
 * (Sprints 168/169) would have silently fetched the wrong thing every
 * single time, since both were deliberately built to be checked via their
 * WordPress REST API instead. Mirrors scheduledSourceFetchRetry.spec.ts's
 * shape exactly, but exercises an apiUrl target so the JSON branch runs.
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
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test.describe("fetchAndParseProposals — backward compatibility", () => {
  test("a plain string target still works exactly as before (HTML path, no apiUrl)", async () => {
    let callCount = 0;
    const HTML = `<html><body><main><article>Przerwa w dostawie wody w Komorowie od poniedziałku do środy, prosimy o zgromadzenie zapasów wody pitnej na czas prac.</article></main></body></html>`;
    const restore = mockFetch(async () => {
      callCount++;
      return new Response(HTML, { status: 200, headers: { "content-type": "text/html" } });
    });
    try {
      const result = await fetchAndParseProposals("https://example.test/komunikaty", 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(true);
    } finally {
      restore();
    }
  });
});

test.describe("fetchAndParseProposals — REST branch (apiUrl target)", () => {
  test("a single successful JSON fetch never retries and returns proposals", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return jsonResponse(SAMPLE_POSTS);
    });
    try {
      const result = await fetchAndParseProposals(TARGET, 1);
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
      const result = await fetchAndParseProposals(TARGET, 1);
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
      const result = await fetchAndParseProposals(TARGET, 1);
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
      const result = await fetchAndParseProposals(TARGET, 1);
      expect(callCount).toBe(2);
      expect(result.ok).toBe(true);
    } finally {
      restore();
    }
  });

  test("two consecutive transient failures retry exactly once, then report failure honestly", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return new Response("", { status: 503 });
    });
    try {
      const result = await fetchAndParseProposals(TARGET, 1);
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
      return jsonResponse(SAMPLE_POSTS);
    });
    try {
      const result = await fetchAndParseProposals(TARGET, 1);
      expect(callCount).toBe(2);
      expect(result.ok).toBe(true);
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
      const result = await fetchAndParseProposals(TARGET, 1);
      expect(callCount).toBe(2);
      expect(result.ok).toBe(true);
    } finally {
      restore();
    }
  });

  test("malformed JSON body never retries and fails closed", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return new Response("<html>not json</html>", { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const result = await fetchAndParseProposals(TARGET, 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostic).toBe("parse_exception");
    } finally {
      restore();
    }
  });

  test("a JSON response that isn't an array never retries and fails closed", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return jsonResponse({ error: "unexpected shape" });
    });
    try {
      const result = await fetchAndParseProposals(TARGET, 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostic).toBe("parse_exception");
    } finally {
      restore();
    }
  });

  test("uses the caller-supplied parseRestPosts (e.g. Pruszków's own filter), not just the default", async () => {
    const restore = mockFetch(async () =>
      jsonResponse([
        {
          title: { rendered: "Utrudnienia w ruchu na ul. Bryły" },
          excerpt: {
            rendered:
              "<p>W dniach 23-29 lipca 2026 roku na ul. Bryły w Pruszkowie wystąpią utrudnienia w ruchu związane z budową zatok postojowych.</p>",
          },
        },
      ])
    );
    try {
      const result = await fetchAndParseProposals(
        { officialUrl: "x", apiUrl: "https://www.pruszkow.pl/wp-json/wp/v2/posts", parseRestPosts: parsePruszkowRestPosts },
        1
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.proposals.length).toBe(1);
    } finally {
      restore();
    }
  });
});
