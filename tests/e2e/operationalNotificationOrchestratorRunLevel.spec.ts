import { test, expect } from "@playwright/test";
import {
  orchestrateRunLevelNotification,
  attemptOperationalNotification,
  type OrchestrateRunNotificationInput,
} from "@/lib/operationalNotificationOrchestrator";
import type {
  OperationalNotificationLedger,
  ClaimNotificationEventResult,
  ClaimNotificationEventInput,
  FinishNotificationEventInput,
} from "@/lib/operationalNotificationLedger";
import type { NotificationAdapter, NotificationSendResult, AlertNotificationInput } from "@/lib/notificationAdapter";

/**
 * Sprint 166G-1 — run-level orchestration wiring tests. Every "ledger" and
 * "adapter" is a plain in-memory fake, exactly matching the existing
 * convention in operationalNotificationOrchestrator.spec.ts. No Supabase
 * client, no Resend client, no fetch, no real network anywhere in this
 * file — proves the two new composed functions (orchestrateRunLevelNotification,
 * attemptOperationalNotification) never reach for a real collaborator.
 */

function fakeLedger(options: {
  claimResult?: ClaimNotificationEventResult;
  claimThrows?: boolean;
  finishResult?: { ok: boolean };
  finishThrows?: boolean;
} = {}): OperationalNotificationLedger & { claimCalls: ClaimNotificationEventInput[]; finishCalls: FinishNotificationEventInput[] } {
  const claimCalls: ClaimNotificationEventInput[] = [];
  const finishCalls: FinishNotificationEventInput[] = [];
  return {
    claimCalls,
    finishCalls,
    async claim(input) {
      claimCalls.push(input);
      if (options.claimThrows) throw new Error("simulated claim failure — never real network");
      return options.claimResult ?? { claimed: true, eventId: "fake-event-id" };
    },
    async finish(input) {
      finishCalls.push(input);
      if (options.finishThrows) throw new Error("simulated finish failure — never real network");
      return options.finishResult ?? { ok: true };
    },
  };
}

function fakeAdapter(options: { result?: NotificationSendResult; throws?: boolean } = {}): NotificationAdapter & {
  sendCalls: AlertNotificationInput[];
} {
  const sendCalls: AlertNotificationInput[] = [];
  return {
    sendCalls,
    async send(notification) {
      sendCalls.push(notification);
      if (options.throws) throw new Error("simulated adapter failure — never real network");
      return options.result ?? { ok: true, status: "disabled" };
    },
  };
}

const BASE_INPUT: OrchestrateRunNotificationInput = {
  environmentTag: "preview",
  runOutcome: "total_failure",
  scheduledWriterRunId: "fake-run-id",
  sourcesFailed: 1,
  sourcesChecked: 1,
};

test.describe("orchestrateRunLevelNotification — policy gate", () => {
  test("a success outcome is suppressed — zero claim, zero adapter", async () => {
    const ledger = fakeLedger();
    const adapter = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, { ...BASE_INPUT, runOutcome: "success" });
    expect(ledger.claimCalls.length).toBe(0);
    expect(adapter.sendCalls.length).toBe(0);
  });

  test("a skipped_kill_switch outcome is suppressed — zero claim, zero adapter", async () => {
    const ledger = fakeLedger();
    const adapter = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, { ...BASE_INPUT, runOutcome: "skipped_kill_switch" });
    expect(ledger.claimCalls.length).toBe(0);
    expect(adapter.sendCalls.length).toBe(0);
  });

  test("a skipped_lock_held outcome is suppressed — zero claim, zero adapter", async () => {
    const ledger = fakeLedger();
    const adapter = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, { ...BASE_INPUT, runOutcome: "skipped_lock_held" });
    expect(ledger.claimCalls.length).toBe(0);
    expect(adapter.sendCalls.length).toBe(0);
  });

  test("an abandoned outcome DOES notify — never silently collapsed into lock_held suppression", async () => {
    const ledger = fakeLedger();
    const adapter = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, { ...BASE_INPUT, runOutcome: "abandoned" });
    expect(ledger.claimCalls.length).toBe(1);
  });

  test("total_failure and partial_failure both notify", async () => {
    for (const outcome of ["total_failure", "partial_failure"] as const) {
      const ledger = fakeLedger();
      const adapter = fakeAdapter();
      await orchestrateRunLevelNotification(ledger, adapter, { ...BASE_INPUT, runOutcome: outcome });
      expect(ledger.claimCalls.length).toBe(1);
    }
  });
});

test.describe("orchestrateRunLevelNotification — claim outcomes", () => {
  test("claim suppressed by duplicate → zero adapter, zero finish", async () => {
    const ledger = fakeLedger({ claimResult: { claimed: false, suppressedReason: "suppress_duplicate" } });
    const adapter = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, BASE_INPUT);
    expect(adapter.sendCalls.length).toBe(0);
    expect(ledger.finishCalls.length).toBe(0);
  });

  test("claim suppressed by cooldown → zero adapter, zero finish", async () => {
    const ledger = fakeLedger({ claimResult: { claimed: false, suppressedReason: "suppress_cooldown" } });
    const adapter = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, BASE_INPUT);
    expect(adapter.sendCalls.length).toBe(0);
    expect(ledger.finishCalls.length).toBe(0);
  });

  test("claim won + no-op/disabled adapter → exactly one adapter call and one finish with status abandoned (never sent)", async () => {
    const ledger = fakeLedger({ claimResult: { claimed: true, eventId: "evt-1" } });
    const adapter = fakeAdapter({ result: { ok: true, status: "disabled" } });
    await orchestrateRunLevelNotification(ledger, adapter, BASE_INPUT);
    expect(adapter.sendCalls.length).toBe(1);
    expect(ledger.finishCalls.length).toBe(1);
    expect(ledger.finishCalls[0].status).toBe("abandoned");
    expect(ledger.finishCalls[0].eventId).toBe("evt-1");
  });

  test("claim won + adapter success → exactly one finish with status sent", async () => {
    const ledger = fakeLedger({ claimResult: { claimed: true, eventId: "evt-2" } });
    const adapter = fakeAdapter({ result: { ok: true, status: "sent" } });
    await orchestrateRunLevelNotification(ledger, adapter, BASE_INPUT);
    expect(ledger.finishCalls.length).toBe(1);
    expect(ledger.finishCalls[0].status).toBe("sent");
    expect(ledger.finishCalls[0].sentAt).not.toBeNull();
  });

  test("claim won + adapter provider error → exactly one finish with status failed", async () => {
    const ledger = fakeLedger({ claimResult: { claimed: true, eventId: "evt-3" } });
    const adapter = fakeAdapter({ result: { ok: false, status: "send_failed" } });
    await orchestrateRunLevelNotification(ledger, adapter, BASE_INPUT);
    expect(ledger.finishCalls.length).toBe(1);
    expect(ledger.finishCalls[0].status).toBe("failed");
  });

  test("exactly one claim call per invocation — never two for the same run", async () => {
    const ledger = fakeLedger({ claimResult: { claimed: true, eventId: "evt-4" } });
    const adapter = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, BASE_INPUT);
    expect(ledger.claimCalls.length).toBe(1);
  });

  test("adapter is never called more than once — no retry of the send", async () => {
    const ledger = fakeLedger({ claimResult: { claimed: true, eventId: "evt-5" } });
    const adapter = fakeAdapter({ result: { ok: false, status: "send_failed" } });
    await orchestrateRunLevelNotification(ledger, adapter, BASE_INPUT);
    expect(adapter.sendCalls.length).toBe(1);
  });

  test("source_id is always null and scheduled_writer_run_id passes through — a run-level event has no single source", async () => {
    const ledger = fakeLedger({ claimResult: { claimed: true, eventId: "evt-6" } });
    const adapter = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, { ...BASE_INPUT, scheduledWriterRunId: "run-xyz" });
    expect(ledger.claimCalls[0].sourceId).toBeNull();
    expect(ledger.claimCalls[0].scheduledWriterRunId).toBe("run-xyz");
  });

  test("a null scheduledWriterRunId (e.g. never obtained) is handled without throwing", async () => {
    const ledger = fakeLedger({ claimResult: { claimed: true, eventId: "evt-7" } });
    const adapter = fakeAdapter();
    await expect(
      orchestrateRunLevelNotification(ledger, adapter, { ...BASE_INPUT, scheduledWriterRunId: null })
    ).resolves.toBeUndefined();
    expect(ledger.claimCalls[0].scheduledWriterRunId).toBeNull();
  });

  test("safe_summary passed to claim never contains a raw error, URL, or stack fragment", async () => {
    const ledger = fakeLedger({ claimResult: { claimed: true, eventId: "evt-8" } });
    const adapter = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, BASE_INPUT);
    const summary = ledger.claimCalls[0].safeSummary ?? "";
    expect(summary).not.toMatch(/re_[a-zA-Z0-9]/);
    expect(summary).not.toMatch(/https?:\/\//);
    expect(summary).not.toContain("node_modules");
  });

  test("fingerprint is deterministic and differs by environment and event type", async () => {
    const ledgerA = fakeLedger({ claimResult: { claimed: true, eventId: "evt-9" } });
    const adapter = fakeAdapter();
    await orchestrateRunLevelNotification(ledgerA, adapter, { ...BASE_INPUT, environmentTag: "preview" });
    await orchestrateRunLevelNotification(ledgerA, adapter, { ...BASE_INPUT, environmentTag: "preview" });
    expect(ledgerA.claimCalls[0].fingerprint).toBe(ledgerA.claimCalls[1].fingerprint);

    const ledgerB = fakeLedger({ claimResult: { claimed: true, eventId: "evt-10" } });
    await orchestrateRunLevelNotification(ledgerB, adapter, { ...BASE_INPUT, environmentTag: "production" });
    expect(ledgerB.claimCalls[0].fingerprint).not.toBe(ledgerA.claimCalls[0].fingerprint);
  });
});

test.describe("attemptOperationalNotification — never affects the caller, whatever fails", () => {
  test("claim throws → resolves without throwing, zero adapter, zero finish", async () => {
    const ledger = fakeLedger({ claimThrows: true });
    const adapter = fakeAdapter();
    await expect(attemptOperationalNotification(ledger, adapter, BASE_INPUT)).resolves.toBeUndefined();
    expect(adapter.sendCalls.length).toBe(0);
    expect(ledger.finishCalls.length).toBe(0);
  });

  test("adapter throws → resolves without throwing", async () => {
    const ledger = fakeLedger({ claimResult: { claimed: true, eventId: "evt-11" } });
    const adapter = fakeAdapter({ throws: true });
    await expect(attemptOperationalNotification(ledger, adapter, BASE_INPUT)).resolves.toBeUndefined();
    // finish is never reached because sendViaAdapter itself threw.
    expect(ledger.finishCalls.length).toBe(0);
  });

  test("finish throws → resolves without throwing", async () => {
    const ledger = fakeLedger({ claimResult: { claimed: true, eventId: "evt-12" }, finishThrows: true });
    const adapter = fakeAdapter();
    await expect(attemptOperationalNotification(ledger, adapter, BASE_INPUT)).resolves.toBeUndefined();
    expect(adapter.sendCalls.length).toBe(1);
  });

  test("a success outcome resolves cleanly with zero I/O at all", async () => {
    const ledger = fakeLedger();
    const adapter = fakeAdapter();
    await expect(
      attemptOperationalNotification(ledger, adapter, { ...BASE_INPUT, runOutcome: "success" })
    ).resolves.toBeUndefined();
    expect(ledger.claimCalls.length).toBe(0);
    expect(adapter.sendCalls.length).toBe(0);
  });
});
