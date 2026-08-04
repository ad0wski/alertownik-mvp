import Link from "next/link";
import { buildFeedbackMailto } from "@/lib/feedbackMailto";

export const metadata = {
  title: "Więcej — Alertownik",
  description: "Ustawienia, informacje o projekcie i kontakt.",
};

interface Row {
  href: string;
  label: string;
  description: string;
}

const rows: Row[] = [
  { href: "/ustawienia", label: "Ustawienia", description: "Wygląd aplikacji — jasny, ciemny, systemowy." },
  { href: "/instalacja", label: "Zainstaluj Alertownik", description: "Dodaj do ekranu głównego telefonu." },
  { href: "/about", label: "O projekcie", description: "Czym jest Alertownik i jak działa pilotaż." },
  { href: "/zasady", label: "Zasady", description: "Zasady korzystania z serwisu." },
  { href: "/prywatnosc", label: "Prywatność", description: "Polityka prywatności." },
  { href: "/partnerzy", label: "Współpraca", description: "Dla gmin, urzędów i partnerów." },
];

// Sprint 163 — a simple, settings-style index for the mobile "Więcej" tab.
// Every row is a link to an existing full page — none of that content is
// duplicated here, this is purely a navigation surface (same role the
// footer already plays on desktop, which stays unchanged).
export default function WiecejPage() {
  const feedbackMailto = buildFeedbackMailto();

  return (
    <main className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-4">
        Więcej
      </h1>

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <Link
            key={row.href}
            href={row.href}
            className="flex items-center justify-between gap-3 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{row.label}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{row.description}</span>
            </span>
            <span className="text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true">→</span>
          </Link>
        ))}

        <a
          href={feedbackMailto}
          className="flex items-center justify-between gap-3 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Kontakt / feedback</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Napisz do nas — pytania, błędy, pomysły.</span>
          </span>
          <span className="text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true">→</span>
        </a>
      </div>
    </main>
  );
}
