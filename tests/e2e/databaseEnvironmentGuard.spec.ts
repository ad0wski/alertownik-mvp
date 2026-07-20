import { test, expect } from "@playwright/test";
import {
  checkDatabaseEnvironmentGuard,
  getConfiguredDatabaseEnvironmentTag,
  getActualSupabaseProjectRef,
  getExpectedSupabaseProjectRef,
  DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR,
} from "@/lib/databaseEnvironmentGuard";
import type { EnvironmentIdentity } from "@/lib/environmentIdentity";

/**
 * Sprint 165B-2 — src/lib/databaseEnvironmentGuard.ts. Covers the
 * corrected, four-signal guard: resolved app environment,
 * SUPABASE_ENVIRONMENT_TAG, the ACTUAL Supabase project ref (derived from
 * NEXT_PUBLIC_SUPABASE_URL), and SUPABASE_EXPECTED_PROJECT_REF. Every test
 * explicitly sets or clears NEXT_PUBLIC_SUPABASE_URL — this repo's
 * .env.local sets a real value for local `npm run dev`/build use, so
 * tests must never rely on that ambient value for determinism.
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

const FAKE_PREVIEW_URL = "https://previewrefabcdef.supabase.co";
const FAKE_PREVIEW_REF = "previewrefabcdef";
const FAKE_PRODUCTION_URL = "https://prodrefabcdefghij.supabase.co";
const FAKE_PRODUCTION_REF = "prodrefabcdefghij";

test.describe("checkDatabaseEnvironmentGuard — four-signal decision table (Sprint 165B-2)", () => {
  // ── §D.1/§D.2 — matching everything on both Preview and Production ──────

  test("§D.1 — Preview app + Preview tag + real Preview project ref + expected Preview project ref → guard passes", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_PREVIEW_URL,
        SUPABASE_ENVIRONMENT_TAG: "preview",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("preview");
        expect(result.ok).toBe(true);
      }
    );
  });

  test("§D.2 — Production app + Production tag + real Production project ref + expected Production project ref → guard passes", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_PRODUCTION_URL,
        SUPABASE_ENVIRONMENT_TAG: "production",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PRODUCTION_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("production");
        expect(result.ok).toBe(true);
      }
    );
  });

  // ── §D.3/§D.4 — the exact scenario this sprint's re-audit named ─────────

  test("§D.3 — Preview app + Preview tag, but the URL actually configured points at the Production project → blocked (this is the exact gap this sprint closes)", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_PRODUCTION_URL,
        SUPABASE_ENVIRONMENT_TAG: "preview",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("preview");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("project_ref_mismatch");
      }
    );
  });

  test("§D.4 — Production app + Production tag, but the URL actually configured points at a Preview project → blocked", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_PREVIEW_URL,
        SUPABASE_ENVIRONMENT_TAG: "production",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PRODUCTION_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("production");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("project_ref_mismatch");
      }
    );
  });

  // ── §D.5 — actual vs expected differ, independent of the tag layer ──────

  test("§D.5 — actual project ref and expected project ref are simply different values → blocked as project_ref_mismatch", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_PREVIEW_URL,
        SUPABASE_ENVIRONMENT_TAG: "preview",
        SUPABASE_EXPECTED_PROJECT_REF: "some-other-project-ref-entirely",
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("preview");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("project_ref_mismatch");
      }
    );
  });

  // ── §D.6 — expected ref not configured ───────────────────────────────────

  test("§D.6 — SUPABASE_EXPECTED_PROJECT_REF unset → blocked as expected_project_ref_not_configured, even with a valid URL and matching tag", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_PREVIEW_URL,
        SUPABASE_ENVIRONMENT_TAG: "preview",
        SUPABASE_EXPECTED_PROJECT_REF: undefined,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("preview");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("expected_project_ref_not_configured");
      }
    );
  });

  // ── §D.7 — Supabase URL missing ──────────────────────────────────────────

  test("§D.7 — NEXT_PUBLIC_SUPABASE_URL unset → blocked as supabase_url_missing_or_invalid", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        SUPABASE_ENVIRONMENT_TAG: "preview",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("preview");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("supabase_url_missing_or_invalid");
      }
    );
  });

  // ── §D.8 — malformed / unrecognized Supabase URL ─────────────────────────

  test("§D.8a — a garbage, unparseable URL → blocked as supabase_url_missing_or_invalid", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: "not a url at all",
        SUPABASE_ENVIRONMENT_TAG: "preview",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("preview");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("supabase_url_missing_or_invalid");
      }
    );
  });

  test("§D.8b — a well-formed URL on a non-Supabase host → blocked as supabase_url_missing_or_invalid (never guesses a ref from an unrecognized host)", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://not-supabase.example.com",
        SUPABASE_ENVIRONMENT_TAG: "preview",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("preview");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("supabase_url_missing_or_invalid");
      }
    );
  });

  test("§D.8c — a Supabase-suffixed host with an embedded dot in the label → rejected, not best-effort parsed", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://evil.previewrefabcdef.supabase.co",
        SUPABASE_ENVIRONMENT_TAG: "preview",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("preview");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("supabase_url_missing_or_invalid");
      }
    );
  });

  // ── §D.9 — UNKNOWN app environment blocks regardless of everything else ─

  test("§D.9 — UNKNOWN app environment is blocked even with a fully valid, matching URL/tag/expected-ref configuration", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_PREVIEW_URL,
        SUPABASE_ENVIRONMENT_TAG: "preview",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("unknown");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("environment_unknown");
      }
    );
  });

  // ── Development requires full explicit configuration, no implicit pass ──

  test("Development app environment without SUPABASE_ENVIRONMENT_TAG configured → blocked, same as any other environment", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_PREVIEW_URL,
        SUPABASE_ENVIRONMENT_TAG: undefined,
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("development");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("database_tag_not_configured");
      }
    );
  });

  test("Development app environment with every one of the four signals explicitly configured and matching → this gate passes", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_PREVIEW_URL,
        SUPABASE_ENVIRONMENT_TAG: "development",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("development");
        expect(result.ok).toBe(true);
      }
    );
  });

  // ── Pre-existing scenarios, still required to hold ──────────────────────

  const allIdentities: EnvironmentIdentity[] = ["production", "preview", "development", "unknown"];
  test("UNKNOWN app environment is blocked regardless of what the database tag says", () => {
    for (const tag of allIdentities) {
      withEnv(
        {
          NEXT_PUBLIC_SUPABASE_URL: FAKE_PREVIEW_URL,
          SUPABASE_ENVIRONMENT_TAG: tag,
          SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
        },
        () => {
          const result = checkDatabaseEnvironmentGuard("unknown");
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.reason).toBe("environment_unknown");
        }
      );
    }
  });

  test("an unrecognized tag value → blocked as database_tag_unknown, before the project-ref checks ever run", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_PREVIEW_URL,
        SUPABASE_ENVIRONMENT_TAG: "staging",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("production");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("database_tag_unknown");
      }
    );
  });

  // ── §D.10 — no leaked infrastructure detail anywhere in the result ──────

  test("§D.10 — passing this gate alone returns only { ok: true } — never a URL, ref, or credential a caller could act on directly", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_PREVIEW_URL,
        SUPABASE_ENVIRONMENT_TAG: "preview",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("preview");
        expect(Object.keys(result)).toEqual(["ok"]);
      }
    );
  });

  test("§D.10 — every failure reason is a fixed enum string, never interpolates the actual URL, ref, or tag value", () => {
    withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_PRODUCTION_URL,
        SUPABASE_ENVIRONMENT_TAG: "preview",
        SUPABASE_EXPECTED_PROJECT_REF: FAKE_PREVIEW_REF,
      },
      () => {
        const result = checkDatabaseEnvironmentGuard("preview");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).not.toContain(FAKE_PRODUCTION_REF);
          expect(result.reason).not.toContain(FAKE_PREVIEW_REF);
          expect(result.reason).not.toMatch(/https?:\/\//);
          expect(result.reason).not.toMatch(/supabase\.co/);
        }
      }
    );
  });
});

test.describe("getActualSupabaseProjectRef / getExpectedSupabaseProjectRef", () => {
  test("getActualSupabaseProjectRef extracts the project-ref label from a well-formed Supabase URL", () => {
    withEnv({ NEXT_PUBLIC_SUPABASE_URL: FAKE_PREVIEW_URL }, () => {
      expect(getActualSupabaseProjectRef()).toBe(FAKE_PREVIEW_REF);
    });
  });

  test("getActualSupabaseProjectRef returns null for an unset, malformed, or non-Supabase URL", () => {
    withEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined }, () => {
      expect(getActualSupabaseProjectRef()).toBeNull();
    });
    withEnv({ NEXT_PUBLIC_SUPABASE_URL: "garbage" }, () => {
      expect(getActualSupabaseProjectRef()).toBeNull();
    });
    withEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.com" }, () => {
      expect(getActualSupabaseProjectRef()).toBeNull();
    });
  });

  test("getExpectedSupabaseProjectRef returns null when unset, and a normalized (trimmed, lowercased) value otherwise", () => {
    withEnv({ SUPABASE_EXPECTED_PROJECT_REF: undefined }, () => {
      expect(getExpectedSupabaseProjectRef()).toBeNull();
    });
    withEnv({ SUPABASE_EXPECTED_PROJECT_REF: "  SomeRef123  " }, () => {
      expect(getExpectedSupabaseProjectRef()).toBe("someref123");
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

test.describe("the guard's generic error message reveals no infrastructure detail", () => {
  test("the error string contains no URL, project ref shape, or the word 'supabase'", () => {
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(/https?:\/\//i);
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(/supabase/i);
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(/\.co\b/);
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toContain(FAKE_PREVIEW_REF);
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toContain(FAKE_PRODUCTION_REF);
  });

  test("the error string never names any of the four env vars or any guard reason code", () => {
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(/VERCEL_ENV/);
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(/SUPABASE_ENVIRONMENT_TAG/);
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(/SUPABASE_EXPECTED_PROJECT_REF/);
    expect(DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR).not.toMatch(
      /environment_unknown|database_tag_not_configured|database_tag_unknown|environment_mismatch|supabase_url_missing_or_invalid|expected_project_ref_not_configured|project_ref_mismatch/
    );
  });
});
