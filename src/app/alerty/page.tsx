import Link from "next/link";
import { AlertList } from "@/components/AlertList";
import { BetaStatusCard } from "@/components/BetaStatusCard";

export const metadata = {
  title: "Alerty — Alertownik",
  description: "Pełna lista lokalnych alertów — wyszukiwarka, filtr kategorii i Moja okolica.",
};

// Sprint 163 — the full alert list, moved here verbatim from the old "/"
// (same hero copy, same BetaStatusCard, same AlertList component with its
// search/filter/Moja okolica/empty-states — nothing duplicated or
// rewritten). "/" is now the short "Dzisiaj" view (src/app/page.tsx);
// this route is what its "Zobacz wszystkie alerty" link and the mobile
// bottom nav's "Alerty" tab point to.
export default function AlertyPage() {
  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-2 sm:py-10">
      <div className="mb-2 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-snug mb-2">
          Lokalne zmiany i utrudnienia w prostym formacie.
        </h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 leading-snug sm:leading-relaxed">
          Sprawdź, co może dziś wpłynąć na Twój dzień w okolicy. Alertownik
          zbiera w jednym miejscu komunikaty o transporcie, wodzie, prądzie,
          drogach i odpadach dla{" "}
          <span className="font-medium text-slate-600 dark:text-slate-400">Komorowa, Pruszkowa i okolic</span>.
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
          Wczesny pilotaż —{" "}
          <Link href="/about#chce-testowac" className="font-medium text-emerald-600 hover:text-emerald-800 underline">
            zgłoś się jako tester
          </Link>
          .
        </p>
      </div>

      <BetaStatusCard />

      <AlertList />
    </main>
  );
}
