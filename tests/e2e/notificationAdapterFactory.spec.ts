import { test, expect } from "@playwright/test";
import { decideNotificationAdapterKind, createConfiguredNotificationAdapter } from "@/lib/notificationAdapterFactory";

/**
 * Sprint 166E-1 — factory selection tests. Uses decideNotificationAdapterKind()
 * (pure, no I/O) for the "which adapter would be chosen" scenarios so that
 * even the fully-configured case never constructs a real `Resend` client or
 * calls .send() — zero real network requests anywhere in this file.
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

const CLEAR_EMAIL_ENV = {
  OPERATIONAL_EMAIL_ALERTS_ENABLED: undefined,
  RESEND_API_KEY: undefined,
  OPERATIONAL_ALERT_EMAIL_FROM: undefined,
  OPERATIONAL_ALERT_EMAIL_TO: undefined,
};

test.describe("decideNotificationAdapterKind", () => {
  test("1. feature disabled → noop, regardless of other config", () => {
    withEnv(
      {
        ...CLEAR_EMAIL_ENV,
        OPERATIONAL_EMAIL_ALERTS_ENABLED: undefined,
        RESEND_API_KEY: "re_test_fake",
        OPERATIONAL_ALERT_EMAIL_FROM: "alerts@example.test",
        OPERATIONAL_ALERT_EMAIL_TO: "admin@example.test",
      },
      () => {
        expect(decideNotificationAdapterKind()).toBe("noop");
      }
    );
  });

  test("2. enabled but no API key → misconfigured", () => {
    withEnv(
      {
        ...CLEAR_EMAIL_ENV,
        OPERATIONAL_EMAIL_ALERTS_ENABLED: "true",
        RESEND_API_KEY: undefined,
        OPERATIONAL_ALERT_EMAIL_FROM: "alerts@example.test",
        OPERATIONAL_ALERT_EMAIL_TO: "admin@example.test",
      },
      () => {
        expect(decideNotificationAdapterKind()).toBe("misconfigured");
      }
    );
  });

  test("3. enabled but no recipient → misconfigured", () => {
    withEnv(
      {
        ...CLEAR_EMAIL_ENV,
        OPERATIONAL_EMAIL_ALERTS_ENABLED: "true",
        RESEND_API_KEY: "re_test_fake",
        OPERATIONAL_ALERT_EMAIL_FROM: "alerts@example.test",
        OPERATIONAL_ALERT_EMAIL_TO: undefined,
      },
      () => {
        expect(decideNotificationAdapterKind()).toBe("misconfigured");
      }
    );
  });

  test("4. enabled but no sender → misconfigured", () => {
    withEnv(
      {
        ...CLEAR_EMAIL_ENV,
        OPERATIONAL_EMAIL_ALERTS_ENABLED: "true",
        RESEND_API_KEY: "re_test_fake",
        OPERATIONAL_ALERT_EMAIL_FROM: undefined,
        OPERATIONAL_ALERT_EMAIL_TO: "admin@example.test",
      },
      () => {
        expect(decideNotificationAdapterKind()).toBe("misconfigured");
      }
    );
  });

  test("5. enabled + fully configured → resend", () => {
    withEnv(
      {
        ...CLEAR_EMAIL_ENV,
        OPERATIONAL_EMAIL_ALERTS_ENABLED: "true",
        RESEND_API_KEY: "re_test_fake",
        OPERATIONAL_ALERT_EMAIL_FROM: "alerts@example.test",
        OPERATIONAL_ALERT_EMAIL_TO: "admin@example.test",
      },
      () => {
        expect(decideNotificationAdapterKind()).toBe("resend");
      }
    );
  });
});

test.describe("createConfiguredNotificationAdapter — disabled/misconfigured paths only (no real Resend client exercised)", () => {
  test("disabled → returns an adapter whose send() reports disabled, zero I/O", async () => {
    await withEnvAsync({ ...CLEAR_EMAIL_ENV }, async () => {
      const adapter = createConfiguredNotificationAdapter();
      const result = await adapter.send({ subject: "s", textBody: "b", fingerprint: "f" });
      expect(result).toEqual({ ok: true, status: "disabled" });
    });
  });

  test("enabled but misconfigured → returns an adapter whose send() reports no_adapter_configured, zero I/O", async () => {
    await withEnvAsync(
      {
        ...CLEAR_EMAIL_ENV,
        OPERATIONAL_EMAIL_ALERTS_ENABLED: "true",
      },
      async () => {
        const adapter = createConfiguredNotificationAdapter();
        const result = await adapter.send({ subject: "s", textBody: "b", fingerprint: "f" });
        expect(result).toEqual({ ok: false, status: "no_adapter_configured" });
      }
    );
  });

  // Deliberately no test here calls createConfiguredNotificationAdapter()
  // in the fully-configured branch and then .send() — doing so would
  // construct a real `Resend` client and attempt a real network request,
  // which this sprint's rules forbid in every test. The "resend" branch's
  // selection logic is fully covered above via decideNotificationAdapterKind()
  // instead, and the adapter's own send() behavior is fully covered by
  // resendNotificationAdapter.spec.ts using an injected fake client.
});

async function withEnvAsync(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}
