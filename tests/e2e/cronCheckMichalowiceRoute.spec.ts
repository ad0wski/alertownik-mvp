import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/check-michalowice/route";

/**
 * Sprint 153 — route-level tests for GET /api/cron/check-michalowice.
 *
 * Mirrors tests/e2e/cronCheckSourcesRoute.spec.ts's auth/kill-switch/dry-run
 * coverage, plus the extra guarantee this wrapper exists for: the source is
 * hardcoded, so no query string can change what gets checked. `CRON_SECRET`
 * here is a fake, in-memory-only test value — never written to any file.
 */

const FAKE_TEST_SECRET = "test-only-fake-secret-not-a-real-value";

const FIXTURE_HTML = `
  <html><head><title>Fixture</title></head>
  <body><main>
    <h2>Testowy komunikat z datą 16 lipca 2026</h2>
    <p>Wystarczająco długi fragment testowy, żeby przejść próg minimalnej
    długości propozycji i zostać policzonym jako realny kandydat.</p>
  </main></body></html>
`;

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

function makeRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/cron/check-michalowice${query}`);
}

function authedRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/cron/check-michalowice${query}`, {
    headers: { authorization: `Bearer ${FAKE_TEST_SECRET}` },
  });
}

test.describe("static import audit — zero persistence/publish code reachable from this route", () => {
  const routeSrc = readFileSync(
    path.join(process.cwd(), "src/app/api/cron/check-michalowice/route.ts"),
    "utf8"
  );
  const libSrc = readFileSync(path.join(process.cwd(), "src/lib/cronCheckSources.ts"), "utf8");
  const combined = routeSrc + libSrc;

  test("route and its lib module never import any Supabase write helper, verifier, or publish path", () => {
    for (const forbidden of [
      "supabaseCandidateWrites",
      "supabaseSourceWrites",
      "supabaseAlertWrites",
      "candidateVerifier",
      "createSourceCandidateNotice",
      "createSourceCheck",
      "markCandidateConverted",
      "service_role",
      "SUPABASE_SERVICE_ROLE",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  test("route and its lib module never import the Supabase client at all", () => {
    expect(combined).not.toMatch(/from ["']@\/lib\/supabaseClient["']/);
    expect(combined).not.toMatch(/@supabase\/supabase-js/);
  });

  test("route never imports write-candidates or references wkd-aktualnosci", () => {
    expect(routeSrc).not.toContain("write-candidates");
    expect(routeSrc).not.toContain("wkd-aktualnosci");
  });
});

test.describe("GET /api/cron/check-michalowice — kill switch (disabled by default)", () => {
  test("no env configured at all → 503 disabled, source fetch never attempted", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: undefined, CRON_SECRET: undefined }, async () => {
      let fetchCalled = false;
      const restore = mockFetch(async () => {
        fetchCalled = true;
        throw new Error("fetch must not be called");
      });
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(fetchCalled).toBe(false);
      } finally {
        restore();
      }
    });
  });

  test("CRON_SECRET set but SCHEDULED_CHECKS_ENABLED not 'true' → still 503 disabled", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "false", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const res = await GET(authedRequest());
      expect(res.status).toBe(503);
    });
  });
});

test.describe("GET /api/cron/check-michalowice — authentication (kill switch enabled)", () => {
  test("missing CRON_SECRET configuration fails closed with a safe config-error response", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: undefined }, async () => {
      let fetchCalled = false;
      const restore = mockFetch(async () => {
        fetchCalled = true;
        throw new Error("fetch must not be called");
      });
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(JSON.stringify(body)).not.toContain(FAKE_TEST_SECRET);
        expect(fetchCalled).toBe(false);
      } finally {
        restore();
      }
    });
  });

  test("missing Authorization header is rejected generically — no source fetch happens", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      let fetchCalled = false;
      const restore = mockFetch(async () => {
        fetchCalled = true;
        throw new Error("fetch must not be called");
      });
      try {
        const res = await GET(makeRequest());
        expect(res.status).toBe(401);
        expect(fetchCalled).toBe(false);
      } finally {
        restore();
      }
    });
  });

  test("wrong bearer token is rejected — no source fetch happens", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      let fetchCalled = false;
      const restore = mockFetch(async () => {
        fetchCalled = true;
        throw new Error("fetch must not be called");
      });
      try {
        const req = new NextRequest("http://localhost/api/cron/check-michalowice", {
          headers: { authorization: "Bearer totally-wrong-value" },
        });
        const res = await GET(req);
        expect(res.status).toBe(401);
        expect(fetchCalled).toBe(false);
      } finally {
        restore();
      }
    });
  });

  test("response bodies never contain the configured secret value", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const restore = mockFetch(async () =>
        new Response(FIXTURE_HTML, { status: 200, headers: { "content-type": "text/html" } })
      );
      try {
        for (const req of [makeRequest(), authedRequest()]) {
          const res = await GET(req);
          const text = await res.text();
          expect(text).not.toContain(FAKE_TEST_SECRET);
        }
      } finally {
        restore();
      }
    });
  });
});

test.describe("GET /api/cron/check-michalowice — dry-run behavior (authorized)", () => {
  test("checks exactly Michałowice, regardless of any query string — source is hardcoded", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const restore = mockFetch(async () =>
        new Response(FIXTURE_HTML, { status: 200, headers: { "content-type": "text/html" } })
      );
      try {
        // Vercel Cron never sends a query string, but even if a caller adds
        // one (e.g. sourceKey=wkd-aktualnosci), it must have no effect.
        const res = await GET(authedRequest("?sourceKey=wkd-aktualnosci"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.dryRun).toBe(true);
        expect(body.savedCandidates).toBe(0);
        expect(body.savedSourceChecks).toBe(0);
        expect(body.published).toBe(false);
        expect(body.checkedSources).toBe(1);
        expect(body.results).toHaveLength(1);
        expect(body.results[0].sourceKey).toBe("michalowice-komunikaty");
        expect(body.results[0]).not.toHaveProperty("title");
        expect(body.results[0]).not.toHaveProperty("rawText");
        expect(body.results[0]).not.toHaveProperty("excerpt");
        expect(JSON.stringify(body)).not.toContain("<html>");
      } finally {
        restore();
      }
    });
  });

  test("a fetch failure is classified as fetch_error, not a crash", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const restore = mockFetch(async () => {
        throw new Error("simulated network failure");
      });
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.checkedSources).toBe(1);
        expect(body.failedSources).toBe(1);
        expect(body.results[0].outcome).toBe("fetch_error");
        expect(body.results[0].diagnostic).toBe("network_error");
        expect(body.savedCandidates).toBe(0);
        expect(body.published).toBe(false);
      } finally {
        restore();
      }
    });
  });

  test("empty/boilerplate page yields no_proposals, not an error", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const restore = mockFetch(async () =>
        new Response("<html><body><nav>Tylko menu</nav></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      );
      try {
        const res = await GET(authedRequest());
        const body = await res.json();
        expect(body.results[0].outcome).toBe("no_proposals");
        expect(body.totalProposalCount).toBe(0);
      } finally {
        restore();
      }
    });
  });
});
