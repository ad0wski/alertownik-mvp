import { test, expect } from "@playwright/test";
import dnsModule from "dns";
import { checkUrlHealth, summarizeLinkHealth, MAX_LINK_HEALTH_TARGETS_PER_REQUEST } from "@/lib/linkHealthCheck";

/**
 * Sprint 164A — tests for the live link/source reachability checker used by
 * the admin-only "Kontrola dostępności linków" panel
 * (src/components/LinkHealthPanel.tsx) and its API route
 * (src/app/api/admin/link-health/route.ts).
 *
 * `dns.promises.lookup` and `global.fetch` are mocked throughout — no real
 * DNS resolution and no real network request happens in this file.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockDnsLookup(impl: (...args: any[]) => Promise<any>) {
  const original = dnsModule.promises.lookup;
  dnsModule.promises.lookup = impl as unknown as typeof dnsModule.promises.lookup;
  return () => {
    dnsModule.promises.lookup = original;
  };
}

function mockFetch(impl: typeof fetch) {
  const original = global.fetch;
  global.fetch = impl;
  return () => {
    global.fetch = original;
  };
}

function lookupResolvingTo(...addresses: string[]) {
  return async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
}

test.describe("checkUrlHealth — status classification", () => {
  test("HTTP 200 → healthy", async () => {
    const restoreDns = mockDnsLookup(lookupResolvingTo("93.184.216.34"));
    const restoreFetch = mockFetch(async () => new Response(null, { status: 200 }));
    try {
      const result = await checkUrlHealth("https://public.example.com/");
      expect(result.outcome).toBe("healthy");
      expect(result.httpStatus).toBe(200);
    } finally {
      restoreFetch();
      restoreDns();
    }
  });

  test("HTTP 404 → needs_attention, not healthy", async () => {
    const restoreDns = mockDnsLookup(lookupResolvingTo("93.184.216.34"));
    const restoreFetch = mockFetch(async () => new Response(null, { status: 404 }));
    try {
      const result = await checkUrlHealth("https://public.example.com/missing");
      expect(result.outcome).toBe("needs_attention");
      expect(result.httpStatus).toBe(404);
    } finally {
      restoreFetch();
      restoreDns();
    }
  });

  test("HTTP 500 → needs_attention", async () => {
    const restoreDns = mockDnsLookup(lookupResolvingTo("93.184.216.34"));
    const restoreFetch = mockFetch(async () => new Response(null, { status: 500 }));
    try {
      const result = await checkUrlHealth("https://public.example.com/broken");
      expect(result.outcome).toBe("needs_attention");
      expect(result.httpStatus).toBe(500);
    } finally {
      restoreFetch();
      restoreDns();
    }
  });
});

test.describe("checkUrlHealth — SSRF guard integration", () => {
  test("a private-IP target is classified 'blocked', never fetched", async () => {
    const restoreDns = mockDnsLookup(lookupResolvingTo("93.184.216.34"));
    let fetchCalled = false;
    const restoreFetch = mockFetch(async () => {
      fetchCalled = true;
      return new Response(null, { status: 200 });
    });
    try {
      const result = await checkUrlHealth("http://127.0.0.1/admin");
      expect(result.outcome).toBe("blocked");
      expect(fetchCalled).toBe(false);
    } finally {
      restoreFetch();
      restoreDns();
    }
  });

  test("a redirect to a private address is classified 'blocked', private target never fetched", async () => {
    const restoreDns = mockDnsLookup(async (hostname: string) => {
      if (hostname === "start.example.com") return [{ address: "93.184.216.34", family: 4 }];
      return [{ address: "10.0.0.5", family: 4 }];
    });
    let privateHostFetched = false;
    const restoreFetch = mockFetch(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://start.example.com/") {
        return new Response(null, { status: 302, headers: { location: "http://internal.example.com/" } });
      }
      privateHostFetched = true;
      return new Response(null, { status: 200 });
    });
    try {
      const result = await checkUrlHealth("https://start.example.com/");
      expect(result.outcome).toBe("blocked");
      expect(privateHostFetched).toBe(false);
    } finally {
      restoreFetch();
      restoreDns();
    }
  });

  test("a hostname resolving to the cloud metadata address is blocked", async () => {
    const restoreDns = mockDnsLookup(lookupResolvingTo("169.254.169.254"));
    const restoreFetch = mockFetch(async () => new Response(null, { status: 200 }));
    try {
      const result = await checkUrlHealth("https://metadata.example.com/");
      expect(result.outcome).toBe("blocked");
    } finally {
      restoreFetch();
      restoreDns();
    }
  });
});

test.describe("checkUrlHealth — timeout and network failure", () => {
  test("a request that aborts on timeout is classified needs_attention, not healthy", async () => {
    const restoreDns = mockDnsLookup(lookupResolvingTo("93.184.216.34"));
    const restoreFetch = mockFetch(async (_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    try {
      const result = await checkUrlHealth("https://slow.example.com/");
      expect(result.outcome).toBe("needs_attention");
      expect(result.reasonCode).toBe("timeout");
      expect(result.httpStatus).toBeNull();
    } finally {
      restoreFetch();
      restoreDns();
    }
  });

  test("a hostname that fails DNS resolution is classified 'blocked' (fail-closed), not healthy", async () => {
    const restoreDns = mockDnsLookup(async () => {
      throw new Error("ENOTFOUND");
    });
    try {
      const result = await checkUrlHealth("https://does-not-resolve.example.com/");
      expect(result.outcome).toBe("blocked");
    } finally {
      restoreDns();
    }
  });
});

test.describe("checkUrlHealth — HEAD-then-GET fallback", () => {
  test("a server rejecting HEAD is retried once with GET, body is never read to completion", async () => {
    const restoreDns = mockDnsLookup(lookupResolvingTo("93.184.216.34"));
    const methodsSeen: string[] = [];
    let bodyCancelled = false;
    const restoreFetch = mockFetch(async (_input, init) => {
      const method = init?.method ?? "GET";
      methodsSeen.push(method);
      if (method === "HEAD") {
        throw new Error("HEAD not supported by this fake server");
      }
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("<html>ok</html>"));
            controller.close();
          },
          cancel() {
            bodyCancelled = true;
          },
        }),
        { status: 200, headers: { "content-type": "text/html" } }
      );
    });
    try {
      const result = await checkUrlHealth("https://head-unsupported.example.com/");
      expect(methodsSeen).toEqual(["HEAD", "GET"]);
      expect(result.outcome).toBe("healthy");
      expect(bodyCancelled).toBe(true);
    } finally {
      restoreFetch();
      restoreDns();
    }
  });
});

test.describe("summarizeLinkHealth", () => {
  test("counts each outcome bucket independently", () => {
    const summary = summarizeLinkHealth([
      { outcome: "healthy", httpStatus: 200, reasonCode: "http_200", finalUrl: "https://a", checkedAt: "" },
      { outcome: "healthy", httpStatus: 200, reasonCode: "http_200", finalUrl: "https://b", checkedAt: "" },
      { outcome: "needs_attention", httpStatus: 404, reasonCode: "http_404", finalUrl: "https://c", checkedAt: "" },
      { outcome: "blocked", httpStatus: null, reasonCode: "private_ip", finalUrl: null, checkedAt: "" },
    ]);
    expect(summary).toEqual({ total: 4, healthy: 2, needsAttention: 1, blocked: 1 });
  });
});

test("MAX_LINK_HEALTH_TARGETS_PER_REQUEST is a small, sane bound", () => {
  expect(MAX_LINK_HEALTH_TARGETS_PER_REQUEST).toBeGreaterThan(0);
  expect(MAX_LINK_HEALTH_TARGETS_PER_REQUEST).toBeLessThanOrEqual(100);
});
