import { test, expect } from "@playwright/test";
import {
  checkDatabaseEnvironmentGuard,
  getConfiguredDatabaseEnvironmentTag,
  DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR,
} from "@/lib/databaseEnvironmentGuard";
import type { EnvironmentIdentity } from "@/lib/environmentIdentity";

/**
 * Sprint 165B — src/lib/databaseEnvironmentGuard.ts. These tests cover
 * every scenario from the Sprint 165A design doc's §E acceptance-test
 * list that can be verified without a real second Supabase project
 * (drift-protection at the decision-table level; the live cross-project
 * proof is deferred to a future sprint once that project exists — see
 * docs/SPRINT_165B_ISOLATED_PREVIEW_CODE_SAFETY_PACKAGE_V1.md).
 */

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

test.describe("checkDatabaseEnvironmentGuard — decision table", () => {
  test("§E.7 — no configuration at all: appEnvironment unknown, tag unset → blocked as environment_unknown", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: undefined }, () => {
      const result = checkDatabaseEnvironmentGuard("unknown");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("environment_unknown");
    });
  });

  test("§E.7 — known app environment but tag unset → blocked as database_tag_not_configured", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: undefined }, () => {
      const result = checkDatabaseEnvironmentGuard("production");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("database_tag_not_configured");
    });
  });

  test("§E.6 — an unrecognized tag value → blocked as database_tag_unknown", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: "staging" }, () => {
      const result = checkDatabaseEnvironmentGuard("production");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("database_tag_unknown");
    });
  });

  test("§E.3 — Preview app environment paired with a Production-tagged database → blocked as environment_mismatch", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: "production" }, () => {
      const result = checkDatabaseEnvironmentGuard("preview");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("environment_mismatch");
    });
  });

  test("§E.4 — Production app environment paired with a Preview-tagged database → blocked as environment_mismatch", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: "preview" }, () => {
      const result = checkDatabaseEnvironmentGuard("production");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("environment_mismatch");
    });
  });

  test("§E.5 — Development app environment without an explicit matching tag → blocked (no implicit write consent for local dev)", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: undefined }, () => {
      const result = checkDatabaseEnvironmentGuard("development");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("database_tag_not_configured");
    });
  });

  test("§E.1 — Production app environment + matching Production-tagged database → this gate passes", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: "production" }, () => {
      const result = checkDatabaseEnvironmentGuard("production");
      expect(result.ok).toBe(true);
    });
  });

  test("§E.2 — Preview app environment + matching Preview-tagged database → this gate passes", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: "preview" }, () => {
      const result = checkDatabaseEnvironmentGuard("preview");
      expect(result.ok).toBe(true);
    });
  });

  test("Development app environment + an explicitly matching Development-tagged database → this gate passes", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: "development" }, () => {
      const result = checkDatabaseEnvironmentGuard("development");
      expect(result.ok).toBe(true);
    });
  });

  const allIdentities: EnvironmentIdentity[] = ["production", "preview", "development", "unknown"];
  test("§E.6 — UNKNOWN app environment is blocked regardless of what the database tag says", () => {
    for (const tag of allIdentities) {
      withEnv({ SUPABASE_ENVIRONMENT_TAG: tag }, () => {
        const result = checkDatabaseEnvironmentGuard("unknown");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("environment_unknown");
      });
    }
  });

  test("passing this gate alone is not sufficient — it returns only { ok: true }, never a credential or connection detail a caller could act on directly", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: "production" }, () => {
      const result = checkDatabaseEnvironmentGuard("production");
      expect(Object.keys(result)).toEqual(["ok"]);
    });
  });
});

test.describe("getConfiguredDatabaseEnvironmentTag", () => {
  test("returns null when unset", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: undefined }, () => {
      expect(getConfiguredDatabaseEnvironmentTag()).toBeNull();
    });
  });

  test("returns the resolved identity, never the raw string, when set to a known value", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: "PRODUCTION" }, () => {
      expect(getConfiguredDatabaseEnvironmentTag()).toBe("production");
    });
  });

  test("returns 'unknown' (not null, not a throw) for a garbage value — distinguishable from 'unset'", () => {
    withEnv({ SUPABASE_ENVIRONMENT_TAG: "not-a-real-environment" }, () => {
      expect(getConfiguredDatabaseEnvironmentTag()).toBe("unknown");
    });
  });
});

test.describe("§E.8 — the guard's generic error message reveals no infrastructure detail", () => {
  test("the error string contains no URL, project ref shape, or the word 'supabase'", () => {
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(/https?:\/\//i);
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(/supabase/i);
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(/\.co\b/);
  });

  test("the error string never names VERCEL_ENV, SUPABASE_ENVIRONMENT_TAG, or any guard reason code", () => {
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(/VERCEL_ENV/);
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(/SUPABASE_ENVIRONMENT_TAG/);
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(
      /environment_unknown|database_tag_not_configured|database_tag_unknown|environment_mismatch/
    );
  });
});
