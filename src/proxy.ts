import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRestrictedAdminPath } from "@/lib/restrictedAdminPaths";

// Google Play admin/public host separation — ONE Vercel project.
//
// Background: the Android TWA (see AndroidTwaProject/twa-manifest.json)
// verifies the whole `alertownik-mvp.vercel.app` host via Digital Asset
// Links — it has no concept of a path-level scope, so every route on that
// host is technically "inside" the installed Play app, including admin
// tooling that was never meant to be part of the distributed app.
//
// A second Vercel project was considered and rejected: this repo's
// vercel.json declares Vercel Cron Jobs, which Vercel auto-provisions per
// PROJECT — a second project connected to the same repo would silently
// gain its own copies of those cron schedules. Splitting by HOSTNAME
// within the single existing project avoids that entirely: one project,
// one set of crons, two hostnames pointed at the same deployment.
//
//   ALERTOWNIK_ADMIN_HOST unset — combined (today's behavior, unchanged).
//     This is deliberate: this file must not change anything on the
//     existing Production host until a second hostname is explicitly
//     attached to this project and this env var is set to point at it.
//   ALERTOWNIK_ADMIN_HOST=<admin-hostname> — enables the split:
//     - request host === "alertownik-mvp.vercel.app" (the TWA-verified,
//       public host) → surface "public": 404s every admin-only UI route.
//       Public routes are completely unaffected.
//     - request host === ALERTOWNIK_ADMIN_HOST → surface "admin":
//       restricted routes work exactly as they do today. Public routes
//       are deliberately left untouched here too — blocking them adds
//       nothing for the Google Play goal and is pure regression risk.
//     - any OTHER host (localhost, a generated Preview deployment URL, a
//       git-branch alias, ...) → combined/no-op. Deliberate: a Preview
//       branch must never accidentally block itself just because this
//       env var happens to be set somewhere in the project.
//
// Never touches /api/* — the matcher below only lists the admin UI paths,
// so cron/automation routes (their own secret- or requireAdminSession-based
// auth, see src/lib/serverAuth.ts) are never in scope for this proxy at
// all, on any host.
const PUBLIC_HOST = "alertownik-mvp.vercel.app";

type Surface = "public" | "admin" | "combined";

function resolveSurface(requestHostname: string): Surface {
  const adminHost = process.env.ALERTOWNIK_ADMIN_HOST;
  if (!adminHost) return "combined";

  // `NextRequest#nextUrl.hostname` is already port-stripped (per the URL
  // spec `hostname` never includes a port, unlike `host`), so a Host
  // header like "alertownik-mvp.vercel.app:8443" still classifies
  // correctly without any manual port-splitting here.
  const host = requestHostname.toLowerCase();
  if (host === PUBLIC_HOST) return "public";
  if (host === adminHost.trim().toLowerCase()) return "admin";
  return "combined";
}

export function proxy(request: NextRequest) {
  const surface = resolveSurface(request.nextUrl.hostname);

  if (surface === "public" && isRestrictedAdminPath(request.nextUrl.pathname)) {
    // A plain 404, not a redirect and not the login screen — the public
    // surface must never reveal that admin tooling exists at all.
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/login/:path*",
    "/admin",
    "/admin/:path*",
    "/builder",
    "/builder/:path*",
    "/ai-helper",
    "/ai-helper/:path*",
  ],
};
