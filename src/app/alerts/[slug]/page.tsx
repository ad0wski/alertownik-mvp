import { sampleAlerts } from "@/data/sampleAlerts";
import { AlertDetailClient } from "@/components/AlertDetailClient";

export const dynamicParams = true;

export function generateStaticParams() {
  return sampleAlerts.map((alert) => ({ slug: alert.slug }));
}

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AlertDetailClient slug={slug} />;
}
