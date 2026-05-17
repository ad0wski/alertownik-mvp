import { AlertCard } from "@/components/AlertCard";
import { sampleAlerts } from "@/data/sampleAlerts";
import { AlertCategory } from "@/types/alert";

const categoryFilters: { label: string; value: AlertCategory | "all" }[] = [
  { label: "Wszystkie", value: "all" },
  { label: "Transport", value: "transport" },
  { label: "Woda", value: "water" },
  { label: "Prąd", value: "power" },
  { label: "Odpady", value: "waste" },
  { label: "Drogi", value: "roads" },
  { label: "Komunikaty", value: "municipal" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Alertownik
          </h1>
          <p className="mt-2 text-gray-500 text-base">
            Lokalne utrudnienia i zmiany w Twojej okolicy
          </p>
        </header>

        {/* Category filters (visual only) */}
        <div className="flex flex-wrap gap-2 mb-8">
          {categoryFilters.map((filter) => (
            <button
              key={filter.value}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                filter.value === "all"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Alert list */}
        <section className="flex flex-col gap-4">
          {sampleAlerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </section>
      </div>
    </main>
  );
}
