import { test, expect } from "@playwright/test";
import {
  evaluateNotificationEligibility,
  buildSafeSummary,
  claimEventForSending,
  sendViaAdapter,
  finalizeOperationalNotificationEvent,
} from "@/lib/operationalNotificationOrchestrator";
import type { OperationalNotificationLedger, ClaimNotificationEventResult } from "@/lib/operationalNotificationLedger";
import { createNoopNotificationAdapter, type NotificationAdapter, type NotificationSendResult } from "@/lib/notificationAdapter";
import { SAFE_SUMMARY_MAX_LENGTH } from "@/lib/operationalNotificationLedger";

/**
 * Sprint 166F-1 — orchestration-layer tests. Every "ledger" and
 * "adapter" here is a plain in-memory fake — no Supabase client, no
 * Resend client, no fetch, ever constructed in this file. This
 * deliberately proves the orchestrator NEVER reaches for a real
 * collaborator itself; it only ever calls whatever was injected.
 */

function fakeLedger(claimResult: ClaimNotificationEventResult): OperationalNotificationLedger & {
  claimCalls: unknown[];
  finishCalls: unknown[];
} {
  const claimCalls: unknown[] = [];
  const finishCalls: unknown[] = [];
  return {
    claimCalls,
    finishCalls,
    async claim(input) {
      claimCalls.push(input);
      return claimResult;
    },
    async finish(input) {
      finishCalls.push(input);
      return { ok: true };
    },
  };
}

function fakeAdapter(result: NotificationSendResult): NotificationAdapter & { sendCalls: unknown[] } {
  const sendCalls: unknown[] = [];
  return {
    sendCalls,
    async send(notification) {
      sendCalls.push(notification);
      return result;
    },
  };
}

test.describe("evaluateNotificationEligibility — composes the tested policy/classifier builders", () => {
  test("a permanent failure with no prior alert → notify, critical-adjacent severity carried through", () => {
    const result = evaluateNotificationEligibility({
      category: "permanent_fetch",
      attemptsMade: 1,
      isAbandonedRun: false,
      lastAlertSentAt: null,
    });
    expect(result.decision).toBe("notify");
    expect(result.severity).toBe("critical");
    expect(result.eventType).toBe("permanent_fetch");
  });

  test("a success event never notifies", () => {
    const result = evaluateNotificationEligibility({
      category: "none",
      attemptsMade: 0,
      isAbandonedRun: false,
      lastAlertSentAt: null,
    });
    expect(result.decision).toBe("suppress_success");
  });
});

test.describe("12. buildSafeSummary — sanitization, never a secret or raw error", () => {
  test("only closed-vocabulary labels, a source name, and counts ever appear", () => {
    const summary = buildSafeSummary({
      eventType: "permanent_fetch",
      sourceName: "Gmina Michałowice — komunikaty",
      attemptsMade: 2,
      maxAttemptsPerRun: 2,
    });
    expect(summary).toContain("trwały błąd pobierania");
    expect(summary).toContain("Gmina Michałowice — komunikaty");
    expect(summary).toContain("2/2");
  });

  test("never contains anything resembling a secret, API key, or stack trace fragment", () => {
    const summary = buildSafeSummary({
      eventType: "credentials_not_configured",
      sourceName: null,
      attemptsMade: 0,
      maxAttemptsPerRun: 2,
    });
    expect(summary).not.toMatch(/re_[a-zA-Z0-9]/);
    expect(summary).not.toMatch(/https?:\/\//);
    expect(summary).not.toContain("node_modules");
    expect(summary).not.toContain("at Object");
  });

  test("abandoned_run gets its own fixed Polish phrase, never falls through to the generic fallback", () => {
    const summary = buildSafeSummary({
      eventType: "abandoned_run",
      sourceName: null,
      attemptsMade: 0,
      maxAttemptsPerRun: 2,
    });
    expect(summary).toContain("porzucone uruchomienie");
  });

  test("13. output is always within the ledger's own length cap, even defensively", () => {
    const summary = buildSafeSummary({
      eventType: "permanent_fetch",
      sourceName: "x".repeat(1000),
      attemptsMade: 1,
      maxAttemptsPerRun: 2,
    });
    expect(summary.length).toBeLessThanOrEqual(SAFE_SUMMARY_MAX_LENGTH);
  });
});

test.describe("claimEventForSending — delegates entirely to the injected ledger, performs no I/O itself", () => {
  test("a successful claim returns claimed:true and passes a deterministic fingerprint through", async () => {
    const ledger = fakeLedger({ claimed: true, eventId: "event-1" });
    const result = await claimEventForSending(ledger, {
      environmentTag: "preview",
      scopeKey: "michalowice-komunikaty",
      eventType: "permanent_fetch",
      severity: "critical",
      scheduledWriterRunId: null,
      sourceId: "michalowice-komunikaty",
      safeSummary: "trwały błąd pobierania",
      cooldownSeconds: 21_600,
    });
    expect(result).toEqual({ claimed: true, eventId: "event-1" });
    expect(ledger.claimCalls.length).toBe(1);
    expect((ledger.claimCalls[0] as { fingerprint: string }).fingerprint).toBe(
      "preview:michalowice-komunikaty:permanent_fetch"
    );
  });

  test("a suppressed claim (cooldown) is passed through unchanged", async () => {
    const ledger = fakeLedger({ claimed: false, suppressedReason: "suppress_cooldown" });
    const result = await claimEventForSending(ledger, {
      environmentTag: "preview",
      scopeKey: "run",
      eventType: "abandoned_run",
      severity: "critical",
      scheduledWriterRunId: "run-id-1",
      sourceId: null,
      safeSummary: null,
      cooldownSeconds: 21_600,
    });
    expect(result).toEqual({ claimed: false, suppressedReason: "suppress_cooldown" });
  });

  test("rejects an over-length safeSummary before ever calling the ledger", async () => {
    const ledger = fakeLedger({ claimed: true, eventId: "should-not-happen" });
    await expect(
      claimEventForSending(ledger, {
        environmentTag: "preview",
        scopeKey: "michalowice-komunikaty",
        eventType: "permanent_fetch",
        severity: "critical",
        scheduledWriterRunId: null,
        sourceId: "michalowice-komunikaty",
        safeSummary: "x".repeat(SAFE_SUMMARY_MAX_LENGTH + 1),
        cooldownSeconds: 21_600,
      })
    ).rejects.toThrow();
    expect(ledger.claimCalls.length).toBe(0);
  });
});

test.describe("16/17. sendViaAdapter — never sends automatically, zero real network call", () => {
  test("only sends when explicitly called with an already-decided-to-send notification", async () => {
    const adapter = fakeAdapter({ ok: true, status: "sent" });
    const result = await sendViaAdapter(adapter, {
      subject: "test",
      textBody: "test body",
      fingerprint: "preview:run:abandoned_run",
    });
    expect(result).toEqual({ ok: true, status: "sent" });
    expect(adapter.sendCalls.length).toBe(1);
  });

  test("the noop adapter (this sprint's only real-world default) never performs I/O and always reports disabled", async () => {
    const adapter = createNoopNotificationAdapter();
    const result = await sendViaAdapter(adapter, { subject: "s", textBody: "b", fingerprint: "f" });
    expect(result).toEqual({ ok: true, status: "disabled" });
  });
});

test.describe("finalizeOperationalNotificationEvent — maps NotificationStatus onto the ledger's closed finish vocabulary", () => {
  test("'sent' → status: sent, providerStatus: sent, sentAt populated", async () => {
    const ledger = fakeLedger({ claimed: true, eventId: "unused" });
    await finalizeOperationalNotificationEvent(ledger, {
      eventId: "event-1",
      sendResult: { ok: true, status: "sent" },
    });
    const call = ledger.finishCalls[0] as { status: string; providerStatus: string | null; sentAt: string | null };
    expect(call.status).toBe("sent");
    expect(call.providerStatus).toBe("sent");
    expect(call.sentAt).not.toBeNull();
  });

  test("'send_failed' → status: failed, no providerStatus guessed", async () => {
    const ledger = fakeLedger({ claimed: true, eventId: "unused" });
    await finalizeOperationalNotificationEvent(ledger, {
      eventId: "event-1",
      sendResult: { ok: false, status: "send_failed" },
    });
    const call = ledger.finishCalls[0] as { status: string; providerStatus: string | null };
    expect(call.status).toBe("failed");
    expect(call.providerStatus).toBeNull();
  });

  test("'disabled' and 'no_adapter_configured' → status: abandoned, never 'failed' (the send never genuinely happened)", async () => {
    const ledger = fakeLedger({ claimed: true, eventId: "unused" });
    await finalizeOperationalNotificationEvent(ledger, { eventId: "e1", sendResult: { ok: true, status: "disabled" } });
    await finalizeOperationalNotificationEvent(ledger, {
      eventId: "e2",
      sendResult: { ok: false, status: "no_adapter_configured" },
    });
    for (const call of ledger.finishCalls as { status: string }[]) {
      expect(call.status).toBe("abandoned");
    }
  });
});

test.describe("17. zero real network call anywhere in the orchestrator module itself", () => {
  test("the orchestrator module source never references fetch, Resend, or a Supabase client constructor", () => {
    const sourceFns = [
      evaluateNotificationEligibility,
      buildSafeSummary,
      claimEventForSending,
      sendViaAdapter,
      finalizeOperationalNotificationEvent,
    ];
    for (const fn of sourceFns) {
      expect(fn.toString()).not.toContain("fetch(");
      expect(fn.toString()).not.toContain("Resend(");
      expect(fn.toString()).not.toContain("createClient(");
    }
  });
});
