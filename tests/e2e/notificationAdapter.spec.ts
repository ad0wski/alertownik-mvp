import { test, expect } from "@playwright/test";
import { createNoopNotificationAdapter } from "@/lib/notificationAdapter";

/**
 * Sprint 166D-1 — the no-op notification adapter must never perform I/O
 * and must always report "disabled". No fetch is mocked here because none
 * should ever be attempted — a real network call would make this test
 * either hang or fail against an unreachable host, which is itself proof
 * the adapter tried to do something it must never do.
 */

test.describe("createNoopNotificationAdapter", () => {
  test("send() always resolves ok:true, status:disabled", async () => {
    const adapter = createNoopNotificationAdapter();
    const result = await adapter.send({
      subject: "test",
      textBody: "test body",
      fingerprint: "preview:wkd-aktualnosci:transient_fetch",
    });
    expect(result).toEqual({ ok: true, status: "disabled" });
  });

  test("send() ignores the input entirely — same result regardless of content", async () => {
    const adapter = createNoopNotificationAdapter();
    const a = await adapter.send({ subject: "", textBody: "", fingerprint: "" });
    const b = await adapter.send({
      subject: "very different subject",
      textBody: "very different body with lots of content",
      fingerprint: "different:fingerprint:here",
    });
    expect(a).toEqual(b);
  });

  test("two independently created adapters behave identically (no hidden shared state)", async () => {
    const adapterA = createNoopNotificationAdapter();
    const adapterB = createNoopNotificationAdapter();
    const resultA = await adapterA.send({ subject: "s", textBody: "b", fingerprint: "f" });
    const resultB = await adapterB.send({ subject: "s", textBody: "b", fingerprint: "f" });
    expect(resultA).toEqual(resultB);
  });
});
