import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { GET as automationStatusGet } from "@/app/api/admin/automation-status/route";

/**
 * Sprint 166D-2B — route-level tests for the new, read-only
 * scheduled_writer_runs history reflected into GET
 * /api/admin/automation-status. Mirrors the exact mocking convention
 * already established in automationStatus.spec.ts (mock global.fetch at
 * the Supabase REST layer — no real network, no real Supabase project
 * touched).
 */

const FAKE_URL = "https://fake-test-project.supabase.co";
const FAKE_KEY = "fake-test-anon-key-not-a-real-value";

const BASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: FAKE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_KEY,
};

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

function authedRequest(token: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/automation-status", {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
}

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  trigger: "cron" | "manual";
  environment_tag: string;
  outcome: string | null;
  sources_checked: number;
  sources_failed: number;
}

function mockAuthedAdmin(runRows: RunRow[] | "reject-if-called" = [], capturedUrls?: string[]) {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "signed-in-admin", aud: "authenticated" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/admin_profiles")) {
      return new Response(JSON.stringify([{ user_id: "signed-in-admin" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/scheduled_writer_runs")) {
      if (runRows === "reject-if-called") {
        throw new Error("scheduled_writer_runs must never be queried when the environment tag is not configured");
      }
      capturedUrls?.push(url);
      return new Response(JSON.stringify(runRows), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch to ${url}`);
  };
}

function closedRow(overrides: Partial<RunRow>): RunRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    started_at: "2026-07-23T10:00:00.000Z",
    finished_at: "2026-07-23T10:00:30.000Z",
    trigger: "manual",
    environment_tag: "preview",
    outcome: "success",
    sources_checked: 1,
    sources_failed: 0,
    ...overrides,
  };
}

test.describe("GET /api/admin/automation-status — run history (Sprint 166D-2B)", () => {
  test("environment tag not configured → runHistory.configured is false, no query attempted", async () => {
    await withEnv({ ...BASE_ENV, SUPABASE_ENVIRONMENT_TAG: undefined }, async () => {
      const restore = mockFetch(mockAuthedAdmin("reject-if-called"));
      try {
        const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.status.runHistory.configured).toBe(false);
        expect(body.status.runHistory.lastClosedRun).toBeNull();
        expect(body.status.runHistory.openRun).toBeNull();
      } finally {
        restore();
      }
    });
  });

  test("configured, no rows yet → configured true, both lastClosedRun and openRun null", async () => {
    await withEnv({ ...BASE_ENV, SUPABASE_ENVIRONMENT_TAG: "preview" }, async () => {
      const restore = mockFetch(mockAuthedAdmin([]));
      try {
        const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
        const body = await res.json();
        expect(body.status.runHistory.configured).toBe(true);
        expect(body.status.runHistory.lastClosedRun).toBeNull();
        expect(body.status.runHistory.openRun).toBeNull();
      } finally {
        restore();
      }
    });
  });

  test("last run success → category none, severity info, no admin action required", async () => {
    await withEnv({ ...BASE_ENV, SUPABASE_ENVIRONMENT_TAG: "preview" }, async () => {
      const restore = mockFetch(mockAuthedAdmin([closedRow({ outcome: "success" })]));
      try {
        const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
        const body = await res.json();
        const run = body.status.runHistory.lastClosedRun;
        expect(run.outcome).toBe("success");
        expect(run.category).toBe("none");
        expect(run.severity).toBe("info");
        expect(run.adminActionRequired).toBe(false);
        expect(run.durationSeconds).toBe(30);
      } finally {
        restore();
      }
    });
  });

  test("last run failed (total_failure) → unexpected_error/critical, admin action required", async () => {
    await withEnv({ ...BASE_ENV, SUPABASE_ENVIRONMENT_TAG: "preview" }, async () => {
      const restore = mockFetch(
        mockAuthedAdmin([closedRow({ outcome: "total_failure", sources_checked: 1, sources_failed: 1 })])
      );
      try {
        const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
        const body = await res.json();
        const run = body.status.runHistory.lastClosedRun;
        expect(run.category).toBe("unexpected_error");
        expect(run.severity).toBe("critical");
        expect(run.adminActionRequired).toBe(true);
      } finally {
        restore();
      }
    });
  });

  test("last run abandoned → lock_held category, surfaced honestly", async () => {
    await withEnv({ ...BASE_ENV, SUPABASE_ENVIRONMENT_TAG: "preview" }, async () => {
      const restore = mockFetch(mockAuthedAdmin([closedRow({ outcome: "abandoned" })]));
      try {
        const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
        const body = await res.json();
        expect(body.status.runHistory.lastClosedRun.category).toBe("lock_held");
      } finally {
        restore();
      }
    });
  });

  test("an open run (finished_at null) is reported separately from the last closed run", async () => {
    await withEnv({ ...BASE_ENV, SUPABASE_ENVIRONMENT_TAG: "preview" }, async () => {
      const nowIso = new Date().toISOString();
      const restore = mockFetch(
        mockAuthedAdmin([
          { ...closedRow({ id: "open-row", finished_at: null, outcome: null, started_at: nowIso }) },
          closedRow({ id: "closed-row", outcome: "success" }),
        ])
      );
      try {
        const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
        const body = await res.json();
        expect(body.status.runHistory.openRun).not.toBeNull();
        expect(body.status.runHistory.openRun.likelyStuck).toBe(false);
        expect(body.status.runHistory.lastClosedRun).not.toBeNull();
        expect(body.status.runHistory.lastClosedRun.outcome).toBe("success");
      } finally {
        restore();
      }
    });
  });

  test("an open run started long ago is flagged as likely stuck", async () => {
    await withEnv({ ...BASE_ENV, SUPABASE_ENVIRONMENT_TAG: "preview" }, async () => {
      const longAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
      const restore = mockFetch(
        mockAuthedAdmin([closedRow({ id: "stuck-row", finished_at: null, outcome: null, started_at: longAgoIso })])
      );
      try {
        const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
        const body = await res.json();
        expect(body.status.runHistory.openRun.likelyStuck).toBe(true);
      } finally {
        restore();
      }
    });
  });

  test("rows for a different environment_tag are never surfaced, even if a buggy/hostile query response returned one anyway (defense in depth, layer 2: buildRunHistorySnapshot)", async () => {
    await withEnv({ ...BASE_ENV, SUPABASE_ENVIRONMENT_TAG: "preview" }, async () => {
      const restore = mockFetch(
        mockAuthedAdmin([closedRow({ id: "wrong-env", environment_tag: "production", outcome: "total_failure" })])
      );
      try {
        const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
        const body = await res.json();
        // The mismatched-tag row must never surface as this environment's
        // last closed run, even though the mock returned it — this
        // simulates layer 1 (the DB-side .eq() filter) somehow failing to
        // exclude it; layer 2 must still catch it independently.
        expect(body.status.runHistory.lastClosedRun).toBeNull();
      } finally {
        restore();
      }
    });
  });

  test("Sprint 166D-2C — the query itself filters by environment_tag server-side (layer 1), using the resolved tag, never a hardcoded literal", async () => {
    await withEnv({ ...BASE_ENV, SUPABASE_ENVIRONMENT_TAG: "development" }, async () => {
      const capturedUrls: string[] = [];
      const restore = mockFetch(mockAuthedAdmin([], capturedUrls));
      try {
        await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
        expect(capturedUrls.length).toBeGreaterThan(0);
        // Supabase-js renders .eq("environment_tag", tag) as this exact
        // query-string shape. Using "development" here (not "preview" or
        // "production") proves the filter tracks the resolved tag, not a
        // hardcoded literal anywhere in the route.
        expect(capturedUrls[0]).toContain("environment_tag=eq.development");
      } finally {
        restore();
      }
    });
  });

  test("Sprint 166D-2C — a different resolved environment_tag produces a different filter value (never the same literal)", async () => {
    const capturedUrls: string[] = [];
    await withEnv({ ...BASE_ENV, SUPABASE_ENVIRONMENT_TAG: "preview" }, async () => {
      const restore = mockFetch(mockAuthedAdmin([], capturedUrls));
      try {
        await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
      } finally {
        restore();
      }
    });
    expect(capturedUrls[0]).toContain("environment_tag=eq.preview");
    expect(capturedUrls[0]).not.toContain("environment_tag=eq.development");
  });

  test("retryInfoNote is always the honest 'no data' sentence, never fabricated", async () => {
    await withEnv({ ...BASE_ENV, SUPABASE_ENVIRONMENT_TAG: "preview" }, async () => {
      const restore = mockFetch(mockAuthedAdmin([closedRow({ outcome: "success" })]));
      try {
        const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
        const body = await res.json();
        expect(body.status.runHistory.retryInfoNote).toBe("Brak danych o zaplanowanej kolejnej próbie.");
      } finally {
        restore();
      }
    });
  });

  test("response never contains error_summary or any raw diagnostic text, even when the run failed", async () => {
    await withEnv({ ...BASE_ENV, SUPABASE_ENVIRONMENT_TAG: "preview" }, async () => {
      const restore = mockFetch(mockAuthedAdmin([closedRow({ outcome: "total_failure" })]));
      try {
        const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
        const body = await res.json();
        const serialized = JSON.stringify(body);
        expect(serialized).not.toMatch(/error_summary/i);
        expect(serialized).not.toMatch(/sources failed/i); // the historical error_summary text shape
      } finally {
        restore();
      }
    });
  });

  test("the route only ever performs a SELECT (with a server-side environment_tag filter) — no insert/update/delete/rpc call is ever made against scheduled_writer_runs", () => {
    const routeSource = readFileSync(
      join(process.cwd(), "src/app/api/admin/automation-status/route.ts"),
      "utf-8"
    );
    expect(routeSource).toMatch(/\.select\(/);
    expect(routeSource).toMatch(/\.eq\(\s*["']environment_tag["']\s*,\s*environmentTag\s*\)/);
    expect(routeSource).not.toMatch(/\.insert\(/);
    expect(routeSource).not.toMatch(/\.update\(/);
    expect(routeSource).not.toMatch(/\.delete\(/);
    expect(routeSource).not.toMatch(/\.rpc\(/);
    expect(routeSource).not.toMatch(/select\(\s*["']\*["']\s*\)/);
  });

  test("the environment_tag filter never uses a hardcoded 'preview'/'production' literal in the route source", () => {
    const routeSource = readFileSync(
      join(process.cwd(), "src/app/api/admin/automation-status/route.ts"),
      "utf-8"
    );
    expect(routeSource).not.toMatch(/\.eq\(\s*["']environment_tag["']\s*,\s*["'](preview|production)["']\s*\)/);
  });
});
