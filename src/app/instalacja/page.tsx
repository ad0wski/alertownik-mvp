import Link from "next/link";
import { InstallAppButton } from "@/components/InstallAppButton";
import { buildFeedbackMailto } from "@/lib/feedbackMailto";

export const metadata = {
  title: "Instalacja — Alertownik",
  description:
    "Jak dodać Alertownik do ekranu głównego telefonu lub zainstalować jako aplikację na komputerze.",
};

// LR-8A — public copy. The tester checklist and "send tester feedback"
// block (Sprint 189) are gone: this page must stay true for any visitor,
// before and after a store release, so it makes no claim either way about
// app stores and describes only what works today in the browser.
const AFTER_INSTALL_ITEMS = [
  "Ustaw swoją miejscowość: Alerty → „Ustaw moją okolicę\".",
  "Każdy alert ma link do oficjalnego komunikatu — możesz sprawdzić źródło.",
  "W zakładce Odpady zobaczysz najbliższe terminy odbioru (na razie dla Komorowa).",
];

const sectionClass = "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5";
const h2Class = "text-base font-semibold text-slate-900 dark:text-white mb-2";
const listClass = "text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-decimal list-inside leading-relaxed";

export default function InstalacjaPage() {
  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors mb-5 sm:mb-6 group"
      >
        <span className="group-hover:-translate-x-0.5 transition-transform inline-block">←</span>
        Wróć do listy alertów
      </Link>

      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-2">
          Zainstaluj Alertownik
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Alertownik działa w przeglądarce. Możesz dodać go do ekranu
          głównego telefonu albo zainstalować na komputerze — otworzy się
          wtedy jak osobna aplikacja, bez zakładania konta.
        </p>
        <details className="mt-2">
          <summary className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none hover:text-slate-600 dark:hover:text-slate-300">
            Szczegóły techniczne
          </summary>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
            Alertownik działa w przeglądarce i po dodaniu do ekranu głównego
            otwiera się jak osobna aplikacja — bez pobierania niczego ze
            sklepu.
          </p>
        </details>
      </div>

      <div className="mb-6">
        <InstallAppButton />
      </div>

      <div className="flex flex-col gap-4">
        <section className={sectionClass}>
          <h2 className={h2Class}>Android / Chrome</h2>
          <ol className={listClass}>
            <li>Otwórz Alertownik w przeglądarce Chrome.</li>
            <li>
              Dotknij menu <span aria-hidden="true">⋮</span> i wybierz
              „Zainstaluj aplikację" lub „Dodaj do ekranu głównego".
            </li>
            <li>Uruchom Alertownik z ikony na ekranie głównym.</li>
          </ol>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>iPhone / Safari</h2>
          <ol className={listClass}>
            <li>Otwórz Alertownik w przeglądarce Safari.</li>
            <li>
              Dotknij przycisku Udostępnij (kwadrat ze strzałką w górę) na
              dolnym pasku.
            </li>
            <li>Wybierz „Do ekranu początkowego" i zatwierdź.</li>
            <li>Uruchom Alertownik z ikony na ekranie głównym.</li>
          </ol>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-2">
            Na iPhonie i iPadzie powiadomienia (jeśli je włączysz) działają
            tylko w Alertowniku dodanym do ekranu początkowego, w systemie
            iOS 16.4 lub nowszym.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Komputer / Chrome lub Edge</h2>
          <ol className={listClass}>
            <li>
              Otwórz Alertownik w przeglądarce Chrome lub Edge na komputerze.
            </li>
            <li>
              Użyj ikony instalacji w pasku adresu (lub menu przeglądarki) i
              wybierz „Zainstaluj".
            </li>
            <li>Alertownik uruchomi się jako osobne okno aplikacji.</li>
          </ol>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Po instalacji</h2>
          <ol className={listClass}>
            {AFTER_INSTALL_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Coś nie działa?</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
            Napisz do nas — pytania, błędy i pomysły pomagają ulepszać
            Alertownik.
          </p>
          <a
            href={buildFeedbackMailto()}
            className="inline-flex items-center justify-center min-h-[44px] rounded-xl bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-400 text-white text-sm font-medium px-4 py-2.5 transition-colors"
          >
            Napisz do nas
          </a>
        </section>

        <section className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Nazwy opcji mogą się nieznacznie różnić w zależności od wersji
            telefonu i przeglądarki. Zainstalowana ikona otwiera zwykłą
            stronę Alertownika — nie instaluje niczego dodatkowego poza tym,
            co widzisz już w przeglądarce.
          </p>
        </section>
      </div>
    </main>
  );
}
