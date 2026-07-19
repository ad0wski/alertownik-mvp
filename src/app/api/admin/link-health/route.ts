import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/serverAuth";
import {
  checkUrlHealth,
  MAX_LINK_HEALTH_TARGETS_PER_REQUEST,
  type LinkHealthRow,
  type LinkHealthTarget,
} from "@/lib/linkHealthCheck";

// Sprint 164A — Link Health Checker API.
//
// POST /api/admin/link-health — admin-triggered, on-demand only (a button
// in /admin/sources, never a cron target, never listed in vercel.json).
// Same auth gate as /api/sources/fetch-preview (requireAdminSession:
// verified Supabase session + admin_profiles membership). Checks each
// target's reachability via checkUrlHealth (SSRF-guarded HEAD/GET, no body
// read) and returns the results — nothing here writes to Supabase, and no
// alert/source/candidate row is read, created, or modified by this route.

export type LinkHealthResponse =
  | { ok: true; checkedAt: string; results: LinkHealthRow[] }
  | { ok: false; error: string };

export async function POST(req: NextRequest): Promise<NextResponse<LinkHealthResponse>> {
  const auth = await requireAdminSession<LinkHealthResponse>(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const rawTargets = Array.isArray(body.targets) ? body.targets : [];
  if (rawTargets.length === 0) {
    return NextResponse.json({ ok: false, error: "Brak adresów do sprawdzenia." }, { status: 422 });
  }
  if (rawTargets.length > MAX_LINK_HEALTH_TARGETS_PER_REQUEST) {
    return NextResponse.json(
      { ok: false, error: `Zbyt wiele adresów naraz (maks. ${MAX_LINK_HEALTH_TARGETS_PER_REQUEST}).` },
      { status: 422 }
    );
  }

  const targets: LinkHealthTarget[] = [];
  for (const raw of rawTargets) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof (raw as Record<string, unknown>).id === "string" ? (raw as Record<string, unknown>).id as string : "";
    const name = typeof (raw as Record<string, unknown>).name === "string" ? (raw as Record<string, unknown>).name as string : "";
    const url = typeof (raw as Record<string, unknown>).url === "string" ? (raw as Record<string, unknown>).url as string : "";
    if (!id || !url || url.length > 2000) continue;
    targets.push({ id, name: name || url, url });
  }

  if (targets.length === 0) {
    return NextResponse.json({ ok: false, error: "Brak prawidłowych adresów do sprawdzenia." }, { status: 422 });
  }

  const results: LinkHealthRow[] = await Promise.all(
    targets.map(async (target) => {
      const health = await checkUrlHealth(target.url);
      return { ...target, ...health };
    })
  );

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), results });
}
