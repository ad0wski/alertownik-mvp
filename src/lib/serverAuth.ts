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
// Any authenticated Supabase Auth user counts as admin, matching the existing
// model (see AGENTS.md/CLAUDE.md: "Any authenticated user is treated as
// admin" — there is no public sign-up flow, so a valid session already
// implies admin).

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

/**
 * Verifies the admin session on an incoming Route Handler request.
 * Never logs the token, the session, or any cookie value.
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
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
      return { ok: false, response: unauthorized() };
    }
    return { ok: true, userId: data.user.id };
  } catch {
    // Supabase unreachable, malformed token, etc. — fail closed, no detail.
    return { ok: false, response: unauthorized() };
  }
}
