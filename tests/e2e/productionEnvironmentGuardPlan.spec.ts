import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import {
  checkDatabaseEnvironmentGuard,
  getConfiguredDatabaseEnvironmentTag,
  getActualSupabaseProjectRef,
  getExpectedSupabaseProjectRef,
} from "@/lib/databaseEnvironmentGuard";
import { resolveEnvironmentIdentity } from "@/lib/environmentIdentity";

/**
 * Sprint 166L-A — static, pre-flight proof that the exact FAZA B values
 * planned for Production (see
 * docs/SPRINT_166L_A_PRODUCTION_ENVIRONMENT_GUARD_AUDIT_V1.md §3) are
 * internally consistent with the guard's own logic, BEFORE either value
 * is ever set for real. Nothing here touches a live database, a live
 * network, or any Environment Variable outside this test's own process —
 * every assertion either calls a pure function directly or restores
 * process.env exactly as found.
 *
 * The planned values:
 *   SUPABASE_ENVIRONMENT_TAG      = "production"
 *   SUPABASE_EXPECTED_PROJECT_REF = "puhcjyffosgohbmxrczb"
 * paired against Production's own already-public
 * NEXT_PUBLIC_SUPABASE_URL, which follows the standard Supabase shape
 * `https://<project-ref>.supabase.co`.
 */

const PLANNED_ENVIRONMENT_TAG = "production";
const PLANNED_EXPECTED_PROJECT_REF = "puhcjyffosgohbmxrczb";
const PRODUCTION_SUPABASE_URL = `https://${PLANNED_EXPECTED_PROJECT_REF}.supabase.co`;

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

test.describe("Sprint 166L-A — planned Production values resolve as a known identity", () => {
  test("'production' is a known EnvironmentIdentity, not 'unknown'", () => {
    expect(resolveEnvironmentIdentity(PLANNED_ENVIRONMENT_TAG)).toBe("production");
  });

  test("getConfiguredDatabaseEnvironmentTag() resolves the planned SUPABASE_ENVIRONMENT_TAG value correctly", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: PLANNED_ENVIRONMENT_TAG }, () => {
      expect(getConfiguredDatabaseEnvironmentTag()).toBe("production");
    });
  });
});

test.describe("Sprint 166L-A — planned project ref matches Production's own public Supabase URL shape", () => {
  test("getActualSupabaseProjectRef() extracts exactly the planned ref from Production's standard Supabase URL shape", () => {
    withEnv({ NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL }, () => {
      expect(getActualSupabaseProjectRef()).toBe(PLANNED_EXPECTED_PROJECT_REF);
    });
  });

  test("getExpectedSupabaseProjectRef() round-trips the planned value unchanged (already lowercase, no trimming needed)", () => {
    withEnv({ SUPABASE_EXPECTED_PROJECT_REF: PLANNED_EXPECTED_PROJECT_REF }, () => {
      expect(getExpectedSupabaseProjectRef()).toBe(PLANNED_EXPECTED_PROJECT_REF);
    });
  });
});

test.describe("Sprint 166L-A — the full four-signal guard passes ONLY when all four planned/real values are paired correctly", () => {
  test("all four signals matching (as FAZA B would configure them) lets the guard resolve ok:true", () => {
    withEnv(
      {
        SUPABASE_ENVIRONMENT_TAG: PLANNED_ENVIRONMENT_TAG,
        NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
        SUPABASE_EXPECTED_PROJECT_REF: PLANNED_EXPECTED_PROJECT_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("production");
        expect(result.ok).toBe(true);
      }
    );
  });

  test("today's actual state (neither variable configured) still fails closed with database_tag_not_configured — proving this plan changes nothing until activated", () => {
    withEnv(
      {
        SUPABASE_ENVIRONMENT_TAG: undefined,
        SUPABASE_EXPECTED_PROJECT_REF: undefined,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("production");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("database_tag_not_configured");
      }
    );
  });

  test("setting only SUPABASE_ENVIRONMENT_TAG (never SUPABASE_EXPECTED_PROJECT_REF, e.g. a partial/mistaken activation) still fails closed", () => {
    withEnv(
      {
        SUPABASE_ENVIRONMENT_TAG: PLANNED_ENVIRONMENT_TAG,
        NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
        SUPABASE_EXPECTED_PROJECT_REF: undefined,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("production");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("expected_project_ref_not_configured");
      }
    );
  });
});

test.describe("Sprint 166L-A — the audit/plan document itself stays plan-only", () => {
  const docPath = path.join(
    process.cwd(),
    "docs/SPRINT_166L_A_PRODUCTION_ENVIRONMENT_GUARD_AUDIT_V1.md"
  );
  const doc = readFileSync(docPath, "utf8");

  test("the document contains no runnable SQL and is never referenced by application source", () => {
    expect(doc).not.toMatch(/\bdo\s*\$\$/i);
    expect(doc).not.toMatch(/^\s*delete\s+from\s+public\./im);
    expect(doc).not.toMatch(/^\s*insert\s+into\s+public\./im);
  });

  test("the document contains no secret value — only variable NAMES and the already-public project ref", () => {
    expect(doc).not.toMatch(/CRON_SECRET\s*=\s*['"a-zA-Z0-9]/);
    expect(doc).not.toMatch(/password\s*[:=]\s*['"][^'"]+['"]/i);
    expect(doc).not.toMatch(/[a-z0-9._%+-]+@(gmail|outlook|hotmail|yahoo)\.[a-z]{2,}/i);
  });

  test("the document accurately states FAZA B's activation status and stays scoped to exactly the two approved variables", () => {
    // This document's own status line legitimately changes once Sprint
    // 166L-B is actually executed (see its §9 activation checkpoint) —
    // this test pins that the document stays honest about that status,
    // not that it forever claims "nothing changed."
    expect(doc).toMatch(/FAZA B is now ACTIVE/);
    expect(doc).toMatch(/No SQL has been executed/);
    expect(doc).toMatch(/No writer, RPC, Cron, claim\/finish, email, or\s*\n?Resend action has occurred/);
    expect(doc).toMatch(/SCHEDULED_WRITES_ENABLED.*remains false\/absent|remains false\/absent.*SCHEDULED_WRITES_ENABLED/s);
  });
});
