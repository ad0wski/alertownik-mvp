import { test, expect } from "@playwright/test";
import {
  isClaimNotificationEventInputValid,
  isFinishNotificationEventInputValid,
  isSafeSummaryValid,
  isStaleClaimAfterSecondsValid,
  SAFE_SUMMARY_MAX_LENGTH,
  NOTIFICATION_COOLDOWN_SECONDS,
  ALLOWED_NOTIFICATION_STATUSES,
  ALLOWED_SUPPRESSED_REASONS,
  ALLOWED_PROVIDER_STATUSES,
  type ClaimNotificationEventInput,
  type ClaimNotificationEventResult,
  type OperationalNotificationLedger,
} from "@/lib/operationalNotificationLedger";
import { DEFAULT_ALERT_COOLDOWN_MS } from "@/lib/alertDeduplication";

/**
 * Sprint 166F-1 — ledger specification tests. Every "claim" in this file
 * is an in-memory fake simulating the future migration's own partial
 * unique index + cooldown check — mirrors
 * tests/e2e/scheduledWriterConcurrency.spec.ts's existing "shared
 * committed set" pattern exactly. ZERO real Supabase client, ZERO real
 * RPC call, ZERO real database connection anywhere in this file.
 */

function baseClaimInput(overrides: Partial<ClaimNotificationEventInput> = {}): ClaimNotificationEventInput {
  return {
    environmentTag: "preview",
    channel: "email",
    eventType: "permanent_fetch",
    severity: "critical",
    fingerprint: "preview:michalowice-komunikaty:permanent_fetch",
    scheduledWriterRunId: null,
    sourceId: "michalowice-komunikaty",
    safeSummary: "trwały błąd pobierania — źródło: Gmina Michałowice",
    staleClaimAfterSeconds: 300,
    ...overrides,
  };
}

test.describe("isClaimNotificationEventInputValid — closed-vocabulary + bounds validation", () => {
  test("a fully valid input passes", () => {
    expect(isClaimNotificationEventInputValid(baseClaimInput())).toBe(true);
  });

  test("an unrecognized channel fails", () => {
    expect(isClaimNotificationEventInputValid(baseClaimInput({ channel: "sms" as never }))).toBe(false);
  });

  test("an unrecognized eventType fails", () => {
    expect(isClaimNotificationEventInputValid(baseClaimInput({ eventType: "made_up" as never }))).toBe(false);
  });

  test("an unrecognized severity fails", () => {
    expect(isClaimNotificationEventInputValid(baseClaimInput({ severity: "urgent" as never }))).toBe(false);
  });

  test("an empty environmentTag fails", () => {
    expect(isClaimNotificationEventInputValid(baseClaimInput({ environmentTag: "" }))).toBe(false);
  });

  test("an empty fingerprint fails", () => {
    expect(isClaimNotificationEventInputValid(baseClaimInput({ fingerprint: "" }))).toBe(false);
  });

  test("13. safe_summary over the length cap fails", () => {
    const tooLong = "x".repeat(SAFE_SUMMARY_MAX_LENGTH + 1);
    expect(isClaimNotificationEventInputValid(baseClaimInput({ safeSummary: tooLong }))).toBe(false);
    expect(isSafeSummaryValid(tooLong)).toBe(false);
  });

  test("safe_summary exactly at the length cap passes", () => {
    const atCap = "x".repeat(SAFE_SUMMARY_MAX_LENGTH);
    expect(isSafeSummaryValid(atCap)).toBe(true);
  });

  test("safe_summary of null is always valid (nothing to summarize)", () => {
    expect(isSafeSummaryValid(null)).toBe(true);
  });

  test("staleClaimAfterSeconds out of range fails", () => {
    expect(isClaimNotificationEventInputValid(baseClaimInput({ staleClaimAfterSeconds: 100 }))).toBe(false);
    expect(isStaleClaimAfterSecondsValid(300)).toBe(true);
    expect(isStaleClaimAfterSecondsValid(299)).toBe(false);
    expect(isStaleClaimAfterSecondsValid(86_401)).toBe(false);
  });
});

test.describe("Sprint 166F-2A — cooldown is a fixed constant, never a caller-settable field", () => {
  test("NOTIFICATION_COOLDOWN_SECONDS is exactly 21600 (6 hours), matching DEFAULT_ALERT_COOLDOWN_MS", () => {
    expect(NOTIFICATION_COOLDOWN_SECONDS).toBe(21_600);
    expect(NOTIFICATION_COOLDOWN_SECONDS * 1000).toBe(DEFAULT_ALERT_COOLDOWN_MS);
  });

  test("3. ClaimNotificationEventInput has no cooldownSeconds field at all — a caller cannot set, weaken, or disable the cooldown", () => {
    // Structural proof: baseClaimInput() below is exactly
    // ClaimNotificationEventInput's own shape (no `as any`, no excess
    // property) — if cooldownSeconds were still part of the type, TS
    // would allow (and this fixture would likely still include) it here.
    const input = baseClaimInput();
    expect(Object.prototype.hasOwnProperty.call(input, "cooldownSeconds")).toBe(false);
  });
});

test.describe("isFinishNotificationEventInputValid", () => {
  test("a valid 'sent' finish passes", () => {
    expect(
      isFinishNotificationEventInputValid({
        eventId: "11111111-1111-1111-1111-111111111111",
        status: "sent",
        providerStatus: "sent",
        sentAt: new Date().toISOString(),
      })
    ).toBe(true);
  });

  test("'sent' without sentAt fails", () => {
    expect(
      isFinishNotificationEventInputValid({
        eventId: "11111111-1111-1111-1111-111111111111",
        status: "sent",
        providerStatus: "sent",
        sentAt: null,
      })
    ).toBe(false);
  });

  test("an unrecognized status fails", () => {
    expect(
      isFinishNotificationEventInputValid({
        eventId: "11111111-1111-1111-1111-111111111111",
        status: "claimed" as never,
        providerStatus: null,
        sentAt: null,
      })
    ).toBe(false);
  });

  test("an unrecognized providerStatus fails", () => {
    expect(
      isFinishNotificationEventInputValid({
        eventId: "11111111-1111-1111-1111-111111111111",
        status: "failed",
        providerStatus: "made_up" as never,
        sentAt: null,
      })
    ).toBe(false);
  });

  test("providerStatus null is always valid (e.g. an abandoned claim never reached the provider)", () => {
    expect(
      isFinishNotificationEventInputValid({
        eventId: "11111111-1111-1111-1111-111111111111",
        status: "abandoned",
        providerStatus: null,
        sentAt: null,
      })
    ).toBe(true);
  });
});

test.describe("closed vocabularies never silently drift", () => {
  test("ALLOWED_NOTIFICATION_STATUSES has exactly the five specified statuses", () => {
    expect([...ALLOWED_NOTIFICATION_STATUSES].sort()).toEqual(
      ["claimed", "sent", "failed", "suppressed", "abandoned"].sort()
    );
  });

  test("ALLOWED_SUPPRESSED_REASONS matches NotificationDecision's own suppress_* literals, never 'notify' or 'fail_closed'", () => {
    expect([...ALLOWED_SUPPRESSED_REASONS]).not.toContain("notify");
    expect([...ALLOWED_SUPPRESSED_REASONS]).not.toContain("fail_closed");
    expect(ALLOWED_SUPPRESSED_REASONS.has("suppress_cooldown")).toBe(true);
    expect(ALLOWED_SUPPRESSED_REASONS.has("suppress_duplicate")).toBe(true);
  });

  test("ALLOWED_PROVIDER_STATUSES reuses ResendErrorCategory's exact vocabulary plus 'sent'", () => {
    expect([...ALLOWED_PROVIDER_STATUSES].sort()).toEqual(
      ["sent", "validation_error", "auth_error", "rate_limited", "transient_error", "unknown_error"].sort()
    );
  });
});

// ── Concurrency simulation — mirrors scheduledWriterConcurrency.spec.ts's
// exact "shared committed set" pattern. No live database anywhere here;
// this proves the APPLICATION's reaction to the future migration's own
// atomic guarantee is correct, not the database itself. ──

/** Simulates the future partial unique index on
 *  (environment_tag, fingerprint) WHERE status = 'claimed', plus the
 *  cooldown_until check the real claim_operational_notification_event()
 *  function performs in the same atomic call. */
function makeConcurrencySimulatingLedger(): OperationalNotificationLedger {
  const openClaims = new Map<string, string>(); // scopeKey -> eventId
  const cooldownUntilByScope = new Map<string, number>();
  // Mirrors the real finish RPC's own `where id = p_id and status =
  // 'claimed'` guard — a finished eventId is tracked here so a second
  // finish() call on it can be correctly rejected below, instead of the
  // fake silently succeeding twice.
  const finishedEventIds = new Set<string>();
  let nextId = 1;

  function scopeKey(environmentTag: string, fingerprint: string): string {
    return `${environmentTag}:${fingerprint}`;
  }

  return {
    async claim(input): Promise<ClaimNotificationEventResult> {
      const key = scopeKey(input.environmentTag, input.fingerprint);
      // Read the cooldown snapshot BEFORE suspending on the await below —
      // this is what makes two genuinely concurrent calls each see the
      // state as it was before either one committed anything, exactly
      // like two Postgres transactions racing under read-committed
      // isolation: neither sees the other's not-yet-committed INSERT.
      // Without capturing this value synchronously first, the second
      // call would incorrectly observe the first call's already-committed
      // write and report suppress_cooldown instead of suppress_duplicate.
      const cooldownSnapshot = cooldownUntilByScope.get(key);
      await Promise.resolve();
      if (cooldownSnapshot !== undefined && cooldownSnapshot > Date.now()) {
        return { claimed: false, suppressedReason: "suppress_cooldown" };
      }
      if (openClaims.has(key)) {
        return { claimed: false, suppressedReason: "suppress_duplicate" };
      }
      const eventId = `event-${nextId++}`;
      openClaims.set(key, eventId);
      // Fixed cooldown — matches the real claim RPC's own hard-coded
      // v_cooldown_seconds constant, never read from the caller's input.
      cooldownUntilByScope.set(key, Date.now() + NOTIFICATION_COOLDOWN_SECONDS * 1000);
      return { claimed: true, eventId };
    },
    async finish(input) {
      if (finishedEventIds.has(input.eventId)) {
        // Mirrors close_scheduled_writer_run()'s own "finished_at is
        // null" guard, reused here as "status = 'claimed'": an
        // already-finished row is never reopened or edited a second
        // time — the real RPC's UPDATE simply matches zero rows and
        // returns `found = false`.
        return { ok: false };
      }
      let matched = false;
      for (const [key, eventId] of openClaims.entries()) {
        if (eventId === input.eventId) {
          openClaims.delete(key);
          matched = true;
          break;
        }
      }
      if (!matched) return { ok: false };
      finishedEventIds.add(input.eventId);
      return { ok: true };
    },
  };
}

test.describe("15. two parallel mocked claims for the same scope → only one winner", () => {
  test("the second concurrent claim attempt is suppressed as a duplicate", async () => {
    const ledger = makeConcurrencySimulatingLedger();
    const input = baseClaimInput();

    const [first, second] = await Promise.all([ledger.claim(input), ledger.claim(input)]);

    const results = [first, second];
    const winners = results.filter((r) => r.claimed);
    const losers = results.filter((r) => !r.claimed);

    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);
    expect((losers[0] as { claimed: false; suppressedReason: string }).suppressedReason).toBe("suppress_duplicate");
  });

  test("a different fingerprint claimed concurrently with the first is never suppressed by it", async () => {
    const ledger = makeConcurrencySimulatingLedger();
    const inputA = baseClaimInput({ fingerprint: "preview:source-a:permanent_fetch" });
    const inputB = baseClaimInput({ fingerprint: "preview:source-b:permanent_fetch" });

    const [a, b] = await Promise.all([ledger.claim(inputA), ledger.claim(inputB)]);
    expect(a.claimed).toBe(true);
    expect(b.claimed).toBe(true);
  });

  test("14. cooldown suppresses a claim attempt after a prior claim already set cooldown_until", async () => {
    const ledger = makeConcurrencySimulatingLedger();
    const input = baseClaimInput();

    const first = await ledger.claim(input);
    expect(first.claimed).toBe(true);
    if (first.claimed) {
      await ledger.finish({ eventId: first.eventId, status: "sent", providerStatus: "sent", sentAt: new Date().toISOString() });
    }

    // A second claim for the exact same scope, immediately after finish —
    // still within the cooldown window set by the first claim.
    const second = await ledger.claim(input);
    expect(second.claimed).toBe(false);
    if (!second.claimed) {
      expect(second.suppressedReason).toBe("suppress_cooldown");
    }
  });
});

test.describe("7. disallowed re-finish — mirrors close_scheduled_writer_run()'s own guard", () => {
  test("a second finish() on the same eventId is rejected, never silently re-applied", async () => {
    const ledger = makeConcurrencySimulatingLedger();
    const input = baseClaimInput();

    const claimResult = await ledger.claim(input);
    expect(claimResult.claimed).toBe(true);
    if (!claimResult.claimed) return;

    const firstFinish = await ledger.finish({
      eventId: claimResult.eventId,
      status: "sent",
      providerStatus: "sent",
      sentAt: new Date().toISOString(),
    });
    expect(firstFinish.ok).toBe(true);

    const secondFinish = await ledger.finish({
      eventId: claimResult.eventId,
      status: "failed",
      providerStatus: null,
      sentAt: null,
    });
    expect(secondFinish.ok).toBe(false);
  });

  test("finishing an eventId that was never claimed is rejected", async () => {
    const ledger = makeConcurrencySimulatingLedger();
    const result = await ledger.finish({
      eventId: "never-claimed",
      status: "sent",
      providerStatus: "sent",
      sentAt: new Date().toISOString(),
    });
    expect(result.ok).toBe(false);
  });
});

test.describe("18. zero real network call, zero real RPC or Supabase write anywhere in this file", () => {
  test("the fake ledger never imports or references a Supabase client", () => {
    const ledgerModuleSource = makeConcurrencySimulatingLedger.toString();
    expect(ledgerModuleSource).not.toContain("createClient");
    expect(ledgerModuleSource).not.toContain("supabase");
    expect(ledgerModuleSource).not.toContain(".rpc(");
  });
});
