import type { NotificationStatus } from "@/lib/automationAlerting";

// Sprint 166D-1 — notification adapter interface + the only implementation
// this sprint provides: a no-op. No email SDK is imported (none exists in
// package.json — none is added by this sprint), no fetch is performed, no
// env var is read anywhere in this file. See
// docs/SPRINT_166D_OPERATIONAL_MONITORING_ALERTING_AUDIT_AND_DESIGN_V1.md
// §C.4 — the OFF state here is structural (no code path can send
// anything), not a flag that merely defaults to false.

export interface AlertNotificationInput {
  subject: string;
  textBody: string;
  fingerprint: string;
}

export interface NotificationSendResult {
  ok: boolean;
  status: NotificationStatus;
}

export interface NotificationAdapter {
  send(notification: AlertNotificationInput): Promise<NotificationSendResult>;
}

/** Always reports "disabled" and never performs any I/O — never a
 *  fetch, never a console.log of notification content (which could leak
 *  into logs), never a throw. Enabling real delivery requires a future,
 *  separately-approved sprint to add an email provider package and a new
 *  server-only env var — neither exists in this file or anywhere else
 *  introduced by this sprint. */
export function createNoopNotificationAdapter(): NotificationAdapter {
  return {
    async send(): Promise<NotificationSendResult> {
      return { ok: true, status: "disabled" };
    },
  };
}
