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
import { createNoopNotificationAdapter } from "@/lib/notificationAdapter";
import { decideNotificationAdapterKind, createConfiguredNotificationAdapter } from "@/lib/notificationAdapterFactory";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Sprint 166M-C — full, realistic claim→finish code-level simulation.
 *
 * This is the code-level substitute for the Production canary that Sprint
 * 166M-B's audit found has no safe existing path (see
 * docs/SPRINT_166M_PRODUCTION_NOTIFICATION_CANARY_DESIGN_V1.md). Every
 * collaborator here is either a real, pure module from src/lib (the
 * orchestrator itself, the real noop adapter, the real adapter factory) or
 * an in-memory fake that reproduces the REAL Postgres RPC's own documented
 * semantics (duplicate suppression via a partial unique index, cooldown via
 * cooldown_until, stale-claim self-healing) — see
 * docs/sql/PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql
 * §5 (claim_operational_notification_event) for the exact behavior this
 * fake mirrors. ZERO real network call, ZERO real Supabase client, ZERO
 * real Resend client, ZERO CRON_SECRET, ZERO writer credentials anywhere in
 * this file — no fetch is ever mocked or installed, so any accidental I/O
 * attempt would fail the test outright rather than silently succeed.
 */

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return fn().finally(() => {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
}

const CLEAR_EMAIL_ENV = {
  OPERATIONAL_EMAIL_ALERTS_ENABLED: undefined,
  RESEND_API_KEY: undefined,
  OPERATIONAL_ALERT_EMAIL_FROM: undefined,
  OPERATIONAL_ALERT_EMAIL_TO: undefined,
};

/** Reproduces the real claim_operational_notification_event() RPC's
 *  documented behavior closely enough to test the application's reaction to
 *  it: (a) a partial-unique-index-style duplicate guard on an open
 *  ("claimed") row per (environmentTag, fingerprint), (b) a cooldown_until
 *  set at claim time (fixed 21600s, matching NOTIFICATION_COOLDOWN_SECONDS
 *  — never caller-controllable), and (c) stale-claim self-healing: any
 *  claim() call first auto-abandons a same-fingerprint row that has been
 *  'claimed' longer than staleClaimAfterSeconds, exactly like the real
 *  function's own leading `update ... set status = 'abandoned' ...
 *  where status = 'claimed' and claimed_at < now() - interval`. */
function makeRealisticLedger(options: { clockMs?: () => number } = {}): OperationalNotificationLedger & {
  claimCalls: ClaimNotificationEventInput[];
  finishCalls: FinishNotificationEventInput[];
  openClaimCount: () => number;
} {
  const now = options.clockMs ?? (() => Date.now());
  const claimCalls: ClaimNotificationEventInput[] = [];
  const finishCalls: FinishNotificationEventInput[] = [];
  interface Row {
    eventId: string;
    status: "claimed" | "sent" | "failed" | "abandoned";
    claimedAtMs: number;
    cooldownUntilMs: number;
  }
  const rowsByScope = new Map<string, Row[]>(); // scopeKey -> rows, newest last

  function scopeKey(environmentTag: string, fingerprint: string): string {
    return `${environmentTag}:${fingerprint}`;
  }

  let nextId = 1;

  return {
    claimCalls,
    finishCalls,
    openClaimCount: () =>
      [...rowsByScope.values()].reduce((sum, rows) => sum + rows.filter((r) => r.status === "claimed").length, 0),
    async claim(input): Promise<ClaimNotificationEventResult> {
      claimCalls.push(input);
      const key = scopeKey(input.environmentTag, input.fingerprint);
      const rows = rowsByScope.get(key) ?? [];
      const nowMs = now();
      const staleAfterMs = (input.staleClaimAfterSeconds ?? 300) * 1000;

      // Stale-claim self-healing — runs on every claim attempt, mirrors the
      // real RPC's unconditional leading UPDATE.
      for (const row of rows) {
        if (row.status === "claimed" && nowMs - row.claimedAtMs >= staleAfterMs) {
          row.status = "abandoned";
        }
      }

      const latest = rows[rows.length - 1];
      if (latest && latest.cooldownUntilMs > nowMs) {
        return { claimed: false, suppressedReason: "suppress_cooldown" };
      }
      if (rows.some((r) => r.status === "claimed")) {
        return { claimed: false, suppressedReason: "suppress_duplicate" };
      }

      const eventId = `event-${nextId++}`;
      rows.push({
        eventId,
        status: "claimed",
        claimedAtMs: nowMs,
        cooldownUntilMs: nowMs + 21_600_000,
      });
      rowsByScope.set(key, rows);
      return { claimed: true, eventId };
    },
    async finish(input) {
      finishCalls.push(input);
      for (const rows of rowsByScope.values()) {
        const row = rows.find((r) => r.eventId === input.eventId);
        if (!row) continue;
        if (row.status !== "claimed") return { ok: false }; // mirrors `where status = 'claimed'`
        row.status = input.status;
        return { ok: true };
      }
      return { ok: false };
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

const FORCED_FAILURE_INPUT: OrchestrateRunNotificationInput = {
  environmentTag: "production-code-canary",
  runOutcome: "total_failure",
  scheduledWriterRunId: "sim-run-1",
  sourcesFailed: 1,
  sourcesChecked: 1,
};

test.describe("166M-C — one forced non-success run produces exactly one full claim→finish cycle", () => {
  test("noop adapter (real module) → terminal status is abandoned, never sent; zero open claims left", async () => {
    const ledger = makeRealisticLedger();
    const adapter = createNoopNotificationAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, FORCED_FAILURE_INPUT);

    expect(ledger.claimCalls.length).toBe(1);
    expect(ledger.finishCalls.length).toBe(1);
    expect(ledger.finishCalls[0].status).toBe("abandoned");
    expect(ledger.finishCalls[0].sentAt).toBeNull();
    expect(ledger.openClaimCount()).toBe(0);
  });

  test("adapter reporting a real send → terminal status is sent, with a real sentAt timestamp; zero open claims left", async () => {
    const ledger = makeRealisticLedger();
    const adapter = fakeAdapter({ result: { ok: true, status: "sent" } });
    await orchestrateRunLevelNotification(ledger, adapter, FORCED_FAILURE_INPUT);

    expect(ledger.finishCalls.length).toBe(1);
    expect(ledger.finishCalls[0].status).toBe("sent");
    expect(ledger.finishCalls[0].sentAt).not.toBeNull();
    expect(ledger.openClaimCount()).toBe(0);
  });

  test("a success outcome triggers zero claim, zero adapter call, zero finish", async () => {
    const ledger = makeRealisticLedger();
    const adapter = fakeAdapter();
    await orchestrateRunLevelNotification(ledger, adapter, { ...FORCED_FAILURE_INPUT, runOutcome: "success" });
    expect(ledger.claimCalls.length).toBe(0);
    expect(adapter.sendCalls.length).toBe(0);
    expect(ledger.finishCalls.length).toBe(0);
  });
});

test.describe("166M-C — a second run for the same event can never reprocess it", () => {
  test("an immediate second run (same environment+fingerprint) is suppressed by cooldown — zero additional adapter/finish calls", async () => {
    const ledger = makeRealisticLedger();
    const adapter = fakeAdapter({ result: { ok: true, status: "sent" } });

    await orchestrateRunLevelNotification(ledger, adapter, FORCED_FAILURE_INPUT);
    expect(adapter.sendCalls.length).toBe(1);
    expect(ledger.finishCalls.length).toBe(1);

    // A second, independent run — same scope, new scheduled_writer_run id,
    // exactly as a real second Cron invocation would look.
    await orchestrateRunLevelNotification(ledger, adapter, { ...FORCED_FAILURE_INPUT, scheduledWriterRunId: "sim-run-2" });

    expect(ledger.claimCalls.length).toBe(2); // both attempts reach claim()
    expect(adapter.sendCalls.length).toBe(1); // but only the first ever sends
    expect(ledger.finishCalls.length).toBe(1); // and only the first ever finishes
  });

  test("two genuinely concurrent runs for the same fingerprint → exactly one processed end to end", async () => {
    const ledger = makeRealisticLedger();
    const adapter = fakeAdapter({ result: { ok: true, status: "sent" } });

    await Promise.all([
      orchestrateRunLevelNotification(ledger, adapter, FORCED_FAILURE_INPUT),
      orchestrateRunLevelNotification(ledger, adapter, { ...FORCED_FAILURE_INPUT, scheduledWriterRunId: "sim-run-parallel-2" }),
    ]);

    expect(ledger.claimCalls.length).toBe(2);
    expect(adapter.sendCalls.length).toBe(1);
    expect(ledger.finishCalls.length).toBe(1);
    expect(ledger.finishCalls[0].status).toBe("sent");
    expect(ledger.openClaimCount()).toBe(0);
  });
});

test.describe("166M-C — process-restart safety", () => {
  test("the orchestrator carries no in-memory state of its own — a 'restarted process' (fresh call, same injected ledger) still sees the prior claim via the ledger, not via any local cache", async () => {
    const ledger = makeRealisticLedger();
    const adapterBeforeRestart = fakeAdapter({ result: { ok: true, status: "sent" } });
    await orchestrateRunLevelNotification(ledger, adapterBeforeRestart, FORCED_FAILURE_INPUT);
    expect(ledger.finishCalls.length).toBe(1);

    // Simulate a process restart: a brand new adapter instance (as a fresh
    // Node process would construct), the SAME ledger (standing in for the
    // persisted Postgres table, which is exactly what survives a restart
    // in Production), and a call with no shared closure state at all beyond
    // the two injected collaborators.
    const adapterAfterRestart = fakeAdapter({ result: { ok: true, status: "sent" } });
    await orchestrateRunLevelNotification(ledger, adapterAfterRestart, {
      ...FORCED_FAILURE_INPUT,
      scheduledWriterRunId: "sim-run-after-restart",
    });

    expect(adapterAfterRestart.sendCalls.length).toBe(0); // still within cooldown — correctly suppressed
    expect(ledger.finishCalls.length).toBe(1); // unchanged — no reprocessing after "restart"
  });

  test("structural: operationalNotificationOrchestrator.ts declares no module-level mutable state (no dedup cache a restart could lose or that could leak across requests)", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "src", "lib", "operationalNotificationOrchestrator.ts"),
      "utf8"
    );
    // Every exported function takes its ledger/adapter as a parameter; the
    // only "let"/"const {mutable}" allowed at module scope is none at all —
    // this file has no top-level `let`, no top-level `new Map`, no
    // top-level array literal used as a cache.
    const moduleLevelLines = source
      .split("\n")
      .filter((line) => !/^\s/.test(line)) // top-level (column 0) lines only
      .join("\n");
    expect(moduleLevelLines).not.toMatch(/^let /m);
    expect(moduleLevelLines).not.toMatch(/^const \w+ = new Map/m);
    expect(moduleLevelLines).not.toMatch(/^const \w+: .*\[\] = \[\]/m);
  });
});

test.describe("166M-C — adapter failure modes", () => {
  test("adapter throws mid-send → resolves cleanly via attemptOperationalNotification, but the event is left 'claimed' (open) — this is expected: the real RPC self-heals a stale claim on the NEXT claim() attempt for the same fingerprint, never by this process retrying", async () => {
    const ledger = makeRealisticLedger();
    const adapter = fakeAdapter({ throws: true });
    await expect(attemptOperationalNotification(ledger, adapter, FORCED_FAILURE_INPUT)).resolves.toBeUndefined();

    expect(ledger.finishCalls.length).toBe(0);
    expect(ledger.openClaimCount()).toBe(1); // documented transient state, not a bug

    // Prove the self-healing clears the STUCK-OPEN bookkeeping (the row
    // moves from 'claimed' to 'abandoned' so it never counts as an
    // indefinitely-open claim) — but, matching the real RPC exactly
    // (cooldown_until is set at original claim time and the cooldown
    // lookup does not filter by status), reclaiming the SAME fingerprint
    // is still correctly blocked for the rest of the original 6-hour
    // cooldown window. This is a real, accepted residual risk — not a bug
    // this session fixes — see
    // docs/SPRINT_166M_OPERATIONAL_NOTIFICATION_CODE_CANARY_CHECKPOINT_V1.md:
    // an adapter-level crash silently consumes a full cooldown window with
    // nothing ever having been sent. Changing this would mean changing
    // already-deployed Production SQL, out of scope for a code-only
    // session.
    let simulatedNowMs = Date.now();
    const staleTolerantLedger = makeRealisticLedger({ clockMs: () => simulatedNowMs });
    const throwingAdapter = fakeAdapter({ throws: true });
    await attemptOperationalNotification(staleTolerantLedger, throwingAdapter, FORCED_FAILURE_INPUT);
    expect(staleTolerantLedger.openClaimCount()).toBe(1);

    simulatedNowMs += 301_000; // past the default 300s staleClaimAfterSeconds
    const stillThrottledAdapter = fakeAdapter({ result: { ok: true, status: "sent" } });
    const secondAttempt = await staleTolerantLedger.claim({
      environmentTag: FORCED_FAILURE_INPUT.environmentTag,
      channel: "email",
      eventType: "unexpected_error",
      severity: "critical",
      fingerprint: `${FORCED_FAILURE_INPUT.environmentTag}:run:unexpected_error`,
      scheduledWriterRunId: "sim-run-after-self-heal",
      sourceId: null,
      safeSummary: null,
      staleClaimAfterSeconds: 300,
    });
    expect(staleTolerantLedger.openClaimCount()).toBe(0); // self-healed: no longer stuck open
    expect(secondAttempt).toEqual({ claimed: false, suppressedReason: "suppress_cooldown" }); // but still throttled
    void stillThrottledAdapter; // never invoked — claim never won
  });

  test("adapter reports send_failed → finish is called with status failed, event is not left open", async () => {
    const ledger = makeRealisticLedger();
    const adapter = fakeAdapter({ result: { ok: false, status: "send_failed" } });
    await orchestrateRunLevelNotification(ledger, adapter, FORCED_FAILURE_INPUT);
    expect(ledger.finishCalls[0].status).toBe("failed");
    expect(ledger.openClaimCount()).toBe(0);
  });

  test("claim RPC itself throws → attemptOperationalNotification swallows it, zero adapter call, zero finish call", async () => {
    const throwingLedger: OperationalNotificationLedger = {
      async claim() {
        throw new Error("simulated RPC failure — never real network");
      },
      async finish() {
        return { ok: true };
      },
    };
    const adapter = fakeAdapter();
    await expect(attemptOperationalNotification(throwingLedger, adapter, FORCED_FAILURE_INPUT)).resolves.toBeUndefined();
    expect(adapter.sendCalls.length).toBe(0);
  });
});

test.describe("166M-C — the email kill switch, proven end to end through the real factory", () => {
  test("OPERATIONAL_EMAIL_ALERTS_ENABLED=false (or absent) → the real factory selects noop, and a full orchestrated run never contacts Resend (no fetch mock installed at all — any network attempt would throw)", async () => {
    await withEnv({ ...CLEAR_EMAIL_ENV }, async () => {
      expect(decideNotificationAdapterKind()).toBe("noop");
      const adapter = createConfiguredNotificationAdapter();
      const ledger = makeRealisticLedger();

      await orchestrateRunLevelNotification(ledger, adapter, FORCED_FAILURE_INPUT);

      expect(ledger.finishCalls.length).toBe(1);
      expect(ledger.finishCalls[0].status).toBe("abandoned");
      expect(ledger.finishCalls[0].providerStatus).toBeNull();
      expect(ledger.finishCalls[0].sentAt).toBeNull();
    });
  });

  test("OPERATIONAL_EMAIL_ALERTS_ENABLED=true but misconfigured (no Resend credentials) → still zero I/O, finish status abandoned, never sent", async () => {
    await withEnv({ ...CLEAR_EMAIL_ENV, OPERATIONAL_EMAIL_ALERTS_ENABLED: "true" }, async () => {
      expect(decideNotificationAdapterKind()).toBe("misconfigured");
      const adapter = createConfiguredNotificationAdapter();
      const ledger = makeRealisticLedger();

      await orchestrateRunLevelNotification(ledger, adapter, FORCED_FAILURE_INPUT);

      expect(ledger.finishCalls[0].status).toBe("abandoned");
    });
  });
});

test.describe("166M-C — never touches alerts or candidates, structurally", () => {
  test("operationalNotificationOrchestrator.ts never references the alerts or source_notice_candidates tables, or any Supabase/Resend client construction", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "src", "lib", "operationalNotificationOrchestrator.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/\balerts\b/i);
    expect(source).not.toMatch(/source_notice_candidates/i);
    expect(source).not.toContain("createClient");
    expect(source).not.toContain("new Resend");
    expect(source).not.toContain("supabase");
  });
});

test.describe("166M-C — notify fires only for the outcomes operationalNotificationPolicy actually predicts", () => {
  // Exhaustive over every RunOutcome value as of this sprint (see
  // src/lib/scheduledWriterRunSafety.ts). If a new RunOutcome value is ever
  // added, this list must be updated — TypeScript's RunOutcome type on
  // FORCED_FAILURE_INPUT above keeps the individual overrides below type-checked.
  const expectations: Array<{ outcome: OrchestrateRunNotificationInput["runOutcome"]; shouldClaim: boolean }> = [
    { outcome: "success", shouldClaim: false },
    { outcome: "partial_failure", shouldClaim: true },
    { outcome: "total_failure", shouldClaim: true },
    { outcome: "skipped_kill_switch", shouldClaim: false },
    { outcome: "skipped_lock_held", shouldClaim: false },
    { outcome: "abandoned", shouldClaim: true },
  ];

  for (const { outcome, shouldClaim } of expectations) {
    test(`${outcome} → claim ${shouldClaim ? "attempted" : "never attempted"}`, async () => {
      const ledger = makeRealisticLedger();
      const adapter = fakeAdapter();
      await orchestrateRunLevelNotification(ledger, adapter, { ...FORCED_FAILURE_INPUT, runOutcome: outcome });
      expect(ledger.claimCalls.length).toBe(shouldClaim ? 1 : 0);
    });
  }
});
