import Link from "next/link";
import { AlertList } from "@/components/AlertList";
import { BetaStatusCard } from "@/components/BetaStatusCard";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-2 sm:py-10">

      {/* Hero — Sprint 156B: value-first, shortened to two short sentences
          so a mobile visitor reaches the actual alert list without a long
          scroll (real-device finding: text used to dominate the first
          viewport). Category chips and the 60s-explainer row were dropped
          from the hero itself — the category filter buttons right below
          already show every category, and /about still carries the longer
          explainer for anyone who wants it. Margins/padding on this page
          and in AlertList/BetaStatusCard were also tightened on mobile so
          the top of the first alert card clears the fold at 390×844
          (real-device requirement — verified via screenshot). */}
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
