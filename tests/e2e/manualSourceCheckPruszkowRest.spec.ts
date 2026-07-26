import { test, expect } from "@playwright/test";
import { fetchAndParseManualCheck } from "@/lib/manualSourceCheckFetch";
import { parsePruszkowRestPosts } from "@/lib/sourceParsers/pageParser";

/**
 * Sprint 169 — bounded retry + failure-mode coverage for the manual
 * check's WordPress REST API fetch branch when targeting pruszkow.pl,
 * i.e. with an explicit parseRestPosts override (mirrors
 * manualSourceCheckWordpressRest.spec.ts from Sprint 168, which covers the
 * default/Wodociągi branch — this file exists to prove the dispatcher
 * actually wires a different source's parser through end to end, not just
 * that parsePruszkowRestPosts works in isolation).
 */

function mockFetch(impl: typeof fetch) {
  const original = global.fetch;
  global.fetch = impl;
  return () => {
    global.fetch = original;
  };
}

const TARGET = {
  officialUrl: "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/",
  apiUrl: "https://www.pruszkow.pl/wp-json/wp/v2/posts?categories=371&per_page=6",
  parseRestPosts: parsePruszkowRestPosts,
};

const OPERATIONAL_POST = {
  title: { rendered: "Zmiana organizacji ruchu na drodze wojewódzkiej nr 719" },
  excerpt: {
    rendered:
      "<p>Od 28 lipca 2026 roku na drodze wojewódzkiej nr 719 w Pruszkowie wprowadzona zostanie " +
      "tymczasowa zmiana organizacji ruchu związana z pracami budowlanymi.</p>",
  },
  date: "2026-07-23T09:31:12",
  link: "https://www.pruszkow.pl/2026/07/23/zmiana-organizacji-ruchu/",
};

const OFF_TOPIC_POST = {
  title: { rendered: "Kręciołek szuka jedynego domu i człowieka, któremu zaufa" },
  excerpt: { rendered: "<p>Schronisko dla zwierząt poszukuje domu dla psa o imieniu Kręciołek.</p>" },
  date: "2026-07-21T12:31:34",
  link: "https://www.pruszkow.pl/2026/07/21/kreciolek/",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test.describe("fetchAndParseManualCheck — Pruszków REST branch (explicit parseRestPosts override)", () => {
  test("the Pruszków-specific filter is actually used: an off-topic post yields zero proposals", async () => {
    const restore = mockFetch(async () => jsonResponse([OFF_TOPIC_POST]));
    try {
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.proposals.length).toBe(0);
    } finally {
      restore();
    }
  });

  test("a genuine operational post from the mixed feed is proposed, with the Pruszków page title", async () => {
    let callCount = 0;
    const restore = mockFetch(async () => {
      callCount++;
      return jsonResponse([OFF_TOPIC_POST, OPERATIONAL_POST]);
    });
    try {
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.proposals.length).toBe(1);
        expect(result.pageTitle).toBe("Miasto Pruszków — Aktualności dla Mieszkańców");
      }
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
      return jsonResponse([OPERATIONAL_POST]);
    });
    try {
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(callCount).toBe(2);
      expect(result.ok).toBe(true);
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
      const result = await fetchAndParseManualCheck(TARGET, 1);
      expect(callCount).toBe(1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostic).toBe("parse_exception");
    } finally {
      restore();
    }
  });
});
