import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Sprint 161 — shared server-side admin-session check for Route Handlers.
//
// Architecture note: the browser Supabase client (src/lib/supabaseClient.ts)
// persists its session in localStorage, not in a cookie, so a Route Handler
// has no session available via the request itself — there is nothing for a
// server middleware to read. The smallest safe fix that doesn't touch how
// Supabase Auth stores sessions: the browser sends its current access token
// explicitly as `Authorization: Bearer <token>` (see apiClientAuth.ts), and
// this helper asks Supabase's Auth server to verify that token on every
// request via `auth.getUser(token)`. This never trusts a client-supplied
// "isAdmin" flag, never trusts that a button only appears on an admin page,
// and never uses the service_role key — verification uses the same anon
// key the browser client already uses, because `getUser(jwt)` validates the
// JWT against Supabase's Auth server rather than requiring elevated access.
//
// Sprint 161B — authentication alone is NOT authorization. This project has
// more than one Supabase Auth account, and being *signed in* only proves an
// account exists and is currently valid — it does not prove that account is
// an administrator. The actual admin-membership mechanism, already live and
// proven for `alerts`/`source_checks`/`source_notice_candidates` (see
// docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md and
// docs/SUPABASE_RLS_SECURITY_VERIFICATION_V1.md), is a row in
// `public.admin_profiles` keyed by `user_id`. After `getUser(token)`
// confirms the token is a genuine, currently-valid session, this helper
// additionally checks for that row — using the anon key plus the caller's
// own bearer token (so the query runs as that user, under RLS, via
// `admin_profiles`' own existing self-row SELECT policy), never the
// service_role key. A signed-in non-admin account gets 403, not 401 — the
// token itself was valid, it's the authorization check that failed.

// Generic over the caller's own response union (e.g. FetchPreviewResponse)
// so `return auth.response` type-checks directly against each route's own
// declared return type without a cast at every call site — every route's
// response union already includes an `{ ok: false; error: string }` member.
export type AdminAuthResult<T> =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse<T> };

function unauthorized<T>(): NextResponse<T> {
  // Deliberately generic — never distinguishes "no header" from "expired
  // token" from "Supabase unreachable" for the client, so a caller can't
  // fingerprint auth internals from the response.
  return NextResponse.json({ ok: false, error: "Wymagane logowanie." }, { status: 401 }) as NextResponse<T>;
}

function forbidden<T>(): NextResponse<T> {
  // A different status than unauthorized() on purpose (403 vs 401) — the
  // token was genuinely valid, the account just isn't an admin. Still
  // never explains *why* beyond that, so this can't be used to enumerate
  // which Supabase accounts exist vs. which are admins.
  return NextResponse.json({ ok: false, error: "Brak uprawnień administratora." }, { status: 403 }) as NextResponse<T>;
}

/**
 * Verifies the admin session on an incoming Route Handler request:
 * (1) the bearer token is a genuine, currently-valid Supabase Auth session,
 * and (2) that account has a row in `admin_profiles`. Never logs the
 * token, the session, any cookie value, or the admin_profiles query result.
 */
export async function requireAdminSession<T>(req: Request): Promise<AdminAuthResult<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    // Fail closed — an unconfigured Supabase project must never be treated
    // as "no auth required".
    return { ok: false, response: unauthorized() };
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, response: unauthorized() };
  }
  const token = match[1].trim();
  if (!token) {
    return { ok: false, response: unauthorized() };
  }

  try {
    // Authorization header set globally on this client instance so the
    // admin_profiles query below runs AS this user (RLS sees their
    // auth.uid()), not as the anonymous key's default role.
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (userError || !userData.user) {
      return { ok: false, response: unauthorized() };
    }

    const { data: profileRow, error: profileError } = await client
      .from("admin_profiles")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (profileError || !profileRow) {
      return { ok: false, response: forbidden() };
    }

    return { ok: true, userId: userData.user.id };
  } catch {
    // Supabase unreachable, malformed token, etc. — fail closed, no detail.
    return { ok: false, response: unauthorized() };
  }
}
