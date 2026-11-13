import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertDetailClient } from "@/components/AlertDetailClient";
import { getPublicAlertServer } from "@/lib/getPublicAlertServer";
import { formatAlertRange } from "@/lib/formatAlertDate";
import type { Alert } from "@/types/alert";

// dynamicParams = true means any slug is accepted and rendered on demand.
// No static pre-generation — alert pages are served dynamically from Supabase.
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** "Reguły, ul. Wiejska · 13.11.2026, 10:00 – 16:00 — <co się zmienia>" */
function describe(alert: Alert): string {
  let when = "";
  try {
    when = alert.startsAt ? formatAlertRange(alert.startsAt, alert.endsAt) : "";
  } catch {
    when = "";
  }
  const head = [alert.place?.trim(), when].filter(Boolean).join(" · ");
  const change = alert.change?.trim();
  return clip([head, change].filter(Boolean).join(" — ") || "Lokalny alert w Alertowniku.", 200);
}

// FINAL-2 — per-alert title, description and Open Graph, so a shared link
// previews the actual alert instead of the generic site card.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicAlertServer(slug);
  if (result.kind !== "found") {
    return { title: "Nie znaleziono alertu — Alertownik", robots: { index: false } };
  }
  const { alert } = result;
  const title = clip(alert.title, 90);
  const description = describe(alert);
  const path = `/alerts/${alert.slug}`;
  return {
    title: `${title} — Alertownik`,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      siteName: "Alertownik",
      locale: "pl_PL",
      title,
      description,
      url: path,
      images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Alertownik" }],
    },
    twitter: { card: "summary", title, description, images: ["/icon-512.png"] },
  };
}

export default async function AlertDetailPage({ params }: Props) {
  const { slug } = await params;
  const result = await getPublicAlertServer(slug);
  // Real HTTP 404 for a missing or archived alert (app/alerts/[slug]/not-found.tsx).
  // Production builds only: in `next dev` the e2e suite serves alerts from
  // browser-side mocks the server cannot see, so dev keeps the client lookup
  // (verified against a production build in tests/pwa/pwa.spec.ts).
  if (result.kind === "not_found" && process.env.NODE_ENV === "production") notFound();
  // "unavailable" (database unreachable/unconfigured) keeps the client-side
  // lookup and its own message — never a false 404 for a real alert.
  return <AlertDetailClient slug={slug} initialAlert={result.kind === "found" ? result.alert : null} />;
}
