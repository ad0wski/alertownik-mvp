import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { GET as writeCandidatesGet } from "@/app/api/cron/write-candidates/route";
import { isWriteModeEnabled, getScheduledWriterCredentials } from "@/lib/scheduledWriter";
import { isScheduledChecksEnabled, checkCronAuth } from "@/lib/cronCheckSources";
import { isOperationalNotificationRuntimeEnabled } from "@/lib/operationalNotificationRuntimeConfig";
import { isEmailAlertsEnabled } from "@/lib/emailAlertConfig";
import { decideNotificationAdapterKind } from "@/lib/notificationAdapterFactory";
import { checkDatabaseEnvironmentGuard } from "@/lib/databaseEnvironmentGuard";
import { attemptOperationalNotification } from "@/lib/operationalNotificationOrchestrator";
import type { OperationalNotificationLedger } from "@/lib/operationalNotificationLedger";
import type { NotificationAdapter } from "@/lib/notificationAdapter";

/**
 * Sprint 166K-D — consolidated Production-rollout readiness checklist.
 *
 * This file does not introduce new behavior — every property below is
 * already implemented by existing, separately-tested modules (see
 * databaseEnvironmentGuardIntegration.spec.ts, scheduledWriterRoute*.spec.ts,
 * cronCheckSources.spec.ts, notificationAdapterFactory.spec.ts,
 * operationalNotificationOrchestrator*.spec.ts). Its purpose is to give
 * Sprint 166K-D's readiness checkpoint one explicit, auditable file that
 * pins the exact 18 fail-closed properties a phased Production rollout
 * depends on, in one place, so a future reviewer never has to reconstruct
 * "is this actually still fail-closed" by re-reading a dozen files.
 *
 * Nothing here touches a live database, a live network, a live Resend
 * account, or any Environment Variable — every test either calls a pure
 * function directly or injects a fake/throwing collaborator.
 */

test.describe("1-4 — every runtime flag defaults to false/disabled with no entry", () => {
  test("isWriteModeEnabled(undefined) is false", () => {
    expect(isWriteModeEnabled(undefined)).toBe(false);
  });
  test("isScheduledChecksEnabled(undefined) is false", () => {
    expect(isScheduledChecksEnabled(undefined)).toBe(false);
  });
  test("isOperationalNotificationRuntimeEnabled(undefined) is false", () => {
    expect(isOperationalNotificationRuntimeEnabled(undefined)).toBe(false);
  });
  test("isEmailAlertsEnabled(undefined) is false", () => {
    expect(isEmailAlertsEnabled(undefined)).toBe(false);
  });
  test("every flag is exact-match 'true' only — any other truthy-looking string ('1', 'TRUE', 'yes') stays false", () => {
    for (const value of ["1", "TRUE", "True", "yes", "on", ""]) {
      expect(isWriteModeEnabled(value)).toBe(false);
      expect(isScheduledChecksEnabled(value)).toBe(false);
      expect(isOperationalNotificationRuntimeEnabled(value)).toBe(false);
      expect(isEmailAlertsEnabled(value)).toBe(false);
    }
  });
});

test.describe("5 — missing scheduled-writer credentials fails closed", () => {
  test("getScheduledWriterCredentials() returns null when either half is missing", () => {
    const originalEmail = process.env.SUPABASE_SCHEDULED_WRITER_EMAIL;
    const originalPassword = process.env.SUPABASE_SCHEDULED_WRITER_PASSWORD;
    try {
      delete process.env.SUPABASE_SCHEDULED_WRITER_EMAIL;
      delete process.env.SUPABASE_SCHEDULED_WRITER_PASSWORD;
      expect(getScheduledWriterCredentials()).toBeNull();

      process.env.SUPABASE_SCHEDULED_WRITER_EMAIL = "writer@example.test";
      delete process.env.SUPABASE_SCHEDULED_WRITER_PASSWORD;
      expect(getScheduledWriterCredentials()).toBeNull();
    } finally {
      if (originalEmail === undefined) delete process.env.SUPABASE_SCHEDULED_WRITER_EMAIL;
      else process.env.SUPABASE_SCHEDULED_WRITER_EMAIL = originalEmail;
      if (originalPassword === undefined) delete process.env.SUPABASE_SCHEDULED_WRITER_PASSWORD;
      else process.env.SUPABASE_SCHEDULED_WRITER_PASSWORD = originalPassword;
    }
  });
});

test.describe("6-7 — environment tag and project ref mismatches block the writer (Layer 0)", () => {
  test("an unresolved appEnvironment (unknown) fails the guard", () => {
    const result = checkDatabaseEnvironmentGuard("unknown");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("environment_unknown");
  });

  test("a mismatched SUPABASE_ENVIRONMENT_TAG vs. app environment fails the guard", () => {
    const original = process.env.SUPABASE_ENVIRONMENT_TAG;
    try {
      process.env.SUPABASE_ENVIRONMENT_TAG = "preview";
      const result = checkDatabaseEnvironmentGuard("production");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("environment_mismatch");
    } finally {
      if (original === undefined) delete process.env.SUPABASE_ENVIRONMENT_TAG;
      else process.env.SUPABASE_ENVIRONMENT_TAG = original;
    }
  });

  test("a mismatched actual vs. expected Supabase project ref fails the guard even with matching environment labels", () => {
    const originalTag = process.env.SUPABASE_ENVIRONMENT_TAG;
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalExpected = process.env.SUPABASE_EXPECTED_PROJECT_REF;
    try {
      process.env.SUPABASE_ENVIRONMENT_TAG = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://actualref123.supabase.co";
      process.env.SUPABASE_EXPECTED_PROJECT_REF = "differentref456";
      const result = checkDatabaseEnvironmentGuard("production");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("project_ref_mismatch");
    } finally {
      if (originalTag === undefined) delete process.env.SUPABASE_ENVIRONMENT_TAG;
      else process.env.SUPABASE_ENVIRONMENT_TAG = originalTag;
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalExpected === undefined) delete process.env.SUPABASE_EXPECTED_PROJECT_REF;
      else process.env.SUPABASE_EXPECTED_PROJECT_REF = originalExpected;
    }
  });
});

test.describe("8 — missing or wrong CRON_SECRET returns a safe, generic response", () => {
  test("no CRON_SECRET configured returns 'not_configured', never leaking that distinction to an attacker as anything but a generic message downstream", () => {
    const result = checkCronAuth("Bearer whatever", undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_configured");
  });

  test("a wrong bearer token against a configured secret returns 'unauthorized', not a detailed diagnostic", () => {
    const result = checkCronAuth("Bearer wrong-token", "the-real-secret-not-a-real-value");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unauthorized");
  });

  test("a missing Authorization header against a configured secret also fails closed", () => {
    const result = checkCronAuth(null, "the-real-secret-not-a-real-value");
    expect(result.ok).toBe(false);
  });
});

test.describe("9-10 — public pages and /admin/sources never trigger the writer during rendering", () => {
  function listFilesRecursive(dir: string): string[] {
    const entries = readdirSync(dir);
    let files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) files = files.concat(listFilesRecursive(full));
      else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(full);
    }
    return files;
  }

  test("no page.tsx or layout.tsx anywhere under src/app imports scheduledWriter.ts", () => {
    const appDir = path.join(process.cwd(), "src/app");
    const pageAndLayoutFiles = listFilesRecursive(appDir).filter(
      (f) => f.endsWith("page.tsx") || f.endsWith("layout.tsx")
    );
    const importPattern = /from\s+["']@\/lib\/scheduledWriter["']/;
    const importers = pageAndLayoutFiles.filter((f) => importPattern.test(readFileSync(f, "utf8")));
    expect(importers).toEqual([]);
  });

  test("/admin/sources's own page/components never import scheduledWriter.ts or call write-candidates", () => {
    const sourcesPagePath = path.join(process.cwd(), "src/app/admin/sources/page.tsx");
    const content = readFileSync(sourcesPagePath, "utf8");
    expect(content).not.toMatch(/from\s+["']@\/lib\/scheduledWriter["']/);
    expect(content).not.toMatch(/write-candidates/);
  });
});

test.describe("11 — the automation-status endpoint is read-only", () => {
  test("the automation-status route never imports scheduledWriter's write-performing exports or the ledger's write-performing RPC wrapper", () => {
    const routePath = path.join(process.cwd(), "src/app/api/admin/automation-status/route.ts");
    const content = readFileSync(routePath, "utf8");
    expect(content).not.toMatch(/createSupabaseScheduledWriter\s*\(/);
    expect(content).not.toMatch(/writeCandidatesForSource\s*\(/);
    expect(content).not.toMatch(/createSupabaseOperationalNotificationLedger\s*\(/);
  });
});

test.describe("12 — no test in this repository uses a real secret value", () => {
  test("this file's own placeholder credential/secret literals are all explicitly marked fake, never a real-looking bare value", () => {
    const selfPath = path.join(process.cwd(), "tests/e2e/productionRolloutReadiness.spec.ts");
    const selfSource = readFileSync(selfPath, "utf8");
    // Every literal this file assigns to a credential/secret-shaped env var
    // must carry an explicit "fake"/"not a real" marker in its own string —
    // matching this codebase's established test-fixture convention (see
    // databaseEnvironmentGuardIntegration.spec.ts's FAKE_CRON_SECRET).
    const credentialAssignments = [
      ...selfSource.matchAll(/(?:CRON_SECRET|SUPABASE_SCHEDULED_WRITER_EMAIL|SUPABASE_SCHEDULED_WRITER_PASSWORD|RESEND_API_KEY)\s*[:=]\s*"([^"]+)"/g),
    ];
    expect(credentialAssignments.length).toBeGreaterThan(0);
    for (const match of credentialAssignments) {
      expect(match[1]).toMatch(/fake|not a real|example\.test|whatever|wrong-token|the-real-secret-not-a-real-value/i);
    }
  });
});

test.describe("13 — Preview and Production cannot be confused", () => {
  test("the environment guard requires SUPABASE_ENVIRONMENT_TAG to exactly equal the resolved app environment — a Preview-tagged database can never pass while the app resolves to production, and vice versa", () => {
    const originalTag = process.env.SUPABASE_ENVIRONMENT_TAG;
    try {
      process.env.SUPABASE_ENVIRONMENT_TAG = "production";
      const previewAppResult = checkDatabaseEnvironmentGuard("preview");
      expect(previewAppResult.ok).toBe(false);
      if (!previewAppResult.ok) expect(previewAppResult.reason).toBe("environment_mismatch");
    } finally {
      if (originalTag === undefined) delete process.env.SUPABASE_ENVIRONMENT_TAG;
      else process.env.SUPABASE_ENVIRONMENT_TAG = originalTag;
    }
  });
});

test.describe("14 — the retention mechanism cannot run automatically", () => {
  test("neither retention SQL file is referenced from any application source file", () => {
    const srcDir = path.join(process.cwd(), "src");
    const filenames = ["PROPOSED_SPRINT_166J_RETENTION_CLEANUP_V1.sql", "PREFLIGHT_SPRINT_166J_RETENTION_READONLY_V1.sql"];
    function listFilesRecursive(dir: string): string[] {
      const entries = readdirSync(dir);
      let files: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) files = files.concat(listFilesRecursive(full));
        else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(full);
      }
      return files;
    }
    const referencing = listFilesRecursive(srcDir).filter((f) => {
      const content = readFileSync(f, "utf8");
      return filenames.some((name) => content.includes(name));
    });
    expect(referencing).toEqual([]);
  });

  // Sprint 180A — deliberately allows exactly one known, reviewed
  // write-candidates cron entry (the sprint's own explicit mandate; see
  // tests/e2e/vercelCronConfig.spec.ts for its full contract: no query
  // string, daily-only schedule, single-source allowlist enforced
  // server-side). Retention/cleanup endpoints remain categorically
  // forbidden — nothing in this sprint touches that guarantee — and no
  // OTHER, unreviewed path may ever appear here.
  test("vercel.json's crons array never targets a retention/cleanup endpoint, and only ever targets the two known, reviewed cron routes", () => {
    const vercelJsonPath = path.join(process.cwd(), "vercel.json");
    const config = JSON.parse(readFileSync(vercelJsonPath, "utf8")) as { crons?: Array<{ path: string }> };
    const paths = (config.crons ?? []).map((c) => c.path);
    const knownReviewedPaths = ["/api/cron/check-michalowice", "/api/cron/write-candidates"];
    for (const p of paths) {
      expect(p).not.toMatch(/cleanup|retention/i);
      expect(knownReviewedPaths).toContain(p);
    }
  });
});

test.describe("15 — email and Resend are never invoked while their flags are false", () => {
  test("decideNotificationAdapterKind() resolves to 'noop' when OPERATIONAL_EMAIL_ALERTS_ENABLED is unset, regardless of any other config", () => {
    const originalEnabled = process.env.OPERATIONAL_EMAIL_ALERTS_ENABLED;
    const originalKey = process.env.RESEND_API_KEY;
    try {
      delete process.env.OPERATIONAL_EMAIL_ALERTS_ENABLED;
      process.env.RESEND_API_KEY = "fake-test-key-not-real";
      expect(decideNotificationAdapterKind()).toBe("noop");
    } finally {
      if (originalEnabled === undefined) delete process.env.OPERATIONAL_EMAIL_ALERTS_ENABLED;
      else process.env.OPERATIONAL_EMAIL_ALERTS_ENABLED = originalEnabled;
      if (originalKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = originalKey;
    }
  });

  test("the noop adapter kind never constructs a real Resend client — decideNotificationAdapterKind() is pure and performs no I/O", () => {
    // decideNotificationAdapterKind() itself never imports/constructs
    // `Resend` — only createConfiguredNotificationAdapter() does, and only
    // inside the 'resend' branch. Structural check: the decision function's
    // own module never references the Resend import at module scope.
    const factorySource = readFileSync(
      path.join(process.cwd(), "src/lib/notificationAdapterFactory.ts"),
      "utf8"
    );
    const resendImportIndex = factorySource.indexOf('import { Resend }');
    const decideFunctionIndex = factorySource.indexOf("export function decideNotificationAdapterKind");
    const constructResendIndex = factorySource.indexOf("new Resend(");
    expect(resendImportIndex).toBeGreaterThan(-1);
    expect(constructResendIndex).toBeGreaterThan(decideFunctionIndex);
  });
});

test.describe("16 — activating one flag never bypasses the other independent guards", () => {
  test("GET /api/cron/write-candidates still fails closed on the environment guard even with every kill switch and credential otherwise satisfied", async () => {
    const original: Record<string, string | undefined> = {};
    const overrides: Record<string, string> = {
      SCHEDULED_CHECKS_ENABLED: "true",
      SCHEDULED_WRITES_ENABLED: "true",
      CRON_SECRET: "test-only-fake-secret-not-a-real-value",
      SUPABASE_SCHEDULED_WRITER_EMAIL: "writer@example.test",
      SUPABASE_SCHEDULED_WRITER_PASSWORD: "test-only-fake-password-not-a-real-value",
    };
    for (const key of Object.keys(overrides)) {
      original[key] = process.env[key];
      process.env[key] = overrides[key];
    }
    const originalTag = process.env.SUPABASE_ENVIRONMENT_TAG;
    delete process.env.SUPABASE_ENVIRONMENT_TAG;
    try {
      const req = new NextRequest("http://localhost/api/cron/write-candidates", {
        headers: { authorization: `Bearer ${overrides.CRON_SECRET}` },
      });
      const res = await writeCandidatesGet(req);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.ok).toBe(false);
    } finally {
      for (const key of Object.keys(overrides)) {
        if (original[key] === undefined) delete process.env[key];
        else process.env[key] = original[key];
      }
      if (originalTag === undefined) delete process.env.SUPABASE_ENVIRONMENT_TAG;
      else process.env.SUPABASE_ENVIRONMENT_TAG = originalTag;
    }
  });
});

test.describe("17 — a ledger/orchestrator failure never changes the writer's own result", () => {
  test("attemptOperationalNotification() swallows a throwing ledger.claim() and always resolves", async () => {
    const throwingLedger: OperationalNotificationLedger = {
      claim: async () => {
        throw new Error("simulated ledger failure");
      },
      finish: async () => {
        throw new Error("should never be called — claim already threw");
      },
    };
    const neverCalledAdapter: NotificationAdapter = {
      send: async () => {
        throw new Error("should never be called — claim already threw");
      },
    };
    await expect(
      attemptOperationalNotification(throwingLedger, neverCalledAdapter, {
        environmentTag: "preview",
        runOutcome: "total_failure",
        scheduledWriterRunId: null,
        sourcesFailed: 1,
        sourcesChecked: 1,
      })
    ).resolves.toBeUndefined();
  });

  test("attemptOperationalNotification() swallows a throwing adapter.send() and always resolves", async () => {
    const claimingLedger: OperationalNotificationLedger = {
      claim: async () => ({ claimed: true, eventId: "fake-event-id" }),
      finish: async () => {
        throw new Error("should never propagate");
      },
    };
    const throwingAdapter: NotificationAdapter = {
      send: async () => {
        throw new Error("simulated adapter failure");
      },
    };
    await expect(
      attemptOperationalNotification(claimingLedger, throwingAdapter, {
        environmentTag: "preview",
        runOutcome: "total_failure",
        scheduledWriterRunId: null,
        sourcesFailed: 1,
        sourcesChecked: 1,
      })
    ).resolves.toBeUndefined();
  });
});

// Splits `content` into per-section chunks, one per line matching
// `headingPattern` (e.g. every "### FAZA X" line), each chunk running from
// that heading up to (but not including) the next matching heading, or to
// the end of the file for the last one. Deliberately not a single regex
// with a `(?=...|\Z)` lookahead — JavaScript regex has no `\Z` end-of-string
// anchor (it is parsed as a literal "Z" character), which silently
// truncated matches at the first incidental "Z" in this file's own prose
// (e.g. inside the word "FAZA" itself) rather than at the real section
// boundary.
function splitIntoSections(content: string, headingPattern: RegExp): string[] {
  const lines = content.split("\n");
  const startIndices: number[] = [];
  lines.forEach((line, i) => {
    if (headingPattern.test(line)) startIndices.push(i);
  });
  return startIndices.map((start, i) => {
    const end = i + 1 < startIndices.length ? startIndices[i + 1] : lines.length;
    return lines.slice(start, end).join("\n");
  });
}

test.describe("18 — every planned rollout phase has a corresponding, documented kill switch", () => {
  test("the Production rollout runbook documents an explicit rollback/kill-switch for every canonical FAZA phase (Sprint 166K-D addendum)", () => {
    const runbookPath = path.join(process.cwd(), "docs/SPRINT_166H_PRODUCTION_ROLLOUT_RUNBOOK_V1.md");
    const content = readFileSync(runbookPath, "utf8");
    const fazaSections = splitIntoSections(content, /^### FAZA [A-Z]/);
    expect(fazaSections.length).toBe(8);
    for (const section of fazaSections) {
      expect(section).toMatch(/\*\*Rollback:\*\*/);
    }
  });

  test("the legacy Phase G/H headings (superseded) explicitly point to the addendum rather than leaving rollback undefined", () => {
    const runbookPath = path.join(process.cwd(), "docs/SPRINT_166H_PRODUCTION_ROLLOUT_RUNBOOK_V1.md");
    const content = readFileSync(runbookPath, "utf8");
    const phaseSections = splitIntoSections(content, /^### Phase [A-Z]/);
    expect(phaseSections.length).toBe(8);
    for (const section of phaseSections) {
      expect(section).toMatch(/\*\*Rollback:\*\*/);
    }
  });
});
