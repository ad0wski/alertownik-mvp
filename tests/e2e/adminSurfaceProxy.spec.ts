import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

/**
 * Google Play admin/public host separation (src/proxy.ts). Calls `proxy`
 * directly with constructed requests — no dev server, no real HTTP, no
 * Production — same pattern as tests/e2e/adminApiRouteAuth.spec.ts.
 *
 * `NextResponse.next()` (the "let the request through" response) sets the
 * `x-middleware-next` header — that's what "allowed" is asserted on below,
 * rather than assuming a particular status code.
 */

const BASE_URL = "https://example.test";

const RESTRICTED_ROUTES = [
  "/login",
  "/admin",
  "/admin/sources",
  "/builder",
  "/ai-helper",
];

const PUBLIC_ROUTES = ["/", "/alerty", "/prywatnosc"];

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

function callProxy(pathname: string) {
  return proxy(new NextRequest(new URL(pathname, BASE_URL)));
}

function expectBlocked(response: ReturnType<typeof callProxy>) {
  expect(response.status).toBe(404);
  expect(response.headers.get("x-middleware-next")).toBeNull();
}

function expectAllowed(response: ReturnType<typeof callProxy>) {
  expect(response.headers.get("x-middleware-next")).toBe("1");
}

test.describe("proxy — ALERTOWNIK_SURFACE=public", () => {
  for (const route of RESTRICTED_ROUTES) {
    test(`blocks ${route}`, () => {
      withEnv({ ALERTOWNIK_SURFACE: "public" }, () => {
        expectBlocked(callProxy(route));
      });
    });
  }

  for (const route of PUBLIC_ROUTES) {
    test(`allows ${route}`, () => {
      withEnv({ ALERTOWNIK_SURFACE: "public" }, () => {
        expectAllowed(callProxy(route));
      });
    });
  }

  test("does not touch /api/cron/* (outside the proxy's own matcher)", () => {
    withEnv({ ALERTOWNIK_SURFACE: "public" }, () => {
      expectAllowed(callProxy("/api/cron/check-sources"));
    });
  });
});

test.describe("proxy — ALERTOWNIK_SURFACE=admin", () => {
  for (const route of RESTRICTED_ROUTES) {
    test(`allows ${route}`, () => {
      withEnv({ ALERTOWNIK_SURFACE: "admin" }, () => {
        expectAllowed(callProxy(route));
      });
    });
  }
});

test.describe("proxy — combined (env unset or unrecognized)", () => {
  for (const surface of [undefined, "combined", "something-else"]) {
    for (const route of RESTRICTED_ROUTES) {
      test(`allows ${route} when ALERTOWNIK_SURFACE=${surface}`, () => {
        withEnv({ ALERTOWNIK_SURFACE: surface }, () => {
          expectAllowed(callProxy(route));
        });
      });
    }
  }
});
