import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/write-candidates/route";
import {
  buildRunLevelNotificationInput,
  categoryForFailedSource,
} from "@/lib/scheduledWriterNotificationInput";
import { orchestrateRunLevelNotification } from "@/lib/operationalNotificationOrchestrator";
import { decideNotificationPolicy, buildNotificationEventDetails } from "@/lib/operationalNotificationPolicy";
import { buildAutomatedSourceCheckInsert, describeAutomatedFetchFailure } from "@/lib/scheduledWriter";
import { MAX_FETCH_ATTEMPTS, type FetchDiagnosticCode } from "@/lib/scheduledWriterRunSafety";
import type {
  OperationalNotificationLedger,
  ClaimNotificationEventInput,
  ClaimNotificationEventResult,
  FinishNotificationEventInput,
} from "@/lib/operationalNotificationLedger";
import type { NotificationAdapter, AlertNotificationInput } from "@/lib/notificationAdapter";

/**
 * POST-RELEASE-3B — monitoring hardening after the 2026-11-16 06:21 UTC
 * Production incident (one Michałowice timeout mailed as
 * "nieoczekiwany błąd"/critical, and the writer's failed source_checks
 * row rejected by RLS with 403). Pure fakes only — no real Supabase,
 * no real Resend, no real source fetch.
 */

// ── In-memory collaborators (same convention as
// operationalNotificationOrchestratorRunLevel.spec.ts) ──────────────────

function fakeLedger(claimResult: ClaimNotificationEventResult = { claimed: true, eventId: "fake-event-id" }) {
  const claimCalls: ClaimNotificationEventInput[] = [];
  const finishCalls: FinishNotificationEventInput[] = [];
  const ledger: OperationalNotificationLedger = {
    async claim(input) {
      claimCalls.push(input);
      return claimResult;
    },
    async finish(input) {
      finishCalls.push(input);
      return { ok: true };
    },
  };
  return { ledger, claimCalls, finishCalls };
}

function fakeAdapter() {
  const sendCalls: AlertNotificationInput[] = [];
  const adapter: NotificationAdapter = {
    async send(notification) {
      sendCalls.push(notification);
      return { ok: true, status: "sent" };
    },
  };
  return { adapter, sendCalls };
}

const RUN = {
  environmentTag: "production",
  scheduledWriterRunId: "fake-run-id",
  sourcesFailed: 1,
  sourcesChecked: 1,
};

// ── 1. Timeout of the only source → transient / warning, mailed at once ──

test.describe("1. sole-source timeout", () => {
  test("classifies as transient_fetch with the in-run retry already exhausted", () => {
    const input = buildRunLevelNotificationInput("total_failure", [{ outcome: "timeout", diagnostic: "timeout_10s" }]);
    expect(input).toEqual({ category: "transient_fetch", isAbandonedRun: false, attemptsMade: MAX_FETCH_ATTEMPTS });
    const details = buildNotificationEventDetails(input.category, input.attemptsMade, input.isAbandonedRun);
    expect(details.severity).toBe("warning");
    expect(details.eventType).toBe("transient_fetch");
    expect(details.retry.willRetryWithinRun).toBe(false);
  });

  test("is notified on the FIRST occurrence (not suppressed as retry-pending)", async () => {
    const { ledger, claimCalls, finishCalls } = fakeLedger();
    const { adapter, sendCalls } = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, {
      ...RUN,
      runOutcome: "total_failure",
      sourceFailures: [{ outcome: "timeout", diagnostic: "timeout_10s" }],
    });
    expect(claimCalls).toHaveLength(1);
    expect(claimCalls[0].eventType).toBe("transient_fetch");
    expect(claimCalls[0].severity).toBe("warning");
    expect(claimCalls[0].fingerprint).toBe("production:run:transient_fetch");
    expect(claimCalls[0].safeSummary).toBe("chwilowy błąd pobierania — 1/1 źródeł nieudanych");
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].subject).toBe("Alertownik — chwilowy błąd pobierania");
    expect(sendCalls[0].subject).not.toContain("nieoczekiwany");
    expect(finishCalls).toHaveLength(1);
  });
});

// ── 2. Retryable network / 5xx → warning ────────────────────────────────

test.describe("2. retryable network / 5xx failures", () => {
  for (const failure of [
    { outcome: "fetch_error", diagnostic: "network_error" },
    { outcome: "fetch_error", diagnostic: "http_5xx" },
  ]) {
    test(`${failure.diagnostic} → transient_fetch / warning`, () => {
      const input = buildRunLevelNotificationInput("total_failure", [failure]);
      expect(input.category).toBe("transient_fetch");
      expect(buildNotificationEventDetails(input.category, input.attemptsMade, false).severity).toBe("warning");
    });
  }

  test("partial_failure with only a transient failing source is still warning", () => {
    const input = buildRunLevelNotificationInput("partial_failure", [{ outcome: "fetch_error", diagnostic: "http_5xx" }]);
    expect(input.category).toBe("transient_fetch");
  });
});

// ── 3. Genuinely unexpected errors → critical ───────────────────────────

test.describe("3. unexpected errors stay critical", () => {
  test("route catch-all (write_error + diagnostic unexpected_error) → unexpected_error", () => {
    expect(categoryForFailedSource({ outcome: "write_error", diagnostic: "unexpected_error" })).toBe("unexpected_error");
  });

  test("unknown outcome, or fetch failure with no/unknown diagnostic → unexpected_error (fail closed)", () => {
    expect(categoryForFailedSource({ outcome: "something_new" })).toBe("unexpected_error");
    expect(categoryForFailedSource({ outcome: "fetch_error" })).toBe("unexpected_error");
    expect(categoryForFailedSource({ outcome: "timeout", diagnostic: "made_up" })).toBe("unexpected_error");
  });

  test("top-level route failure (no per-source data) keeps the old unexpected_error/critical", () => {
    const input = buildRunLevelNotificationInput("total_failure");
    expect(input.category).toBe("unexpected_error");
    expect(buildNotificationEventDetails(input.category, input.attemptsMade, false).severity).toBe("critical");
  });

  test("one unexpected source among transient ones escalates the whole run to unexpected_error", () => {
    const input = buildRunLevelNotificationInput("total_failure", [
      { outcome: "timeout", diagnostic: "timeout_10s" },
      { outcome: "write_error", diagnostic: "unexpected_error" },
    ]);
    expect(input.category).toBe("unexpected_error");
  });

  test("orchestrator mails unexpected_error as critical with the old wording", async () => {
    const { ledger, claimCalls } = fakeLedger();
    const { adapter, sendCalls } = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, { ...RUN, runOutcome: "total_failure" });
    expect(claimCalls[0].severity).toBe("critical");
    expect(claimCalls[0].eventType).toBe("unexpected_error");
    expect(sendCalls[0].subject).toBe("Alertownik — nieoczekiwany błąd");
  });
});

// ── 4. Write / permanent failures stay serious ──────────────────────────

test.describe("4. write and permanent failures", () => {
  test("write_error → write_error / critical", () => {
    const input = buildRunLevelNotificationInput("total_failure", [{ outcome: "write_error" }]);
    expect(input.category).toBe("write_error");
    expect(buildNotificationEventDetails(input.category, input.attemptsMade, false).severity).toBe("critical");
  });

  test("write_error outranks a transient failure in the same run", () => {
    const input = buildRunLevelNotificationInput("total_failure", [
      { outcome: "timeout", diagnostic: "timeout_10s" },
      { outcome: "write_error" },
    ]);
    expect(input.category).toBe("write_error");
  });

  for (const diagnostic of ["http_4xx", "non_html_content_type", "parse_exception"] as const) {
    test(`${diagnostic} → permanent_fetch / critical (source likely changed)`, () => {
      const input = buildRunLevelNotificationInput("total_failure", [{ outcome: "fetch_error", diagnostic }]);
      expect(input.category).toBe("permanent_fetch");
      expect(buildNotificationEventDetails(input.category, input.attemptsMade, false).severity).toBe("critical");
    });
  }
});

// ── 5. Success → no alarm ───────────────────────────────────────────────

test.describe("5. success", () => {
  test("success → category none, no claim, no mail (no 'recovered' mail exists)", async () => {
    expect(buildRunLevelNotificationInput("success", []).category).toBe("none");
    const { ledger, claimCalls } = fakeLedger();
    const { adapter, sendCalls } = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, { ...RUN, sourcesFailed: 0, runOutcome: "success" });
    expect(claimCalls).toHaveLength(0);
    expect(sendCalls).toHaveLength(0);
  });
});

// ── 6. Cooldown / dedupe unchanged ──────────────────────────────────────

test.describe("6. cooldown and dedupe still apply", () => {
  test("a repeated transient failure inside the cooldown window is suppressed by policy", () => {
    const now = new Date("2026-11-16T09:00:00Z");
    const decision = decideNotificationPolicy({
      category: "transient_fetch",
      retry: buildNotificationEventDetails("transient_fetch", MAX_FETCH_ATTEMPTS, false).retry,
      isAbandonedRun: false,
      lastAlertSentAt: "2026-11-16T06:21:33Z",
      now,
    });
    expect(decision).toBe("suppress_cooldown");
  });

  test("a ledger claim refused as duplicate/cooldown sends nothing", async () => {
    const { ledger, claimCalls, finishCalls } = fakeLedger({ claimed: false, suppressedReason: "suppress_cooldown" });
    const { adapter, sendCalls } = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, {
      ...RUN,
      runOutcome: "total_failure",
      sourceFailures: [{ outcome: "timeout", diagnostic: "timeout_10s" }],
    });
    expect(claimCalls).toHaveLength(1);
    expect(sendCalls).toHaveLength(0);
    expect(finishCalls).toHaveLength(0);
  });

  test("transient and unexpected events use distinct, stable fingerprints", async () => {
    const a = fakeLedger();
    await orchestrateRunLevelNotification(a.ledger, fakeAdapter().adapter, {
      ...RUN,
      runOutcome: "total_failure",
      sourceFailures: [{ outcome: "timeout", diagnostic: "timeout_10s" }],
    });
    const b = fakeLedger();
    await orchestrateRunLevelNotification(b.ledger, fakeAdapter().adapter, { ...RUN, runOutcome: "total_failure" });
    expect(a.claimCalls[0].fingerprint).toBe("production:run:transient_fetch");
    expect(b.claimCalls[0].fingerprint).toBe("production:run:unexpected_error");
  });
});

// ── Route-level wiring: the real GET handler passes real per-source causes ─

const FAKE_CRON_SECRET = "test-only-fake-secret-not-a-real-value";
const FAKE_EMAIL = "writer@example.test";
const GUARD_PASS_PROJECT_REF = "test-only-fake-project-ref";
const ROUTE_ENV: Record<string, string> = {
  VERCEL_ENV: "development",
  SUPABASE_ENVIRONMENT_TAG: "development",
  NEXT_PUBLIC_SUPABASE_URL: `https://${GUARD_PASS_PROJECT_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-only-fake-publishable-key",
  SUPABASE_EXPECTED_PROJECT_REF: GUARD_PASS_PROJECT_REF,
  SCHEDULED_CHECKS_ENABLED: "true",
  SCHEDULED_WRITES_ENABLED: "true",
  CRON_SECRET: FAKE_CRON_SECRET,
  SUPABASE_SCHEDULED_WRITER_EMAIL: FAKE_EMAIL,
  SUPABASE_SCHEDULED_WRITER_PASSWORD: "test-only-fake-password-not-a-real-value",
  OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED: "true",
};

async function runRouteWithSource(sourceBehavior: "network_error" | number) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(ROUTE_ENV)) {
    original[key] = process.env[key];
    process.env[key] = ROUTE_ENV[key];
  }
  const claimBodies: Record<string, unknown>[] = [];
  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("/auth/v1/token")) {
      return json({
        access_token: "fake-access-token",
        refresh_token: "fake-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "fake-writer-uuid", email: FAKE_EMAIL },
      });
    }
    if (url.includes("rpc/open_scheduled_writer_run") || url.includes("rpc/close_scheduled_writer_run")) return json(true);
    if (url.includes("rpc/claim_operational_notification_event")) {
      claimBodies.push(JSON.parse(String(init?.body)));
      return json([{ claimed: true, event_id: "fake-event-id", suppressed_reason: null }]);
    }
    if (url.includes("rpc/finish_operational_notification_event")) return json(true);
    if (url.includes("/rest/v1/source_checks")) return new Response("", { status: 201 });
    if (url.includes("michalowice.pl")) {
      if (sourceBehavior === "network_error") throw new TypeError("fetch failed");
      return new Response("error", { status: sourceBehavior });
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  }) as typeof fetch;
  try {
    const res = await GET(
      new NextRequest("http://localhost/api/cron/write-candidates?sourceKey=michalowice-komunikaty", {
        headers: { authorization: `Bearer ${FAKE_CRON_SECRET}` },
      })
    );
    return { status: res.status, claimBodies };
  } finally {
    global.fetch = originalFetch;
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test.describe("route wiring — GET /api/cron/write-candidates", () => {
  test("network error on the only source → claim is transient_fetch / warning", async () => {
    const { status, claimBodies } = await runRouteWithSource("network_error");
    expect(status).toBe(200);
    expect(claimBodies).toHaveLength(1);
    expect(claimBodies[0].p_event_type).toBe("transient_fetch");
    expect(claimBodies[0].p_severity).toBe("warning");
  });

  test("HTTP 503 on the only source → transient_fetch / warning", async () => {
    const { claimBodies } = await runRouteWithSource(503);
    expect(claimBodies[0].p_event_type).toBe("transient_fetch");
    expect(claimBodies[0].p_severity).toBe("warning");
  });

  test("HTTP 404 on the only source → permanent_fetch / critical", async () => {
    const { claimBodies } = await runRouteWithSource(404);
    expect(claimBodies[0].p_event_type).toBe("permanent_fetch");
    expect(claimBodies[0].p_severity).toBe("critical");
  });
});

// ── 7. RLS migration — static security regression ───────────────────────
//
// A behavioral RLS test needs a real Postgres (tests/sql harness = Docker),
// which this sprint deliberately does not start. These assertions pin the
// migration text and prove the app's own payloads satisfy it.

function readSql(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8").replace(/\r\n?/g, "\n");
}

/** Strips `--` comments so assertions only look at executable SQL. */
function executableSql(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

test.describe("7. failed source_checks RLS migration", () => {
  const forward = executableSql(readSql("docs/sql/PROPOSED_POST_RELEASE_3B_SCHEDULED_WRITER_FAILED_SOURCE_CHECKS_V1.sql"));
  const rollback = executableSql(readSql("docs/sql/ROLLBACK_POST_RELEASE_3B_SCHEDULED_WRITER_FAILED_SOURCE_CHECKS_V1.sql"));
  const verify = executableSql(
    readSql("docs/sql/VERIFY_POST_RELEASE_3B_SCHEDULED_WRITER_FAILED_SOURCE_CHECKS_READ_ONLY_V1.sql")
  );

  test("forward migration only ALTERs the one scheduled-writer INSERT policy, atomically", () => {
    expect(forward.trim().startsWith("begin;")).toBe(true);
    expect(forward.trim().endsWith("commit;")).toBe(true);
    expect(forward.match(/alter policy/g)).toHaveLength(1);
    expect(forward).toContain('alter policy "scheduled writer can insert automated source_checks" on public.source_checks');
  });

  test("forward migration stays scoped to authenticated + automation identity + self-attribution", () => {
    expect(forward).toContain("to authenticated");
    expect(forward).toContain("from public.automation_identities where automation_identities.user_id = auth.uid()");
    expect(forward).toContain("related_alert_id is null");
    expect(forward).toContain("created_by = auth.uid()");
  });

  test("'failed' is only allowed together with error_code and error_summary", () => {
    expect(forward).toMatch(
      /result = 'failed' and error_code is not null and error_summary is not null/
    );
    expect(forward).toContain("result = any (array['no_changes'::text, 'found_notice'::text])");
    expect(forward).not.toContain("alert_created");
    expect(forward).not.toContain("needs_followup");
  });

  test("no widening: no anon/public role, no grant, no RLS disable, no bypass, no service_role, no drop", () => {
    for (const sql of [forward, rollback]) {
      expect(sql).not.toMatch(/\bto (anon|public)\b/);
      expect(sql).not.toMatch(/\bgrant\b|\brevoke\b/);
      expect(sql).not.toMatch(/disable row level security|no force row level security/);
      expect(sql).not.toMatch(/bypassrls|security definer|service_role/);
      expect(sql).not.toMatch(/\bdrop\b|\bdelete\b|\btruncate\b|\binsert into\b|\bupdate public\./);
      expect(sql).not.toMatch(/using \(\s*true\s*\)|with check \(\s*true\s*\)/);
    }
  });

  test("rollback restores the exact pre-3B rule (no 'failed')", () => {
    expect(rollback).toContain('alter policy "scheduled writer can insert automated source_checks" on public.source_checks');
    expect(rollback).toContain("to authenticated");
    expect(rollback).toContain("result = any (array['no_changes'::text, 'found_notice'::text])");
    expect(rollback).not.toContain("'failed'");
  });

  test("verify script is read-only", () => {
    const withoutStringLiterals = verify.replace(/'(?:[^']|'')*'/g, "''");
    expect(withoutStringLiterals).not.toMatch(/\b(alter|create|drop|insert|update|delete|truncate|grant|revoke|begin|commit)\b/);
    const statements = withoutStringLiterals.split(";").map((s) => s.trim()).filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) expect(statement.startsWith("select ")).toBe(true);
  });

  test("every failed payload the writer builds satisfies the new rule (error_code + error_summary set)", () => {
    const diagnostics: FetchDiagnosticCode[] = [
      "http_4xx",
      "http_5xx",
      "non_html_content_type",
      "network_error",
      "timeout_10s",
      "parse_exception",
    ];
    for (const diagnostic of diagnostics) {
      const row = buildAutomatedSourceCheckInsert({
        sourceId: "fake-source-id",
        writerUserId: "fake-writer-uuid",
        result: "failed",
        errorCode: diagnostic,
        errorSummary: describeAutomatedFetchFailure(diagnostic),
      });
      expect(row.result).toBe("failed");
      expect(row.error_code).toBe(diagnostic);
      expect(row.error_summary).toBeTruthy();
      expect((row.error_summary as string).length).toBeLessThanOrEqual(200);
      expect(row.related_alert_id).toBeNull();
      expect(row.created_by).toBe("fake-writer-uuid");
    }
  });

  test("success payloads are unchanged (no error fields) and still match the old branch", () => {
    for (const result of ["no_changes", "found_notice"] as const) {
      const row = buildAutomatedSourceCheckInsert({ sourceId: "s", writerUserId: "u", result });
      expect(row.error_code).toBeNull();
      expect(row.error_summary).toBeNull();
    }
  });
});
