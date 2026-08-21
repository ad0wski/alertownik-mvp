import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRestrictedAdminPath } from "@/lib/restrictedAdminPaths";

// Google Play admin/public host separation.
//
// Background: the Android TWA (see AndroidTwaProject/twa-manifest.json)
// verifies the whole `alertownik-mvp.vercel.app` host via Digital Asset
// Links — it has no concept of a path-level scope, so every route on that
// host is technically "inside" the installed Play app, including admin
// tooling that was never meant to be part of the distributed app. This
// file lets the SAME codebase serve two different Vercel projects/hosts
// with different behavior, controlled entirely by one env var:
//
//   ALERTOWNIK_SURFACE=public — the TWA-verified host. 404s every
//     admin-only UI route so the Play app never serves or links to admin
//     tooling. Public routes are completely unaffected.
//   ALERTOWNIK_SURFACE=admin  — a separate, non-TWA host used only by the
//     project owner. Restricted routes work exactly as they do today.
//     Public routes are deliberately left untouched here too — blocking
//     them adds nothing for the Google Play goal and is pure added
//     regression risk.
//   unset / any other value  — combined (today's behavior, unchanged).
//     This is deliberate: this commit alone must not change anything
//     until a Vercel project is explicitly configured with the env var.
//
// Never touches /api/* — the matcher below only lists the admin UI paths,
// so cron/automation routes (their own secret- or requireAdminSession-based
// auth, see src/lib/serverAuth.ts) are never in scope for this proxy at
// all, regardless of surface.
export function proxy(request: NextRequest) {
  if (process.env.ALERTOWNIK_SURFACE !== "public") {
    return NextResponse.next();
  }

  if (isRestrictedAdminPath(request.nextUrl.pathname)) {
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
