import { Alert } from "@/types/alert";

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

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function formatDateRange(dateFrom: string, dateTo?: string): string {
  if (!dateTo || dateTo === dateFrom) return formatDate(dateFrom);
  return `${formatDate(dateFrom)} – ${formatDate(dateTo)}`;
}

export function AlertCard({ alert }: { alert: Alert }) {
  const severity = severityConfig[alert.severity];

  return (
    <article
      className={`bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 ${severity.border} p-5 flex flex-col gap-3`}
    >
      {/* Top row: category + severity */}
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
      <h2 className="text-base font-semibold text-gray-900 leading-snug">
        {alert.title}
      </h2>

      {/* Location + date */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
        <span>{alert.location}</span>
        <span>{formatDateRange(alert.dateFrom, alert.dateTo)}</span>
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-700 leading-relaxed">{alert.summary}</p>

      {/* Action */}
      <div className="bg-gray-50 rounded-lg px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Co zrobić
        </p>
        <p className="text-sm text-gray-800">{alert.action}</p>
      </div>

      {/* Source */}
      <p className="text-xs text-gray-400">Źródło: {alert.source}</p>
    </article>
  );
}
