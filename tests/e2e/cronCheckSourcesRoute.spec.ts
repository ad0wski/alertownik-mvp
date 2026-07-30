import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/check-sources/route";

/**
 * Sprint 142 — route-level tests for GET /api/cron/check-sources.
 *
 * Runs the actual route handler in-process (no dev server involved for
 * these assertions) with `global.fetch` mocked to local fixture HTML — no
 * live website or PDF is ever touched. `CRON_SECRET` here is a clearly-fake
 * value set only in this test process's memory via `process.env` and
 * restored after every test; it is never written to any file and is not
 * the value any real environment would use.
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
  return new NextRequest(`http://localhost/api/cron/check-sources${query}`);
}

function authedRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/cron/check-sources${query}`, {
    headers: { authorization: `Bearer ${FAKE_TEST_SECRET}` },
  });
}

test.describe("static import audit — zero persistence/publish code reachable from this route", () => {
  const routeSrc = readFileSync(
    path.join(process.cwd(), "src/app/api/cron/check-sources/route.ts"),
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
});

test.describe("GET /api/cron/check-sources — kill switch (disabled by default)", () => {
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

test.describe("GET /api/cron/check-sources — authentication (kill switch enabled)", () => {
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
        const req = new NextRequest("http://localhost/api/cron/check-sources", {
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

// Sprint 173 — SAFE_CHECK_SOURCE_IDS grew from 2 (Sprint 139) to 4 (Sprints
// 168/169: wodociagi-michalowice, pruszkow-aktualnosci added). Those two
// are REST-API-backed (apiUrl set), so a no-filter dry run now fetches a
// mix of HTML and JSON targets — this fixture mock serves the right shape
// per URL, mirroring how checkOneSource actually dispatches.
const REST_FIXTURE_POSTS = JSON.stringify([
  {
    title: { rendered: "Przerwa w dostawie wody" },
    excerpt: {
      rendered:
        "<p>W dniu 16 lipca 2026 roku wystąpi przerwa w dostawie wody w miejscowości testowej z powodu awarii sieci.</p>",
    },
  },
]);

// Sprint 183A — Powiat Pruszkowski's listing needs its own template shape
// (the generic FIXTURE_HTML above has no `art-prev` container, so it would
// legitimately parse to zero items for this source — not a bug, just the
// wrong fixture). One long-intro item is enough to clear
// MIN_PROPOSAL_TEXT_LENGTH without any article-body fetch.
const POWIAT_FIXTURE_HTML = `
  <html><body><main>
  <article class="article-area__article ">
  <h2>Wiadomości</h2>
  <div class="art-prev art-prev--near-menu" >
  <ul>
  <li><a href="/web/powiat-pruszkowski/test-utrudnienia">
  <div><div class="title">Utrudnienia w ruchu na drodze powiatowej</div>
  <div class="intro">W dniach 16-20 lipca 2026 roku na drodze powiatowej wystąpią utrudnienia w ruchu związane z remontem nawierzchni, prosimy o ostrożność.</div></div>
  </a></li>
  </ul>
  </div>
  <nav class="pagination"></nav>
  </article>
  </main></body></html>
`;

function mixedFixtureFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("wp-json")) {
      return new Response(REST_FIXTURE_POSTS, { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("samorzad.gov.pl")) {
      return new Response(POWIAT_FIXTURE_HTML, { status: 200, headers: { "content-type": "text/html" } });
    }
    return new Response(FIXTURE_HTML, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
}

test.describe("GET /api/cron/check-sources — dry-run behavior (authorized)", () => {
  test("correct fake token + fixture responses for all thirty-seven allowlisted sources → safe dry-run summary, zero writes claimed", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const restore = mockFetch(mixedFixtureFetch());
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.dryRun).toBe(true);
        expect(body.savedCandidates).toBe(0);
        expect(body.savedSourceChecks).toBe(0);
        expect(body.published).toBe(false);
        expect(body.checkedSources).toBe(37);
        expect(body.results).toHaveLength(37);
        for (const r of body.results) {
          expect([
            "michalowice-komunikaty",
            "wkd-aktualnosci",
            "wodociagi-michalowice",
            "pruszkow-aktualnosci",
            "powiat-pruszkowski-wiadomosci",
            "eko-raszyn",
            "bpwik-brwinow",
            "pkn-nadarzyn",
            "zwik-ozarow-mazowiecki",
            "pwik-radzymin",
            "pwk-legionowo",
            "opwik-otwock",
            "pwik-zabki",
            "hydrosfera-jozefow",
            "pwik-zielonka",
            "pwik-minsk-mazowiecki",
            "pwik-wyszkow",
            "pwik-pultusk",
            "zwik-nowy-dwor-mazowiecki",
            "zwik-pabianice",
            "wodkan-zgierz",
            "pwik-piotrkow",
            "pgkim-aleksandrow-lodzki",
            "komunalne-wielun",
            "mzwik-glowno",
            "pwik-konin",
            "pwik-wrzesnia",
            "sremskie-wodociagi",
            "mwik-ostrowiec",
            "mpgk-busko-zdroj",
            "wodociagi-pinczowskie",
            "mzk-grudziadz",
            "pewik-gdynia",
            "pwik-kwidzyn",
            "zdiz-gdynia",
            "mzk-koszalin",
            "mpk-stargard",
          ]).toContain(r.sourceKey);
          expect(r.outcome).toBe("success");
          expect(r).not.toHaveProperty("title");
          expect(r).not.toHaveProperty("rawText");
          expect(r).not.toHaveProperty("excerpt");
        }
        expect(JSON.stringify(body)).not.toContain("<html>");
      } finally {
        restore();
      }
    });
  });

  test("one source failing does not block the others (per-source isolation)", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const restore = mockFetch(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("wkd.com.pl")) {
          throw new Error("simulated network failure for WKD only");
        }
        if (url.includes("wp-json")) {
          return new Response(REST_FIXTURE_POSTS, { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("samorzad.gov.pl")) {
          return new Response(POWIAT_FIXTURE_HTML, { status: 200, headers: { "content-type": "text/html" } });
        }
        return new Response(FIXTURE_HTML, { status: 200, headers: { "content-type": "text/html" } });
      });
      try {
        const res = await GET(authedRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.checkedSources).toBe(37);
        expect(body.successfulSources).toBe(36);
        expect(body.failedSources).toBe(1);
        const wkdResult = body.results.find((r: { sourceKey: string }) => r.sourceKey === "wkd-aktualnosci");
        const michalowiceResult = body.results.find(
          (r: { sourceKey: string }) => r.sourceKey === "michalowice-komunikaty"
        );
        expect(wkdResult.outcome).toBe("fetch_error");
        expect(wkdResult.diagnostic).toBe("network_error");
        expect(michalowiceResult.outcome).toBe("success");
      } finally {
        restore();
      }
    });
  });

  // Scoped to a single HTML-based source (?sourceKey=) — a non-html
  // content-type is a permanent failure mode specific to the HTML fetch
  // path; the REST path has its own distinct malformed-body test below.
  test("a non-html content-type response is classified as fetch_error, not a crash", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const restore = mockFetch(async () =>
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
      );
      try {
        const res = await GET(authedRequest("?sourceKey=michalowice-komunikaty"));
        const body = await res.json();
        expect(body.results.every((r: { outcome: string }) => r.outcome === "fetch_error")).toBe(true);
      } finally {
        restore();
      }
    });
  });

  test("a 5xx response is classified as fetch_error with an http_5xx diagnostic", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const restore = mockFetch(async () => new Response("", { status: 503 }));
      try {
        const res = await GET(authedRequest());
        const body = await res.json();
        expect(body.results.every((r: { diagnostic: string }) => r.diagnostic === "http_5xx")).toBe(true);
      } finally {
        restore();
      }
    });
  });

  // Scoped to a single HTML-based source — see the content-type test above
  // for why REST-backed sources get their own dedicated test instead.
  test("empty/boilerplate page yields no_proposals, not an error", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const restore = mockFetch(async () =>
        new Response("<html><body><nav>Tylko menu</nav></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      );
      try {
        const res = await GET(authedRequest("?sourceKey=michalowice-komunikaty"));
        const body = await res.json();
        expect(body.results.every((r: { outcome: string }) => r.outcome === "no_proposals")).toBe(true);
        expect(body.totalProposalCount).toBe(0);
      } finally {
        restore();
      }
    });
  });

  // Sprint 173 — dedicated coverage for the REST-backed sources' dry-run
  // path (wodociagi-michalowice/pruszkow-aktualnosci), added alongside the
  // fix that made checkOneSource actually use their apiUrl.
  test("a REST-backed source (wodociagi-michalowice) parses a genuine JSON response into a real proposal", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const restore = mockFetch(async () =>
        new Response(REST_FIXTURE_POSTS, { status: 200, headers: { "content-type": "application/json" } })
      );
      try {
        const res = await GET(authedRequest("?sourceKey=wodociagi-michalowice"));
        const body = await res.json();
        expect(body.results).toHaveLength(1);
        expect(body.results[0].sourceKey).toBe("wodociagi-michalowice");
        expect(body.results[0].outcome).toBe("success");
        expect(body.results[0].proposalCount).toBe(1);
      } finally {
        restore();
      }
    });
  });

  test("a REST-backed source with a malformed (non-array) JSON body fails closed as parse_error, not a crash", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const restore = mockFetch(async () =>
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
      );
      try {
        const res = await GET(authedRequest("?sourceKey=wodociagi-michalowice"));
        const body = await res.json();
        expect(body.results[0].outcome).toBe("parse_error");
        expect(body.results[0].diagnostic).toBe("parse_exception");
      } finally {
        restore();
      }
    });
  });

  test("an arbitrary/unlisted sourceKey query param resolves to zero checked sources, never a fetch", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      let fetchCalled = false;
      const restore = mockFetch(async () => {
        fetchCalled = true;
        throw new Error("fetch must not be called for an unlisted sourceKey");
      });
      try {
        const res = await GET(authedRequest("?sourceKey=https://evil.example/page"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.checkedSources).toBe(0);
        expect(body.results).toEqual([]);
        expect(fetchCalled).toBe(false);
      } finally {
        restore();
      }
    });
  });

  test("a valid sourceKey filter checks exactly that one allowlisted source", async () => {
    await withEnv({ SCHEDULED_CHECKS_ENABLED: "true", CRON_SECRET: FAKE_TEST_SECRET }, async () => {
      const restore = mockFetch(async () =>
        new Response(FIXTURE_HTML, { status: 200, headers: { "content-type": "text/html" } })
      );
      try {
        const res = await GET(authedRequest("?sourceKey=wkd-aktualnosci"));
        const body = await res.json();
        expect(body.checkedSources).toBe(1);
        expect(body.results[0].sourceKey).toBe("wkd-aktualnosci");
      } finally {
        restore();
      }
    });
  });
});
