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
      <div className="mb-2 sm:mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-snug mb-1">
          Lokalne alerty dla Komorowa, Pruszkowa i okolic.
        </h1>
        {/* Sprint 182A — first real user feedback (Adam's mom, via mailto)
            said the intro had too much text before search/alerts appeared.
            Nothing removed, just moved behind a closed-by-default <details>
            so the first paint is one sentence + search/filters/list. */}
        <details className="mt-1">
          <summary className="text-xs font-medium text-slate-400 dark:text-slate-500 underline underline-offset-2 cursor-pointer w-fit">
            Jak działa Alertownik?
          </summary>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 leading-snug sm:leading-relaxed mt-1.5">
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
        </details>
      </div>

      <AlertList />

      {/* Sprint EXEC-1 (Etap A) — moved from above AlertList to below it,
          mirroring the placement already used on "/" (TodayView.tsx): the
          pilot/independence disclosure stays fully intact and equally easy
          to find, it just no longer sits between the intro and the actual
          search/filters/alerts, which real feedback flagged as too much
          text before the content people came for. Nothing removed. */}
      <BetaStatusCard />
    </main>
  );
}
