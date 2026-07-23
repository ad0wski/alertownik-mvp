import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/serverAuth";
import { getServerEnvironmentIdentity } from "@/lib/environmentIdentity";
import { isEmailAlertsEnabled } from "@/lib/emailAlertConfig";
import {
  getResendCredentialsFromEnv,
  buildOperationalEmailTestIdempotencyKey,
  sendResendEmail,
  type ResendErrorCategory,
} from "@/lib/resendNotificationAdapter";
import { buildOperationalEmailTestContent } from "@/lib/alertEmailTemplate";

// Sprint 166E-2A — Controlled Preview Email Test Mechanism.
//
// POST-only (no GET export — Next.js auto-405s any other method), admin-
// session-gated, Preview-environment-gated, and flag-gated: sends AT MOST
// one real email per deployment, and only when every single one of the
// following is true:
//   1. caller has a verified admin session (requireAdminSession)
//   2. this deployment's server-side VERCEL_ENV is exactly "preview"
//   3. OPERATIONAL_EMAIL_ALERTS_ENABLED === "true"
//   4. RESEND_API_KEY / OPERATIONAL_ALERT_EMAIL_FROM / OPERATIONAL_ALERT_EMAIL_TO
//      are all present
//   5. VERCEL_GIT_COMMIT_SHA is present (so a deterministic idempotency key
//      can be built — see buildOperationalEmailTestIdempotencyKey)
//
// This route never reads req.json() or req.nextUrl.searchParams — there is
// structurally no path for a client to influence the recipient, sender,
// subject, or body of the message. The only "input" is the admin's bearer
// token, checked by requireAdminSession and never used for anything else.
//
// Every response is a closed-vocabulary status string — never
// error.message, a stack trace, an email address, or the API key.

export type OperationalEmailTestResponse =
  | { ok: true; status: "sent" | "disabled" }
  | { ok: false; status: "misconfigured" | "provider_auth_error" | "provider_rate_limited" | "provider_transient_error" | "provider_permanent_error" }
  | { ok: false; error: string };

const CATEGORY_TO_STATUS: Record<
  ResendErrorCategory,
  "provider_auth_error" | "provider_rate_limited" | "provider_transient_error" | "provider_permanent_error"
> = {
  auth_error: "provider_auth_error",
  rate_limited: "provider_rate_limited",
  transient_error: "provider_transient_error",
  validation_error: "provider_permanent_error",
  unknown_error: "provider_permanent_error",
};

export async function POST(req: NextRequest): Promise<NextResponse<OperationalEmailTestResponse>> {
  const auth = await requireAdminSession<OperationalEmailTestResponse>(req);
  if (!auth.ok) return auth.response;

  if (getServerEnvironmentIdentity() !== "preview") {
    return NextResponse.json(
      { ok: false, error: "Ten mechanizm działa wyłącznie w środowisku Preview." },
      { status: 403 }
    );
  }

  if (!isEmailAlertsEnabled(process.env.OPERATIONAL_EMAIL_ALERTS_ENABLED)) {
    return NextResponse.json({ ok: true, status: "disabled" });
  }

  const credentials = getResendCredentialsFromEnv();
  if (!credentials) {
    return NextResponse.json({ ok: false, status: "misconfigured" }, { status: 503 });
  }

  const idempotencyKey = buildOperationalEmailTestIdempotencyKey(process.env.VERCEL_GIT_COMMIT_SHA);
  if (!idempotencyKey) {
    return NextResponse.json({ ok: false, status: "misconfigured" }, { status: 503 });
  }

  const content = buildOperationalEmailTestContent(new Date().toISOString());
  const client = new Resend(credentials.apiKey);
  const outcome = await sendResendEmail(
    client,
    { from: credentials.from, to: credentials.to, subject: content.subject, text: content.textBody },
    { idempotencyKey }
  );

  if (outcome.ok) {
    return NextResponse.json({ ok: true, status: "sent" });
  }

  return NextResponse.json({ ok: false, status: CATEGORY_TO_STATUS[outcome.category] }, { status: 502 });
}
