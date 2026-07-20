import { test, expect } from "@playwright/test";
import {
  resolveEnvironmentIdentity,
  getServerEnvironmentIdentity,
  getClientEnvironmentIdentity,
  ENVIRONMENT_LABELS,
} from "@/lib/environmentIdentity";

/**
 * Sprint 165B — src/lib/environmentIdentity.ts is the single source of
 * truth mapping a raw VERCEL_ENV-shaped string to one of four identities.
 * These tests exercise the pure resolver directly, then the two thin
 * env-var-reading wrappers around it.
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

test.describe("resolveEnvironmentIdentity — pure mapping, single source of truth", () => {
  test("recognizes the three known Vercel environment values", () => {
    expect(resolveEnvironmentIdentity("production")).toBe("production");
    expect(resolveEnvironmentIdentity("preview")).toBe("preview");
    expect(resolveEnvironmentIdentity("development")).toBe("development");
  });

  test("is case-insensitive and trims whitespace", () => {
    expect(resolveEnvironmentIdentity("PRODUCTION")).toBe("production");
    expect(resolveEnvironmentIdentity("  Preview  ")).toBe("preview");
    expect(resolveEnvironmentIdentity("Development")).toBe("development");
  });

  test("undefined, null, and empty string all resolve to unknown", () => {
    expect(resolveEnvironmentIdentity(undefined)).toBe("unknown");
    expect(resolveEnvironmentIdentity(null)).toBe("unknown");
    expect(resolveEnvironmentIdentity("")).toBe("unknown");
    expect(resolveEnvironmentIdentity("   ")).toBe("unknown");
  });

  test("any unrecognized string resolves to unknown — never guessed, never defaulted to a known environment", () => {
    expect(resolveEnvironmentIdentity("prod")).toBe("unknown");
    expect(resolveEnvironmentIdentity("staging")).toBe("unknown");
    expect(resolveEnvironmentIdentity("productionn")).toBe("unknown");
    expect(resolveEnvironmentIdentity("<script>alert(1)</script>")).toBe("unknown");
  });

  test("every known identity has a fixed, non-empty display label, and unknown reads distinctly", () => {
    expect(ENVIRONMENT_LABELS.production).toBe("PRODUCTION");
    expect(ENVIRONMENT_LABELS.preview).toBe("PREVIEW");
    expect(ENVIRONMENT_LABELS.development).toBe("DEVELOPMENT");
    expect(ENVIRONMENT_LABELS.unknown).toBe("UNKNOWN");
  });
});

test.describe("getServerEnvironmentIdentity — reads VERCEL_ENV only", () => {
  test("reflects VERCEL_ENV when set to a known value", () => {
    withEnv({ VERCEL_ENV: "production" }, () => {
      expect(getServerEnvironmentIdentity()).toBe("production");
    });
  });

  test("resolves to unknown when VERCEL_ENV is unset (the common case for local test runs)", () => {
    withEnv({ VERCEL_ENV: undefined }, () => {
      expect(getServerEnvironmentIdentity()).toBe("unknown");
    });
  });

  test("never reads NEXT_PUBLIC_VERCEL_ENV — the two env vars are read independently by design", () => {
    withEnv({ VERCEL_ENV: undefined, NEXT_PUBLIC_VERCEL_ENV: "production" }, () => {
      expect(getServerEnvironmentIdentity()).toBe("unknown");
    });
  });
});

test.describe("getClientEnvironmentIdentity — reads NEXT_PUBLIC_VERCEL_ENV only", () => {
  test("reflects NEXT_PUBLIC_VERCEL_ENV when set to a known value", () => {
    withEnv({ NEXT_PUBLIC_VERCEL_ENV: "preview" }, () => {
      expect(getClientEnvironmentIdentity()).toBe("preview");
    });
  });

  test("resolves to unknown when NEXT_PUBLIC_VERCEL_ENV is unset", () => {
    withEnv({ NEXT_PUBLIC_VERCEL_ENV: undefined }, () => {
      expect(getClientEnvironmentIdentity()).toBe("unknown");
    });
  });

  test("never reads VERCEL_ENV — the two env vars are read independently by design", () => {
    withEnv({ NEXT_PUBLIC_VERCEL_ENV: undefined, VERCEL_ENV: "production" }, () => {
      expect(getClientEnvironmentIdentity()).toBe("unknown");
    });
  });
});
