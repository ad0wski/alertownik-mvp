import { supabase } from "@/lib/supabaseClient";

// Sprint 161 — pairs with src/lib/serverAuth.ts. The three admin-triggered
// API routes (fetch-preview, sources/check, ai/draft-alert) now require a
// verified session, and since the Supabase browser client keeps its session
// in localStorage (not a cookie), the request itself carries nothing a
// server could check unless we attach it explicitly here.
//
// Every existing caller's fetch(...) is replaced with authFetch(...) — same
// signature, same response shape, the only change is one extra header.

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;

  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
