import { AlertDetailClient } from "@/components/AlertDetailClient";

// dynamicParams = true means any slug is accepted and rendered on demand.
// No static pre-generation — alert pages are served dynamically from Supabase.
export const dynamicParams = true;

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AlertDetailClient slug={slug} />;
}
