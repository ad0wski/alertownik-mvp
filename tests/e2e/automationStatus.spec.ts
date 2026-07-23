import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { GET as automationStatusGet } from "@/app/api/admin/automation-status/route";
import {
  buildAutomationStatus,
  AUTOMATION_STATUS_NO_PUBLISH_NOTE,
  AUTOMATION_STATUS_INFO_ONLY_NOTE,
} from "@/lib/automationStatus";

/**
 * Sprint 164B — Safe Auto-Candidate Canary Foundation.
 *
 * Two layers under test, matching this codebase's existing split (see
 * tests/e2e/linkHealthRoute.spec.ts / linkHealthCheck.spec.ts for the same
 * pattern):
 *   1. buildAutomationStatus() — pure function, every input combination,
 *      no network/env involved.
 *   2. GET /api/admin/automation-status — the admin-auth gate itself,
 *      reusing the exact same requireAdminSession mocking pattern already
 *      proven for /api/admin/link-health.
 */

// ── Pure builder ──────────────────────────────────────────────────────────

test.describe("buildAutomationStatus — pure snapshot builder", () => {
  test("both switches off → writeAttemptsPossible is false even with everything else configured", () => {
    const status = buildAutomationStatus({
      checksEnabled: false,
      writesEnabled: false,
      cronSecretConfigured: true,
      writerCredentialsConfigured: true,
      allowedWriteSourceIds: ["michalowice-komunikaty"],
      maxCandidatesPerRun: 1,
      fingerprintProtectionEnabled: false,
    });
    expect(status.checksEnabled).toBe(false);
    expect(status.writesEnabled).toBe(false);
    expect(status.writeAttemptsPossible).toBe(false);
  });

  test("checks on, writes off → writeAttemptsPossible still false (both gates required)", () => {
    const status = buildAutomationStatus({
      checksEnabled: true,
      writesEnabled: false,
      cronSecretConfigured: true,
      writerCredentialsConfigured: true,
      allowedWriteSourceIds: ["michalowice-komunikaty"],
      maxCandidatesPerRun: 1,
      fingerprintProtectionEnabled: false,
    });
    expect(status.writeAttemptsPossible).toBe(false);
  });

  test("all four gates true → writeAttemptsPossible is true", () => {
    const status = buildAutomationStatus({
      checksEnabled: true,
      writesEnabled: true,
      cronSecretConfigured: true,
      writerCredentialsConfigured: true,
      allowedWriteSourceIds: ["michalowice-komunikaty"],
      maxCandidatesPerRun: 1,
      fingerprintProtectionEnabled: false,
    });
    expect(status.writeAttemptsPossible).toBe(true);
  });

  test("missing CRON_SECRET alone is enough to keep writeAttemptsPossible false", () => {
    const status = buildAutomationStatus({
      checksEnabled: true,
      writesEnabled: true,
      cronSecretConfigured: false,
      writerCredentialsConfigured: true,
      allowedWriteSourceIds: ["michalowice-komunikaty"],
      maxCandidatesPerRun: 1,
      fingerprintProtectionEnabled: false,
    });
    expect(status.writeAttemptsPossible).toBe(false);
  });

  test("missing writer credentials alone is enough to keep writeAttemptsPossible false", () => {
    const status = buildAutomationStatus({
      checksEnabled: true,
      writesEnabled: true,
      cronSecretConfigured: true,
      writerCredentialsConfigured: false,
      allowedWriteSourceIds: ["michalowice-komunikaty"],
      maxCandidatesPerRun: 1,
      fingerprintProtectionEnabled: false,
    });
    expect(status.writeAttemptsPossible).toBe(false);
  });

  test("exactly one allowed source id → isSingleSourceCanary is true, and it resolves to the real Michałowice source name", () => {
    const status = buildAutomationStatus({
      checksEnabled: false,
      writesEnabled: false,
      cronSecretConfigured: false,
      writerCredentialsConfigured: false,
      allowedWriteSourceIds: ["michalowice-komunikaty"],
      maxCandidatesPerRun: 1,
      fingerprintProtectionEnabled: false,
    });
    expect(status.isSingleSourceCanary).toBe(true);
    expect(status.canarySources).toHaveLength(1);
    expect(status.canarySources[0].id).toBe("michalowice-komunikaty");
    expect(status.canarySources[0].name.length).toBeGreaterThan(0);
  });

  test("zero allowed source ids → isSingleSourceCanary is false, canarySources is empty (never throws)", () => {
    const status = buildAutomationStatus({
      checksEnabled: false,
      writesEnabled: false,
      cronSecretConfigured: false,
      writerCredentialsConfigured: false,
      allowedWriteSourceIds: [],
      maxCandidatesPerRun: 1,
      fingerprintProtectionEnabled: false,
    });
    expect(status.isSingleSourceCanary).toBe(false);
    expect(status.canarySources).toHaveLength(0);
  });

  test("two allowed source ids → isSingleSourceCanary is false (not a canary anymore, surfaced honestly)", () => {
    const status = buildAutomationStatus({
      checksEnabled: false,
      writesEnabled: false,
      cronSecretConfigured: false,
      writerCredentialsConfigured: false,
      allowedWriteSourceIds: ["michalowice-komunikaty", "wkd-aktualnosci"],
      maxCandidatesPerRun: 1,
      fingerprintProtectionEnabled: false,
    });
    expect(status.isSingleSourceCanary).toBe(false);
    expect(status.canarySources).toHaveLength(2);
  });

  test("an unknown source id falls back to its raw id as the display name, never throws", () => {
    const status = buildAutomationStatus({
      checksEnabled: false,
      writesEnabled: false,
      cronSecretConfigured: false,
      writerCredentialsConfigured: false,
      allowedWriteSourceIds: ["not-a-real-source-id"],
      maxCandidatesPerRun: 1,
      fingerprintProtectionEnabled: false,
    });
    expect(status.canarySources[0]).toEqual({ id: "not-a-real-source-id", name: "not-a-real-source-id" });
  });

  test("maxCandidatesPerRun and fingerprintProtectionEnabled pass through unchanged", () => {
    const status = buildAutomationStatus({
      checksEnabled: false,
      writesEnabled: false,
      cronSecretConfigured: false,
      writerCredentialsConfigured: false,
      allowedWriteSourceIds: [],
      maxCandidatesPerRun: 3,
      fingerprintProtectionEnabled: true,
    });
    expect(status.maxCandidatesPerRun).toBe(3);
    expect(status.fingerprintProtectionEnabled).toBe(true);
  });

  test("no field in the input or output can carry a secret value — every field is boolean, number, or a public source id/name", () => {
    const status = buildAutomationStatus({
      checksEnabled: true,
      writesEnabled: true,
      cronSecretConfigured: true,
      writerCredentialsConfigured: true,
      allowedWriteSourceIds: ["michalowice-komunikaty"],
      maxCandidatesPerRun: 1,
      fingerprintProtectionEnabled: false,
    });
    for (const [key, value] of Object.entries(status)) {
      // canarySources: array of {id, name} — public source identifiers.
      // runHistory (Sprint 166D-2B) and emailAlertConfig (Sprint 166E-1):
      // nested objects, checked separately below for the same "no secret
      // value" guarantee.
      if (key === "canarySources" || key === "runHistory" || key === "emailAlertConfig") continue;
      expect(["boolean", "number"]).toContain(typeof value);
    }
    // runHistory defaults to the "not configured" shape when omitted from
    // the input (as here) — still no field that could ever carry a secret.
    expect(status.runHistory.configured).toBe(false);
    expect(status.runHistory.lastClosedRun).toBeNull();
    expect(status.runHistory.openRun).toBeNull();
    expect(typeof status.runHistory.retryInfoNote).toBe("string");
    // emailAlertConfig defaults to fully-disabled/unconfigured when omitted
    // — every field is a boolean or a closed-set provider string, never a
    // key, address, or any other credential.
    expect(status.emailAlertConfig.enabled).toBe(false);
    expect(status.emailAlertConfig.configuredProvider).toBe("none");
    expect(status.emailAlertConfig.activeProvider).toBe("none");
    expect(status.emailAlertConfig.configComplete).toBe(false);
  });
});

// ── Route auth gate ───────────────────────────────────────────────────────

const FAKE_URL = "https://fake-test-project.supabase.co";
const FAKE_KEY = "fake-test-anon-key-not-a-real-value";

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

const SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: FAKE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_KEY,
  // Sprint 166D-2B: explicitly cleared so these existing tests stay
  // deterministic regardless of ambient environment — with this unset,
  // the new run-history read in the route is never attempted, matching
  // these tests' existing expectations (mockAuthedAdmin() below throws on
  // any unexpected fetch, which would include an accidental
  // scheduled_writer_runs query if this were left ambient-dependent).
  SUPABASE_ENVIRONMENT_TAG: undefined,
  // Sprint 166E-1: explicitly cleared for the same determinism reason —
  // existing tests in this file don't expect email-alert config in their
  // assertions and shouldn't start failing if ambient env ever sets these.
  OPERATIONAL_EMAIL_ALERTS_ENABLED: undefined,
  RESEND_API_KEY: undefined,
  OPERATIONAL_ALERT_EMAIL_FROM: undefined,
  OPERATIONAL_ALERT_EMAIL_TO: undefined,
};

function unauthedRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/automation-status", { method: "GET" });
}

function authedRequest(token: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/automation-status", {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
}

function mockAuthedNonAdmin() {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "signed-in-non-admin", aud: "authenticated" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/admin_profiles")) {
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected fetch to ${url} — a non-admin session must never reach automation status`);
  };
}

function mockAuthedAdmin() {
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
    throw new Error(`unexpected fetch to ${url}`);
  };
}

test.describe("GET /api/admin/automation-status — requires admin session", () => {
  test("unauthenticated request → 401, no status revealed", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const res = await automationStatusGet(unauthedRequest());
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });
  });

  test("a genuinely signed-in but non-admin session → 403, no status revealed", async () => {
    await withEnv(SUPABASE_ENV, async () => {
      const restore = mockFetch(mockAuthedNonAdmin());
      try {
        const res = await automationStatusGet(authedRequest("a-genuinely-valid-but-non-admin-token"));
        expect(res.status).toBe(403);
      } finally {
        restore();
      }
    });
  });
});

test.describe("GET /api/admin/automation-status — admin session, real environment untouched", () => {
  test("with both kill switches unset, the response reports both as disabled and reveals no secret values", async () => {
    await withEnv(
      {
        ...SUPABASE_ENV,
        SCHEDULED_CHECKS_ENABLED: undefined,
        SCHEDULED_WRITES_ENABLED: undefined,
        CRON_SECRET: undefined,
        SUPABASE_SCHEDULED_WRITER_EMAIL: undefined,
        SUPABASE_SCHEDULED_WRITER_PASSWORD: undefined,
      },
      async () => {
        const restore = mockFetch(mockAuthedAdmin());
        try {
          const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
          expect(res.status).toBe(200);
          const body = await res.json();
          expect(body.ok).toBe(true);
          expect(body.status.checksEnabled).toBe(false);
          expect(body.status.writesEnabled).toBe(false);
          expect(body.status.writeAttemptsPossible).toBe(false);
          expect(body.status.cronSecretConfigured).toBe(false);
          expect(body.status.writerCredentialsConfigured).toBe(false);
          // The default canary allowlist applies even with everything else unset.
          expect(body.status.isSingleSourceCanary).toBe(true);
          expect(body.status.canarySources[0].id).toBe("michalowice-komunikaty");
          // No field anywhere in the payload contains the literal secret values.
          const serialized = JSON.stringify(body);
          expect(serialized).not.toContain("CRON_SECRET");
          expect(serialized).not.toMatch(/@.*\..*password/i);
        } finally {
          restore();
        }
      }
    );
  });

  test("with real-looking secrets configured, the response still only reports booleans, never the values themselves", async () => {
    await withEnv(
      {
        ...SUPABASE_ENV,
        SCHEDULED_CHECKS_ENABLED: "true",
        SCHEDULED_WRITES_ENABLED: "true",
        CRON_SECRET: "super-secret-cron-token-should-never-appear",
        SUPABASE_SCHEDULED_WRITER_EMAIL: "writer@example.com",
        SUPABASE_SCHEDULED_WRITER_PASSWORD: "super-secret-writer-password-should-never-appear",
      },
      async () => {
        const restore = mockFetch(mockAuthedAdmin());
        try {
          const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
          const body = await res.json();
          expect(body.status.checksEnabled).toBe(true);
          expect(body.status.writesEnabled).toBe(true);
          expect(body.status.writeAttemptsPossible).toBe(true);
          expect(body.status.cronSecretConfigured).toBe(true);
          expect(body.status.writerCredentialsConfigured).toBe(true);
          const serialized = JSON.stringify(body);
          expect(serialized).not.toContain("super-secret-cron-token-should-never-appear");
          expect(serialized).not.toContain("super-secret-writer-password-should-never-appear");
          expect(serialized).not.toContain("writer@example.com");
        } finally {
          restore();
        }
      }
    );
  });

  test("Sprint 166E-1 — with a real-looking Resend API key and addresses configured, the response reports only booleans/provider, never the key or addresses", async () => {
    await withEnv(
      {
        ...SUPABASE_ENV,
        OPERATIONAL_EMAIL_ALERTS_ENABLED: "true",
        RESEND_API_KEY: "re_super_secret_test_key_should_never_appear",
        OPERATIONAL_ALERT_EMAIL_FROM: "alerts-from@example-should-not-appear.test",
        OPERATIONAL_ALERT_EMAIL_TO: "admin-to@example-should-not-appear.test",
      },
      async () => {
        const restore = mockFetch(mockAuthedAdmin());
        try {
          const res = await automationStatusGet(authedRequest("a-genuinely-valid-admin-token"));
          const body = await res.json();
          expect(body.status.emailAlertConfig.enabled).toBe(true);
          expect(body.status.emailAlertConfig.configuredProvider).toBe("resend");
          expect(body.status.emailAlertConfig.activeProvider).toBe("resend");
          expect(body.status.emailAlertConfig.configComplete).toBe(true);
          const serialized = JSON.stringify(body);
          expect(serialized).not.toContain("re_super_secret_test_key_should_never_appear");
          expect(serialized).not.toContain("alerts-from@example-should-not-appear.test");
          expect(serialized).not.toContain("admin-to@example-should-not-appear.test");
        } finally {
          restore();
        }
      }
    );
  });
});

// ── Panel copy anti-drift ────────────────────────────────────────────────

test.describe("Automation status panel copy — anti-drift (no promise of automation that doesn't exist)", () => {
  test("no-publish note is unambiguous about pending-only, single-candidate, never publish/edit/archive", () => {
    expect(AUTOMATION_STATUS_NO_PUBLISH_NOTE).toMatch(/nigdy nie publikuje/i);
    expect(AUTOMATION_STATUS_NO_PUBLISH_NOTE).toMatch(/pending/);
    expect(AUTOMATION_STATUS_NO_PUBLISH_NOTE).toMatch(/jednego nowego/);
  });

  test("info-only note explicitly says there is no activation button on this panel", () => {
    expect(AUTOMATION_STATUS_INFO_ONLY_NOTE).toMatch(/bez przycisku|nie ma tu przycisku/i);
  });
});

// ── Panel structural audit — no activation control, no server-only import ──

test.describe("AutomationStatusPanel.tsx — structural audit", () => {
  const panelSource = readFileSync(
    join(process.cwd(), "src/components/AutomationStatusPanel.tsx"),
    "utf-8"
  );

  test("is a Client Component (safe to bundle — never imports scheduledWriter.ts or admin credentials directly)", () => {
    expect(panelSource).toMatch(/^\s*["']use client["']/);
    expect(panelSource).not.toMatch(/from ["']@\/lib\/scheduledWriter["']/);
    expect(panelSource).not.toMatch(/SUPABASE_SCHEDULED_WRITER_(EMAIL|PASSWORD)/);
    expect(panelSource).not.toMatch(/service_role/i);
  });

  test("the only activation control is the Sprint 166E-2A Preview-only, confirm()-gated email test button — no other onClick exists", () => {
    // Every other admin panel with a real action (LinkHealthPanel's check
    // button, the Kreator publish button) uses onClick — before Sprint
    // 166E-2A this panel had none at all. It now has EXACTLY one, guarded
    // on every axis a real activation control needs to be guarded on:
    // rendered only when the client build's own environment identity is
    // "preview" (isPreview), disabled unless email alerts are enabled,
    // disabled while a request is in flight, and never fired without an
    // explicit confirm() first. This test pins that there is still only
    // ONE onClick in the whole file — a second one appearing here
    // unreviewed would be a real regression this test exists to catch.
    const onClickMatches = panelSource.match(/onClick/g) ?? [];
    expect(onClickMatches.length).toBe(1);
    expect(panelSource).toMatch(/onClick=\{runOperationalEmailTest\}/);
    expect(panelSource).toMatch(/confirm\(OPERATIONAL_EMAIL_TEST_CONFIRM_MESSAGE\)/);
    expect(panelSource).toMatch(/isPreview\s*&&/);
  });

  test("performs a GET fetch to its own status endpoint, and the only POST is the guarded, confirm()-gated Preview email test — never PUT/DELETE", () => {
    expect(panelSource).toMatch(/\/api\/admin\/automation-status/);
    // Sprint 166E-2A: exactly one POST call exists, to the dedicated,
    // admin-only, Preview-only, flag-gated test endpoint — never to the
    // status endpoint itself, and reachable only via the single onClick
    // asserted above (which itself requires confirm() first).
    expect(panelSource).toMatch(/\/api\/admin\/operational-email-test/);
    expect(panelSource).toMatch(/method:\s*["']POST["']/);
    expect(panelSource).not.toMatch(/method:\s*["']DELETE["']/);
    expect(panelSource).not.toMatch(/method:\s*["']PUT["']/);
  });
});
