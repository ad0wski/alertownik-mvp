// Sprint 165B — Isolated Preview Code Safety Package v1.
//
// Single source of truth for "which Vercel environment is this deployment
// running in" — Production, Preview, Development, or Unknown. Every other
// place in this codebase that needs to know the running environment
// (the admin badge, the database-environment guard) calls one of the two
// functions below rather than reading `process.env.VERCEL_ENV` or
// `NODE_ENV` itself — so there is exactly one mapping from raw string to
// identity, never a second, possibly-drifted comparison elsewhere.
//
// Deliberately reads Vercel's own `VERCEL_ENV` system variable (server)
// and its `NEXT_PUBLIC_VERCEL_ENV` mirror (client) — both automatically
// populated by Vercel for every deployment, requiring zero manual
// configuration and zero new secret. Never derived from the site's
// hostname, a custom cookie, or any value a client request could
// influence. An unrecognized or missing value resolves to "unknown" —
// never guessed, never defaulted to a specific known environment — so
// every caller can treat "unknown" as the conservative, fail-closed case.
//
// No function here ever reads or exposes NEXT_PUBLIC_SUPABASE_URL, a
// Supabase project ref, or any credential — this module knows nothing
// about which database is configured, only which Vercel environment is
// running. See databaseEnvironmentGuard.ts for the (separate, additive)
// check that a database is actually the right one for this environment.

export type EnvironmentIdentity = "production" | "preview" | "development" | "unknown";

const KNOWN_IDENTITIES: ReadonlySet<string> = new Set(["production", "preview", "development"]);

/** The one mapping from a raw VERCEL_ENV-shaped string to an
 *  EnvironmentIdentity. Case-insensitive, trims whitespace, and treats
 *  anything not exactly one of the three known values — including empty
 *  string, undefined, null, or a typo — as "unknown". */
export function resolveEnvironmentIdentity(raw: string | undefined | null): EnvironmentIdentity {
  if (!raw) return "unknown";
  const normalized = raw.trim().toLowerCase();
  return KNOWN_IDENTITIES.has(normalized) ? (normalized as EnvironmentIdentity) : "unknown";
}

/** Server-side resolution (Route Handlers, Server Components, Middleware).
 *  Reads `VERCEL_ENV` — never available to the browser bundle, never
 *  logged by this function. */
export function getServerEnvironmentIdentity(): EnvironmentIdentity {
  return resolveEnvironmentIdentity(process.env.VERCEL_ENV);
}

/** Client-side resolution. Reads `NEXT_PUBLIC_VERCEL_ENV`, which Next.js
 *  inlines as a literal string constant at build time — the exact same
 *  value `getServerEnvironmentIdentity()` resolves for that same
 *  deployment, computed from the same build, not a runtime fetch. This is
 *  what prevents a hydration mismatch: server-rendered HTML and the
 *  client's first render both evaluate the same constant, so they can
 *  never disagree, unlike a value read asynchronously after mount. */
export function getClientEnvironmentIdentity(): EnvironmentIdentity {
  return resolveEnvironmentIdentity(process.env.NEXT_PUBLIC_VERCEL_ENV);
}

/** Display labels only — never used for any security decision. A guard
 *  must always branch on the EnvironmentIdentity value itself, never on
 *  this label text. */
export const ENVIRONMENT_LABELS: Record<EnvironmentIdentity, string> = {
  production: "PRODUCTION",
  preview: "PREVIEW",
  development: "DEVELOPMENT",
  unknown: "UNKNOWN",
};
