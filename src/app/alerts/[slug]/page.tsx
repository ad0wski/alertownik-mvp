import Link from "next/link";
import { sampleAlerts } from "@/data/sampleAlerts";
import { Alert } from "@/types/alert";

export function generateStaticParams() {
  return sampleAlerts.map((alert) => ({ slug: alert.slug }));
}

const categoryLabels: Record<Alert["category"], string> = {
  transport: "Transport",
  water: "Woda",
  power: "Prąd",
  waste: "Odpady",
  roads: "Drogi",
  municipal: "Komunikaty",
};

const severityConfig: Record<
  Alert["severity"],
  { label: string; badge: string; border: string }
> = {
  info: {
    label: "Informacja",
    badge: "bg-blue-100 text-blue-800",
    border: "border-l-blue-400",
  },
  warning: {
    label: "Uwaga",
    badge: "bg-amber-100 text-amber-800",
    border: "border-l-amber-400",
  },
  critical: {
    label: "Pilne",
    badge: "bg-red-100 text-red-800",
    border: "border-l-red-500",
  },
};

function formatDateTime(iso: string): string {
  if (iso.includes("T")) {
    const [datePart, timePart] = iso.split("T");
    const [year, month, day] = datePart.split("-");
    return `${day}.${month}.${year}, godz. ${timePart}`;
  }
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function formatRange(startsAt: string, endsAt?: string): string {
  if (!endsAt) return formatDateTime(startsAt);

  const startDate = startsAt.split("T")[0];
  const endDate = endsAt.split("T")[0];

  if (startDate === endDate && startsAt.includes("T") && endsAt.includes("T")) {
    const [year, month, day] = startDate.split("-");
    return `${day}.${month}.${year}, godz. ${startsAt.split("T")[1]} – ${endsAt.split("T")[1]}`;
  }

  return `${formatDateTime(startsAt)} – ${formatDateTime(endsAt)}`;
}

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const alert = sampleAlerts.find((a) => a.slug === slug);

  if (!alert) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-10">
          <p className="text-gray-700 mb-4">Nie znaleziono alertu.</p>
          <Link
            href="/"
            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← Wróć do listy alertów
          </Link>
        </div>
      </main>
    );
  }

  const severity = severityConfig[alert.severity];
  const isRealLink = Boolean(alert.sourceUrl && alert.sourceUrl !== "#");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Back link */}
        <Link
          href="/"
          className="inline-block text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors mb-6"
        >
          ← Wróć do listy alertów
        </Link>

        {/* Card */}
        <article
          className={`bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 ${severity.border} p-6 flex flex-col gap-4`}
        >
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 rounded-full px-3 py-1">
              {categoryLabels[alert.category]}
            </span>
            <span
              className={`text-xs font-semibold uppercase tracking-wide rounded-full px-3 py-1 ${severity.badge}`}
            >
              {severity.label}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-gray-900 leading-snug">
            {alert.title}
          </h1>

          {/* Compact line */}
          <p className="text-sm text-gray-500">
            {alert.place} · {formatRange(alert.startsAt, alert.endsAt)}
          </p>

          {/* Detail sections */}
          <dl className="border-t border-gray-100 pt-4 flex flex-col divide-y divide-gray-100">
            <div className="flex flex-col sm:flex-row py-3 gap-1 sm:gap-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 sm:w-36 shrink-0">
                Kiedy
              </dt>
              <dd className="text-sm text-gray-800">
                {formatRange(alert.startsAt, alert.endsAt)}
              </dd>
            </div>

            <div className="flex flex-col sm:flex-row py-3 gap-1 sm:gap-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 sm:w-36 shrink-0">
                Gdzie
              </dt>
              <dd className="text-sm text-gray-800">{alert.place}</dd>
            </div>

            <div className="flex flex-col sm:flex-row py-3 gap-1 sm:gap-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 sm:w-36 shrink-0">
                Co się zmienia
              </dt>
              <dd className="text-sm text-gray-800">{alert.change}</dd>
            </div>

            <div className="flex flex-col sm:flex-row py-3 gap-1 sm:gap-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 sm:w-36 shrink-0">
                Co zrobić
              </dt>
              <dd className="text-sm text-gray-800">{alert.action}</dd>
            </div>

            <div className="flex flex-col sm:flex-row py-3 gap-1 sm:gap-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 sm:w-36 shrink-0">
                Źródło
              </dt>
              <dd className="text-sm text-gray-800 flex flex-wrap items-center gap-3">
                <span>{alert.sourceName}</span>
                {isRealLink ? (
                  <a
                    href={alert.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Zobacz źródło →
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">
                    Źródło niedostępne
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </article>
      </div>
    </main>
  );
}
