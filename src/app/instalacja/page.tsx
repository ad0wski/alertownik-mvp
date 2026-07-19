import Link from "next/link";
import { InstallAppButton } from "@/components/InstallAppButton";

export const metadata = {
  title: "Instalacja — Alertownik",
  description:
    "Jak dodać Alertownik do ekranu głównego telefonu lub zainstalować jako aplikację na komputerze.",
};

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
          Alertownik działa w przeglądarce i możesz dodać go do ekranu
          głównego telefonu lub zainstalować na komputerze — będzie otwierał
          się jak osobna aplikacja, bez pobierania czegokolwiek ze sklepu.
          Alertownika nie ma jeszcze w Google Play ani App Store.
        </p>
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

        <section className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
          <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
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
