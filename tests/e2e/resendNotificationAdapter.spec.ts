import { test, expect } from "@playwright/test";
import {
  classifyResendError,
  createResendNotificationAdapter,
  getResendCredentialsFromEnv,
  RESEND_SEND_TIMEOUT_MS,
  type ResendLikeClient,
  type ResendLikeSendResult,
} from "@/lib/resendNotificationAdapter";

/**
 * Sprint 166E-1 — resend adapter tests. EVERY test in this file uses a
 * fake `ResendLikeClient` (a plain object implementing the same narrow
 * shape the adapter calls) — none constructs or calls the real `Resend`
 * class from the "resend" package, and none performs any real network
 * request. This matches the sprint rule: no test may make a real
 * connection to Resend.
 */

function fakeClient(impl: (payload: { from: string; to: string; subject: string; text: string }) => Promise<ResendLikeSendResult>): ResendLikeClient {
  return { emails: { send: impl } };
}

const NOTIFICATION = {
  subject: "test subject",
  textBody: "test body",
  fingerprint: "preview:wkd-aktualnosci:transient_fetch",
};

test.describe("getResendCredentialsFromEnv", () => {
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

  test("all three present → returns credentials object", () => {
    withEnv(
      {
        RESEND_API_KEY: "re_test_fake_key_not_real",
        OPERATIONAL_ALERT_EMAIL_FROM: "alerts@example.test",
        OPERATIONAL_ALERT_EMAIL_TO: "admin@example.test",
      },
      () => {
        const creds = getResendCredentialsFromEnv();
        expect(creds).not.toBeNull();
        expect(creds?.apiKey).toBe("re_test_fake_key_not_real");
      }
    );
  });

  test("missing API key → null", () => {
    withEnv(
      {
        RESEND_API_KEY: undefined,
        OPERATIONAL_ALERT_EMAIL_FROM: "alerts@example.test",
        OPERATIONAL_ALERT_EMAIL_TO: "admin@example.test",
      },
      () => {
        expect(getResendCredentialsFromEnv()).toBeNull();
      }
    );
  });

  test("missing from address → null", () => {
    withEnv(
      {
        RESEND_API_KEY: "re_test_fake_key_not_real",
        OPERATIONAL_ALERT_EMAIL_FROM: undefined,
        OPERATIONAL_ALERT_EMAIL_TO: "admin@example.test",
      },
      () => {
        expect(getResendCredentialsFromEnv()).toBeNull();
      }
    );
  });

  test("missing to address → null", () => {
    withEnv(
      {
        RESEND_API_KEY: "re_test_fake_key_not_real",
        OPERATIONAL_ALERT_EMAIL_FROM: "alerts@example.test",
        OPERATIONAL_ALERT_EMAIL_TO: undefined,
      },
      () => {
        expect(getResendCredentialsFromEnv()).toBeNull();
      }
    );
  });
});

test.describe("classifyResendError", () => {
  test("validation_error name → validation_error category", () => {
    expect(classifyResendError("validation_error", 422)).toBe("validation_error");
    expect(classifyResendError("missing_required_field", 422)).toBe("validation_error");
    expect(classifyResendError("invalid_from_address", 422)).toBe("validation_error");
  });

  test("auth-related names → auth_error category", () => {
    expect(classifyResendError("missing_api_key", 401)).toBe("auth_error");
    expect(classifyResendError("invalid_api_key", 401)).toBe("auth_error");
    expect(classifyResendError("restricted_api_key", 403)).toBe("auth_error");
  });

  test("rate limit names → rate_limited category", () => {
    expect(classifyResendError("rate_limit_exceeded", 429)).toBe("rate_limited");
    expect(classifyResendError("monthly_quota_exceeded", 429)).toBe("rate_limited");
  });

  test("server error names → transient_error category", () => {
    expect(classifyResendError("internal_server_error", 500)).toBe("transient_error");
  });

  test("unrecognized name falls back to statusCode-based classification", () => {
    expect(classifyResendError("something_new", 500)).toBe("transient_error");
    expect(classifyResendError("something_new", 401)).toBe("auth_error");
    expect(classifyResendError("something_new", 429)).toBe("rate_limited");
    expect(classifyResendError("something_new", 422)).toBe("validation_error");
  });

  test("no name and no statusCode → unknown_error, never throws", () => {
    expect(classifyResendError(undefined, undefined)).toBe("unknown_error");
    expect(classifyResendError(undefined, null)).toBe("unknown_error");
  });
});

test.describe("createResendNotificationAdapter — mocked send only", () => {
  test("successful mocked send → ok:true, status:sent", async () => {
    const client = fakeClient(async () => ({ data: { id: "fake-id-123" }, error: null }));
    const adapter = createResendNotificationAdapter(client, { from: "alerts@example.test", to: "admin@example.test" });
    const result = await adapter.send(NOTIFICATION);
    expect(result).toEqual({ ok: true, status: "sent" });
  });

  test("provider validation error → ok:false, status:send_failed, no raw message leaked", async () => {
    const client = fakeClient(async () => ({
      data: null,
      error: { message: "The `to` field is invalid.", statusCode: 422, name: "validation_error" },
    }));
    const adapter = createResendNotificationAdapter(client, { from: "alerts@example.test", to: "admin@example.test" });
    const result = await adapter.send(NOTIFICATION);
    expect(result).toEqual({ ok: false, status: "send_failed" });
    expect(JSON.stringify(result)).not.toContain("invalid");
  });

  test("provider auth error → ok:false, status:send_failed", async () => {
    const client = fakeClient(async () => ({
      data: null,
      error: { message: "API key is invalid.", statusCode: 401, name: "invalid_api_key" },
    }));
    const adapter = createResendNotificationAdapter(client, { from: "alerts@example.test", to: "admin@example.test" });
    const result = await adapter.send(NOTIFICATION);
    expect(result).toEqual({ ok: false, status: "send_failed" });
  });

  test("rate limit error → ok:false, status:send_failed", async () => {
    const client = fakeClient(async () => ({
      data: null,
      error: { message: "Too many requests.", statusCode: 429, name: "rate_limit_exceeded" },
    }));
    const adapter = createResendNotificationAdapter(client, { from: "alerts@example.test", to: "admin@example.test" });
    const result = await adapter.send(NOTIFICATION);
    expect(result).toEqual({ ok: false, status: "send_failed" });
  });

  test("transient 5xx error → ok:false, status:send_failed", async () => {
    const client = fakeClient(async () => ({
      data: null,
      error: { message: "Something went wrong.", statusCode: 500, name: "internal_server_error" },
    }));
    const adapter = createResendNotificationAdapter(client, { from: "alerts@example.test", to: "admin@example.test" });
    const result = await adapter.send(NOTIFICATION);
    expect(result).toEqual({ ok: false, status: "send_failed" });
  });

  test("a thrown network-level error → ok:false, status:send_failed, never rethrown", async () => {
    const client = fakeClient(async () => {
      throw new Error("fetch failed: getaddrinfo ENOTFOUND api.resend.com");
    });
    const adapter = createResendNotificationAdapter(client, { from: "alerts@example.test", to: "admin@example.test" });
    await expect(adapter.send(NOTIFICATION)).resolves.toEqual({ ok: false, status: "send_failed" });
  });

  test("a send that never resolves is bounded by the timeout, not an infinite hang", async () => {
    const client = fakeClient(() => new Promise<ResendLikeSendResult>(() => {})); // never settles
    const adapter = createResendNotificationAdapter(client, { from: "alerts@example.test", to: "admin@example.test" }, 50);
    const result = await adapter.send(NOTIFICATION);
    expect(result).toEqual({ ok: false, status: "send_failed" });
  });

  test("default timeout constant is a bounded, sane value (not unbounded, not absurdly short)", () => {
    expect(RESEND_SEND_TIMEOUT_MS).toBeGreaterThan(1_000);
    expect(RESEND_SEND_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  test("no API key ever appears in any send() result, regardless of outcome", async () => {
    const fakeApiKey = "re_super_secret_test_value_should_never_leak";
    const client = fakeClient(async () => ({ data: { id: "fake-id" }, error: null }));
    const adapter = createResendNotificationAdapter(client, { from: "alerts@example.test", to: "admin@example.test" });
    const result = await adapter.send(NOTIFICATION);
    expect(JSON.stringify(result)).not.toContain(fakeApiKey);
    expect(JSON.stringify(result)).not.toContain("re_");
  });

  test("send() never includes a full error_summary or stack-trace-shaped string in its result", async () => {
    const client = fakeClient(async () => ({
      data: null,
      error: {
        message: "Error: at Object.<anonymous> (/app/node_modules/resend/dist/index.cjs:123:45)",
        statusCode: 500,
        name: "internal_server_error",
      },
    }));
    const adapter = createResendNotificationAdapter(client, { from: "alerts@example.test", to: "admin@example.test" });
    const result = await adapter.send(NOTIFICATION);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("node_modules");
    expect(serialized).not.toContain("at Object");
  });

  test("constructing the adapter performs no I/O by itself (no send during construction)", () => {
    let called = false;
    const client = fakeClient(async () => {
      called = true;
      return { data: { id: "x" }, error: null };
    });
    createResendNotificationAdapter(client, { from: "alerts@example.test", to: "admin@example.test" });
    expect(called).toBe(false);
  });
});
