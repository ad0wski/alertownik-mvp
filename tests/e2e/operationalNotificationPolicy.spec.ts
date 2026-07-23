import { test, expect } from "@playwright/test";
import {
  decideNotificationCategory,
  decideNotificationPolicy,
  eventTypeFor,
  buildNotificationEventDetails,
  buildOperationalNotificationFingerprint,
  type NotificationCategoryInput,
} from "@/lib/operationalNotificationPolicy";
import type { AutomationErrorCategory, RetryState } from "@/lib/automationAlerting";
import { DEFAULT_ALERT_COOLDOWN_MS } from "@/lib/alertDeduplication";

/**
 * Sprint 166F-1 — pure notification-policy tests. Every test here is a
 * plain function call: no I/O, no Supabase, no fetch, no Resend, no
 * database. See docs/SPRINT_166F_OPERATIONAL_ALERT_LEDGER_AUDIT_AND_DESIGN_V1.md
 * §B for the full rationale each scenario below encodes.
 */

function retry(overrides: Partial<RetryState> = {}): RetryState {
  return { attemptsMade: 1, maxAttemptsPerRun: 2, willRetryWithinRun: false, nextScheduledRunKnown: false, ...overrides };
}

test.describe("decideNotificationCategory — the eight required scenarios", () => {
  test("1. success (category: none) → suppress_success", () => {
    expect(decideNotificationCategory({ category: "none", retry: retry(), isAbandonedRun: false })).toBe(
      "suppress_success"
    );
  });

  test("2. lock_held (not abandoned) → suppress_lock_held", () => {
    expect(decideNotificationCategory({ category: "lock_held", retry: retry(), isAbandonedRun: false })).toBe(
      "suppress_lock_held"
    );
  });

  test("3. transient failure with retry remaining → suppress_retry_pending", () => {
    const decision = decideNotificationCategory({
      category: "transient_fetch",
      retry: retry({ willRetryWithinRun: true }),
      isAbandonedRun: false,
    });
    expect(decision).toBe("suppress_retry_pending");
  });

  test("4. transient failure, retry exhausted → notify", () => {
    const decision = decideNotificationCategory({
      category: "transient_fetch",
      retry: retry({ willRetryWithinRun: false }),
      isAbandonedRun: false,
    });
    expect(decision).toBe("notify");
  });

  test("5. permanent failure → notify", () => {
    expect(decideNotificationCategory({ category: "permanent_fetch", retry: retry(), isAbandonedRun: false })).toBe(
      "notify"
    );
    expect(decideNotificationCategory({ category: "write_error", retry: retry(), isAbandonedRun: false })).toBe(
      "notify"
    );
  });

  test("6. configuration/auth error → notify, with high (critical) severity", () => {
    expect(
      decideNotificationCategory({ category: "credentials_not_configured", retry: retry(), isAbandonedRun: false })
    ).toBe("notify");
    expect(
      decideNotificationCategory({ category: "environment_guard_blocked", retry: retry(), isAbandonedRun: false })
    ).toBe("notify");
    const details = buildNotificationEventDetails("credentials_not_configured", 1, false);
    expect(details.severity).toBe("critical");
  });

  test("7. abandoned run → notify, even though the underlying category is lock_held (never suppressed as lock_held)", () => {
    const decision = decideNotificationCategory({ category: "lock_held", retry: retry(), isAbandonedRun: true });
    expect(decision).toBe("notify");
  });

  test("8. ambiguous/unrecognized category → fail_closed, never a guess", () => {
    const input = { category: "totally_unknown" as unknown as AutomationErrorCategory, retry: retry(), isAbandonedRun: false };
    expect(decideNotificationCategory(input as NotificationCategoryInput)).toBe("fail_closed");
  });

  test("kill_switch_disabled → suppress_not_actionable (a deliberate operator choice, not an alertable problem)", () => {
    expect(
      decideNotificationCategory({ category: "kill_switch_disabled", retry: retry(), isAbandonedRun: false })
    ).toBe("suppress_not_actionable");
  });

  test("unexpected_error → notify", () => {
    expect(decideNotificationCategory({ category: "unexpected_error", retry: retry(), isAbandonedRun: false })).toBe(
      "notify"
    );
  });
});

test.describe("decideNotificationPolicy — cooldown layered on top of the category decision", () => {
  test("14. within cooldown → suppress_cooldown, even though the category decision alone would notify", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const lastAlertSentAt = new Date("2026-01-01T11:00:00.000Z").toISOString(); // 1h ago, within the 6h default cooldown
    const decision = decideNotificationPolicy({
      category: "permanent_fetch",
      retry: retry(),
      isAbandonedRun: false,
      lastAlertSentAt,
      now,
    });
    expect(decision).toBe("suppress_cooldown");
  });

  test("outside cooldown → notify", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const lastAlertSentAt = new Date("2026-01-01T00:00:00.000Z").toISOString(); // 12h ago, past the 6h default
    const decision = decideNotificationPolicy({
      category: "permanent_fetch",
      retry: retry(),
      isAbandonedRun: false,
      lastAlertSentAt,
      now,
    });
    expect(decision).toBe("notify");
  });

  test("never alerted before (lastAlertSentAt: null) → never suppressed by cooldown", () => {
    const decision = decideNotificationPolicy({
      category: "permanent_fetch",
      retry: retry(),
      isAbandonedRun: false,
      lastAlertSentAt: null,
    });
    expect(decision).toBe("notify");
  });

  test("a category decision that already suppresses is never overridden into a cooldown check", () => {
    // Even with a lastAlertSentAt far enough in the past to clear cooldown,
    // suppress_lock_held must still win — cooldown is only ever consulted
    // after the category decision itself says "notify".
    const decision = decideNotificationPolicy({
      category: "lock_held",
      retry: retry(),
      isAbandonedRun: false,
      lastAlertSentAt: new Date(0).toISOString(),
    });
    expect(decision).toBe("suppress_lock_held");
  });

  test("respects an explicit cooldownMs override", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const lastAlertSentAt = new Date("2026-01-01T11:59:00.000Z").toISOString(); // 1 minute ago
    const decision = decideNotificationPolicy({
      category: "permanent_fetch",
      retry: retry(),
      isAbandonedRun: false,
      lastAlertSentAt,
      now,
      cooldownMs: 30_000, // 30s — already elapsed
    });
    expect(decision).toBe("notify");
  });

  test("default cooldown constant is reused, not reimplemented", () => {
    expect(DEFAULT_ALERT_COOLDOWN_MS).toBe(6 * 60 * 60 * 1000);
  });
});

test.describe("eventTypeFor — one-to-one mapping, abandoned_run always distinct from lock_held", () => {
  test("abandoned run always maps to abandoned_run regardless of category", () => {
    expect(eventTypeFor("lock_held", true)).toBe("abandoned_run");
    expect(eventTypeFor("none", true)).toBe("abandoned_run");
  });

  test("every AutomationErrorCategory maps to its own distinct eventType when not abandoned", () => {
    const categories: AutomationErrorCategory[] = [
      "none",
      "transient_fetch",
      "permanent_fetch",
      "write_error",
      "lock_held",
      "environment_guard_blocked",
      "credentials_not_configured",
      "kill_switch_disabled",
      "unexpected_error",
    ];
    const eventTypes = categories.map((c) => eventTypeFor(c, false));
    expect(new Set(eventTypes).size).toBe(categories.length);
  });
});

test.describe("buildOperationalNotificationFingerprint — determinism and scoping", () => {
  test("9. the same error, same source, same environment → the same fingerprint", () => {
    const a = buildOperationalNotificationFingerprint("preview", "michalowice-komunikaty", "permanent_fetch");
    const b = buildOperationalNotificationFingerprint("preview", "michalowice-komunikaty", "permanent_fetch");
    expect(a).toBe(b);
  });

  test("10. a different environment → a different fingerprint", () => {
    const a = buildOperationalNotificationFingerprint("preview", "michalowice-komunikaty", "permanent_fetch");
    const b = buildOperationalNotificationFingerprint("production", "michalowice-komunikaty", "permanent_fetch");
    expect(a).not.toBe(b);
  });

  test("11. a different source → a different fingerprint", () => {
    const a = buildOperationalNotificationFingerprint("preview", "michalowice-komunikaty", "permanent_fetch");
    const b = buildOperationalNotificationFingerprint("preview", "wkd-aktualnosci", "permanent_fetch");
    expect(a).not.toBe(b);
  });

  test("abandoned_run never collides with lock_held for the same scope", () => {
    const a = buildOperationalNotificationFingerprint("preview", "run", "abandoned_run");
    const b = buildOperationalNotificationFingerprint("preview", "run", "lock_held");
    expect(a).not.toBe(b);
  });
});
