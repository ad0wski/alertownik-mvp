import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { GET as autoPublishGet } from "@/app/api/cron/auto-publish-trusted-source/route";

/**
 * Sprint 180C — GET /api/cron/auto-publish-trusted-source. Mirrors
 * scheduledWriterRoute.spec.ts's own convention: import the route handler
 * directly, no server started, env vars saved/restored around each test.
 * GUARD_PASS_ENV mirrors that file's own pattern exactly, so the Layer 0
 * database-environment guard never becomes the reason a test unrelated to
 * it gets a 503.
 */

const FAKE_CRON_SECRET = "test-only-fake-secret-not-a-real-value";
const GUARD_PASS_PROJECT_REF = "test-only-fake-project-ref";
const GUARD_PASS_ENV = {
  VERCEL_ENV: "development",
  SUPABASE_ENVIRONMENT_TAG: "development",
  NEXT_PUBLIC_SUPABASE_URL: `https://${GUARD_PASS_PROJECT_REF}.supabase.co`,
  SUPABASE_EXPECTED_PROJECT_REF: GUARD_PASS_PROJECT_REF,
};

function withEnv(overrides: Record<string, string | undefined>, fn: () => Promise<void>) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    original[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  return fn().finally(() => {
    for (const key of Object.keys(overrides)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
}

const req = () => new NextRequest("http://localhost/api/cron/auto-publish-trusted-source");
const reqWithAuth = (secret: string) =>
  new NextRequest("http://localhost/api/cron/auto-publish-trusted-source", {
    headers: { authorization: `Bearer ${secret}` },
  });

test.describe("GET /api/cron/auto-publish-trusted-source — independent kill switches", () => {
  test("SCHEDULED_AUTO_PUBLISH_ENABLED unset → 503, regardless of SCHEDULED_WRITES_ENABLED", async () => {
    await withEnv(
      {
        ...GUARD_PASS_ENV,
        SCHEDULED_CHECKS_ENABLED: "true",
        SCHEDULED_WRITES_ENABLED: "true",
        SCHEDULED_AUTO_PUBLISH_ENABLED: undefined,
      },
      async () => {
        const res = await autoPublishGet(req());
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.ok).toBe(false);
      }
    );
  });

  test("SCHEDULED_AUTO_PUBLISH_ENABLED=true but SCHEDULED_WRITES_ENABLED=false still reaches the auth layer (independent flags) — auto-publish does not depend on write-candidates' own switch", async () => {
    await withEnv(
      {
        ...GUARD_PASS_ENV,
        SCHEDULED_CHECKS_ENABLED: "true",
        SCHEDULED_WRITES_ENABLED: "false",
        SCHEDULED_AUTO_PUBLISH_ENABLED: "true",
        CRON_SECRET: undefined,
      },
      async () => {
        const res = await autoPublishGet(req());
        // No CRON_SECRET configured → falls through to the "not_configured"
        // 503 from the auth layer, NOT the flag-gate 503 — proving the
        // flag check itself was satisfied and passed, independent of
        // SCHEDULED_WRITES_ENABLED.
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error).toBe("Endpoint nieskonfigurowany.");
      }
    );
  });

  test("SCHEDULED_CHECKS_ENABLED=false → 503 even with auto-publish enabled", async () => {
    await withEnv(
      {
        ...GUARD_PASS_ENV,
        SCHEDULED_CHECKS_ENABLED: "false",
        SCHEDULED_AUTO_PUBLISH_ENABLED: "true",
      },
      async () => {
        const res = await autoPublishGet(req());
        expect(res.status).toBe(503);
      }
    );
  });

  test("wrong bearer token → 401, no writer sign-in attempted", async () => {
    await withEnv(
      {
        ...GUARD_PASS_ENV,
        SCHEDULED_CHECKS_ENABLED: "true",
        SCHEDULED_AUTO_PUBLISH_ENABLED: "true",
        CRON_SECRET: FAKE_CRON_SECRET,
      },
      async () => {
        const res = await autoPublishGet(reqWithAuth("wrong-token"));
        expect(res.status).toBe(401);
      }
    );
  });

  test("missing writer credentials → 503, generic message, no crash", async () => {
    await withEnv(
      {
        ...GUARD_PASS_ENV,
        SCHEDULED_CHECKS_ENABLED: "true",
        SCHEDULED_AUTO_PUBLISH_ENABLED: "true",
        CRON_SECRET: FAKE_CRON_SECRET,
        SUPABASE_SCHEDULED_WRITER_EMAIL: undefined,
        SUPABASE_SCHEDULED_WRITER_PASSWORD: undefined,
      },
      async () => {
        const res = await autoPublishGet(reqWithAuth(FAKE_CRON_SECRET));
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error).toBe("Automatyczna publikacja nie jest jeszcze skonfigurowana.");
      }
    );
  });

  test("environment guard still gates this route even with every other condition satisfied", async () => {
    await withEnv(
      {
        SCHEDULED_CHECKS_ENABLED: "true",
        SCHEDULED_AUTO_PUBLISH_ENABLED: "true",
        CRON_SECRET: FAKE_CRON_SECRET,
        SUPABASE_SCHEDULED_WRITER_EMAIL: "writer@example.test",
        SUPABASE_SCHEDULED_WRITER_PASSWORD: "test-only-fake-password-not-a-real-value",
        SUPABASE_ENVIRONMENT_TAG: undefined,
      },
      async () => {
        const res = await autoPublishGet(reqWithAuth(FAKE_CRON_SECRET));
        expect(res.status).toBe(503);
      }
    );
  });
});

test.describe("static audit — route independence from SCHEDULED_WRITES_ENABLED", () => {
  test("the route source never reads process.env.SCHEDULED_WRITES_ENABLED — its gating is structurally independent of write-candidates' own switch", () => {
    const routeSrc = readFileSync(
      path.join(process.cwd(), "src/app/api/cron/auto-publish-trusted-source/route.ts"),
      "utf8"
    );
    expect(routeSrc).not.toContain("process.env.SCHEDULED_WRITES_ENABLED");
  });

  test("the route source never fetches a source page or creates a pending candidate — auto-publish only ever considers pre-existing candidates", () => {
    const routeSrc = readFileSync(
      path.join(process.cwd(), "src/app/api/cron/auto-publish-trusted-source/route.ts"),
      "utf8"
    );
    expect(routeSrc).not.toContain("fetchAndParseProposals");
    expect(routeSrc).not.toContain("insertPendingCandidate");
  });
});
