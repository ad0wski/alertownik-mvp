import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

/**
 * Google Play admin/public host separation (src/proxy.ts) — ONE Vercel
 * project, split by hostname. Calls `proxy` directly with constructed
 * requests — no dev server, no real HTTP, no Production — same pattern as
 * tests/e2e/adminApiRouteAuth.spec.ts.
 *
 * `NextResponse.next()` (the "let the request through" response) sets the
 * `x-middleware-next` header — that's what "allowed" is asserted on below,
 * rather than assuming a particular status code.
 */

const PUBLIC_HOST = "alertownik-mvp.vercel.app";
const ADMIN_HOST = "alertownik-admin.vercel.app";
const PREVIEW_HOST = "generated-example.vercel.app";

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

function callProxy(host: string, pathname: string) {
  return proxy(new NextRequest(new URL(pathname, `https://${host}`)));
}

function expectBlocked(response: ReturnType<typeof callProxy>) {
  expect(response.status).toBe(404);
  expect(response.headers.get("x-middleware-next")).toBeNull();
}

function expectAllowed(response: ReturnType<typeof callProxy>) {
  expect(response.headers.get("x-middleware-next")).toBe("1");
}

test.describe("proxy — ALERTOWNIK_ADMIN_HOST unset (combined, unchanged Production behavior)", () => {
  for (const host of [PUBLIC_HOST, ADMIN_HOST, PREVIEW_HOST]) {
    for (const route of RESTRICTED_ROUTES) {
      test(`allows ${route} on ${host}`, () => {
        withEnv({ ALERTOWNIK_ADMIN_HOST: undefined }, () => {
          expectAllowed(callProxy(host, route));
        });
      });
    }
  }
});

test.describe("proxy — ALERTOWNIK_ADMIN_HOST set — public host", () => {
  for (const route of RESTRICTED_ROUTES) {
    test(`blocks ${route}`, () => {
      withEnv({ ALERTOWNIK_ADMIN_HOST: ADMIN_HOST }, () => {
        expectBlocked(callProxy(PUBLIC_HOST, route));
      });
    });
  }

  for (const route of PUBLIC_ROUTES) {
    test(`allows ${route}`, () => {
      withEnv({ ALERTOWNIK_ADMIN_HOST: ADMIN_HOST }, () => {
        expectAllowed(callProxy(PUBLIC_HOST, route));
      });
    });
  }

  test("does not touch /api/cron/* (outside the proxy's own matcher)", () => {
    withEnv({ ALERTOWNIK_ADMIN_HOST: ADMIN_HOST }, () => {
      expectAllowed(callProxy(PUBLIC_HOST, "/api/cron/example"));
    });
  });

  test("hostname comparison is case-insensitive", () => {
    withEnv({ ALERTOWNIK_ADMIN_HOST: ADMIN_HOST }, () => {
      expectBlocked(callProxy(PUBLIC_HOST.toUpperCase(), "/login"));
    });
  });

  test("a non-default port on the public host does not break classification", () => {
    withEnv({ ALERTOWNIK_ADMIN_HOST: ADMIN_HOST }, () => {
      // `NextRequest#nextUrl.hostname` strips the port per the URL spec —
      // this must still classify as "public" and block.
      expectBlocked(callProxy(`${PUBLIC_HOST}:8443`, "/login"));
    });
  });
});

test.describe("proxy — ALERTOWNIK_ADMIN_HOST set — admin host", () => {
  for (const route of RESTRICTED_ROUTES) {
    test(`allows ${route}`, () => {
      withEnv({ ALERTOWNIK_ADMIN_HOST: ADMIN_HOST }, () => {
        expectAllowed(callProxy(ADMIN_HOST, route));
      });
    });
  }

  test("hostname comparison is case-insensitive against ALERTOWNIK_ADMIN_HOST's own casing", () => {
    withEnv({ ALERTOWNIK_ADMIN_HOST: ADMIN_HOST.toUpperCase() }, () => {
      expectAllowed(callProxy(ADMIN_HOST, "/admin"));
    });
  });
});

test.describe("proxy — ALERTOWNIK_ADMIN_HOST set — any other host (preview/localhost/branch alias)", () => {
  for (const host of [PREVIEW_HOST, "localhost", "alertownik-mvp-git-some-branch-alertownik.vercel.app"]) {
    for (const route of RESTRICTED_ROUTES) {
      test(`allows ${route} on ${host} (combined, never accidentally blocked)`, () => {
        withEnv({ ALERTOWNIK_ADMIN_HOST: ADMIN_HOST }, () => {
          expectAllowed(callProxy(host, route));
        });
      });
    }
  }
});
