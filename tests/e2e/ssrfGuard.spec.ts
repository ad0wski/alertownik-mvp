import { test, expect } from "@playwright/test";
import dnsModule from "dns";
import {
  isPublicIp,
  assertPublicHttpUrl,
  guardedFetch,
} from "@/lib/ssrfGuard";

/**
 * Sprint 161 — tests for the SSRF guard used by
 * /api/sources/fetch-preview/route.ts, the one route that fetches an
 * admin-supplied (not server-allowlisted) URL.
 *
 * `dns.promises.lookup` and `global.fetch` are mocked throughout — no real
 * DNS resolution and no real network request happens in this file. Nothing
 * here ever targets Production or a real internal address.
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
  return async (_hostname: string, _opts?: unknown) =>
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
}

// ── isPublicIp — direct IP-literal classification ───────────────────────────

test.describe("isPublicIp — IPv4 private/reserved ranges", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.0.1",
    "169.254.169.254", // cloud metadata endpoint
    "0.0.0.0",
    "100.64.0.1", // carrier-grade NAT
    "192.0.2.1", // documentation TEST-NET-1
    "198.51.100.1", // documentation TEST-NET-2
    "203.0.113.1", // documentation TEST-NET-3
    "255.255.255.255",
  ]) {
    test(`${ip} is classified private/blocked`, () => {
      expect(isPublicIp(ip)).toBe(false);
    });
  }
});

test.describe("isPublicIp — IPv6 private/reserved ranges", () => {
  for (const ip of [
    "::1", // loopback
    "::", // unspecified
    "fe80::1", // link-local
    "fc00::1", // unique local
    "fd12:3456:789a::1", // unique local
    "ff02::1", // multicast
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:169.254.169.254", // IPv4-mapped metadata address
    "::ffff:10.0.0.1", // IPv4-mapped private
  ]) {
    test(`${ip} is classified private/blocked`, () => {
      expect(isPublicIp(ip)).toBe(false);
    });
  }
});

test.describe("isPublicIp — genuinely public addresses", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
    test(`${ip} is classified public`, () => {
      expect(isPublicIp(ip)).toBe(true);
    });
  }
});

// ── assertPublicHttpUrl — full URL validation ───────────────────────────────

test.describe("assertPublicHttpUrl — protocol and credentials", () => {
  test("rejects a non-http(s) protocol", async () => {
    const result = await assertPublicHttpUrl("file:///etc/passwd");
    expect(result.ok).toBe(false);
  });

  test("rejects ftp://", async () => {
    const result = await assertPublicHttpUrl("ftp://example.com/file");
    expect(result.ok).toBe(false);
  });

  test("rejects a URL carrying embedded credentials", async () => {
    const result = await assertPublicHttpUrl("https://user:pass@example.com/");
    expect(result.ok).toBe(false);
  });

  test("rejects an unparseable URL", async () => {
    const result = await assertPublicHttpUrl("not a url");
    expect(result.ok).toBe(false);
  });
});

test.describe("assertPublicHttpUrl — blocked hostnames and literal IPs", () => {
  test("rejects http://localhost", async () => {
    const result = await assertPublicHttpUrl("http://localhost/");
    expect(result.ok).toBe(false);
  });

  test("rejects http://127.0.0.1", async () => {
    const result = await assertPublicHttpUrl("http://127.0.0.1/");
    expect(result.ok).toBe(false);
  });

  test("rejects http://[::1]", async () => {
    const result = await assertPublicHttpUrl("http://[::1]/");
    expect(result.ok).toBe(false);
  });

  test("rejects http://0.0.0.0", async () => {
    const result = await assertPublicHttpUrl("http://0.0.0.0/");
    expect(result.ok).toBe(false);
  });

  test("rejects a .internal hostname suffix", async () => {
    const result = await assertPublicHttpUrl("http://service.internal/");
    expect(result.ok).toBe(false);
  });
});

test.describe("assertPublicHttpUrl — DNS-resolved hostnames", () => {
  test("a hostname resolving to a private IP is rejected", async () => {
    const restore = mockDnsLookup(lookupResolvingTo("10.1.2.3"));
    try {
      const result = await assertPublicHttpUrl("https://internal.example.com/");
      expect(result.ok).toBe(false);
    } finally {
      restore();
    }
  });

  test("a hostname resolving to the cloud metadata address is rejected", async () => {
    const restore = mockDnsLookup(lookupResolvingTo("169.254.169.254"));
    try {
      const result = await assertPublicHttpUrl("https://metadata.example.com/");
      expect(result.ok).toBe(false);
    } finally {
      restore();
    }
  });

  test("a hostname resolving to BOTH a public and a private address is rejected (every address must be public)", async () => {
    const restore = mockDnsLookup(lookupResolvingTo("8.8.8.8", "10.0.0.5"));
    try {
      const result = await assertPublicHttpUrl("https://mixed.example.com/");
      expect(result.ok).toBe(false);
    } finally {
      restore();
    }
  });

  test("a hostname resolving only to public addresses is accepted", async () => {
    const restore = mockDnsLookup(lookupResolvingTo("93.184.216.34"));
    try {
      const result = await assertPublicHttpUrl("https://public.example.com/");
      expect(result.ok).toBe(true);
    } finally {
      restore();
    }
  });

  test("DNS resolution failure is rejected, not treated as public", async () => {
    const restore = mockDnsLookup(async () => {
      throw new Error("ENOTFOUND");
    });
    try {
      const result = await assertPublicHttpUrl("https://does-not-resolve.example.com/");
      expect(result.ok).toBe(false);
    } finally {
      restore();
    }
  });
});

// ── guardedFetch — redirect re-validation ───────────────────────────────────

test.describe("guardedFetch — redirect handling", () => {
  test("a public→public redirect chain is followed and re-validated at each hop", async () => {
    const restoreDns = mockDnsLookup(lookupResolvingTo("93.184.216.34"));
    const restoreFetch = mockFetch(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://start.example.com/") {
        return new Response(null, { status: 302, headers: { location: "https://end.example.com/" } });
      }
      if (url === "https://end.example.com/") {
        return new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    try {
      const result = await guardedFetch("https://start.example.com/");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.finalUrl).toBe("https://end.example.com/");
    } finally {
      restoreFetch();
      restoreDns();
    }
  });

  test("a public→private redirect is rejected, never followed to the private target", async () => {
    const restoreDns = mockDnsLookup(async (hostname: string) => {
      if (hostname === "start.example.com") return [{ address: "93.184.216.34", family: 4 }];
      // The redirect target resolves to a private address.
      return [{ address: "127.0.0.1", family: 4 }];
    });
    let privateHostFetched = false;
    const restoreFetch = mockFetch(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://start.example.com/") {
        return new Response(null, { status: 302, headers: { location: "http://internal.example.com/" } });
      }
      if (url === "http://internal.example.com/") {
        privateHostFetched = true;
        return new Response("secret", { status: 200 });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    try {
      const result = await guardedFetch("https://start.example.com/");
      expect(result.ok).toBe(false);
      expect(privateHostFetched).toBe(false);
    } finally {
      restoreFetch();
      restoreDns();
    }
  });

  test("too many redirects is rejected rather than followed indefinitely", async () => {
    const restoreDns = mockDnsLookup(lookupResolvingTo("93.184.216.34"));
    let hops = 0;
    const restoreFetch = mockFetch(async () => {
      hops += 1;
      return new Response(null, { status: 302, headers: { location: `https://start.example.com/${hops}` } });
    });
    try {
      const result = await guardedFetch("https://start.example.com/", { maxRedirects: 3 });
      expect(result.ok).toBe(false);
      expect(hops).toBeLessThanOrEqual(5); // bounded, not unbounded
    } finally {
      restoreFetch();
      restoreDns();
    }
  });

  test("a straightforward public HTTPS URL with no redirect succeeds", async () => {
    const restoreDns = mockDnsLookup(lookupResolvingTo("93.184.216.34"));
    const restoreFetch = mockFetch(async () =>
      new Response("<html><title>ok</title></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );
    try {
      const result = await guardedFetch("https://public.example.com/");
      expect(result.ok).toBe(true);
    } finally {
      restoreFetch();
      restoreDns();
    }
  });

  test("never forwards client-controlled headers to the target host", async () => {
    const restoreDns = mockDnsLookup(lookupResolvingTo("93.184.216.34"));
    let observedHeaders: Headers | null = null;
    const restoreFetch = mockFetch(async (_input, init) => {
      observedHeaders = new Headers(init?.headers);
      return new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
    });
    try {
      await guardedFetch("https://public.example.com/");
      expect(observedHeaders).not.toBeNull();
      expect(observedHeaders!.has("cookie")).toBe(false);
      expect(observedHeaders!.has("authorization")).toBe(false);
    } finally {
      restoreFetch();
      restoreDns();
    }
  });
});
