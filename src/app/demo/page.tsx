import Image from "next/image";
import Link from "next/link";
import { buildPilotInterestMailto } from "@/lib/feedbackMailto";

// Sprint 185A — a short, public, no-login demo page meant to be sent as a
// single link to a gmina/powiat/partner deciding whether to look further.
// Deliberately separate from /partnerzy (which stays as the fuller
// cooperation page with all cooperation types and legal-adjacent detail —
// this page is the 2-3 minute version for a first look, plain language
// only, no technical terms like "cron", "RLS", "parser", "dedup").

export const metadata = {
  title: "Zobacz Alertownik — demo dla gmin i partnerów",
  description:
    "Krótkie demo Alertownika: lokalne komunikaty dla Komorowa, Pruszkowa i okolic w jednym miejscu, zebrane z oficjalnych źródeł.",
};

const cardClass =
  "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5";
const h2Class = "text-base font-semibold text-slate-900 dark:text-white mb-2";
const pClass = "text-sm text-slate-600 dark:text-slate-400 leading-relaxed";

const whatItDoes = [
  "Zbiera komunikaty z oficjalnych źródeł — stron gmin, miasta, powiatu, WKD, PGE Dystrybucja.",
  "Porządkuje je według miejsca i kategorii.",
  "Pokazuje mieszkańcowi tylko najważniejsze, aktualne informacje.",
  "Ogranicza duplikaty i nieaktualne wpisy.",
];

const scopeCategories = ["drogi", "komunikaty gminne", "transport (WKD)", "wodociągi"];

export default function DemoPage() {
  return (
    <main className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mb-3">
          Lokalne komunikaty w jednym miejscu
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed">
          Ważne informacje dla mieszkańców — o drogach, wodzie, prądzie, odpadach
          i komunikacji — są dziś rozproszone po wielu stronach urzędów i
          przewoźników. Alertownik zbiera je w jednym miejscu.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <section className={cardClass}>
          <h2 className={h2Class}>Co robi Alertownik</h2>
          <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
            {whatItDoes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className={cardClass}>
          <h2 className={h2Class}>Jak to działa</h2>
          <ol className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed list-decimal list-inside space-y-1.5">
            <li>Oficjalne źródło publikuje komunikat.</li>
            <li>Alertownik go znajduje i sprawdza.</li>
            <li>Powstaje alert — z miejscem, datą i linkiem do źródła.</li>
            <li>Mieszkaniec widzi go w aplikacji.</li>
          </ol>
        </section>

        <section className={cardClass}>
          <h2 className={h2Class}>Zobacz sami</h2>
          <p className={`${pClass} mb-3`}>
            Prawdziwy zrzut ekranu działającej aplikacji — bez retuszu, bez
            wymyślonych danych.
          </p>
          <Image
            src="/screenshots/alerty-narrow.png"
            alt="Lista alertów Alertownika z wyszukiwarką i filtrowaniem kategorii"
            width={390}
            height={844}
            className="rounded-lg border border-slate-200 dark:border-slate-800 w-full max-w-[280px] h-auto mx-auto"
          />
        </section>

        <section className={cardClass}>
          <h2 className={h2Class}>Obecny zakres pilotażu</h2>
          <p className={pClass}>
            Gmina Michałowice, Miasto Pruszków i Powiat Pruszkowski — komunikaty{" "}
            {scopeCategories.join(", ")}, w zakresie, który już działa.
          </p>
        </section>

        <section className={cardClass}>
          <h2 className={h2Class}>Uczciwie o statusie</h2>
          <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
            <li>To wczesny pilot — wciąż rozwijany i testowany.</li>
            <li>Alertownik to niezależny projekt.</li>
            <li>Nie jest oficjalną aplikacją żadnej gminy, WKD, PGE ani innej instytucji.</li>
            <li>Część źródeł jest sprawdzana automatycznie, ale każdy alert zatwierdza człowiek przed publikacją.</li>
          </ul>
        </section>

        <section className={cardClass}>
          <h2 className={h2Class}>Zobacz więcej</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/"
              className="min-h-[44px] inline-flex items-center justify-center rounded-lg bg-blue-600 dark:bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors"
            >
              Zobacz działającą aplikację →
            </Link>
            <Link
              href="/alerty"
              className="min-h-[44px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
            >
              Zobacz wszystkie alerty →
            </Link>
            <a
              href={buildPilotInterestMailto()}
              className="min-h-[44px] inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              Zgłoś zainteresowanie pilotażem →
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
