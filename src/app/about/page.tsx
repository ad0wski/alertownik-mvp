import Link from "next/link";
import { buildFeedbackMailto } from "@/lib/feedbackMailto";
import { FeedbackQuickOptions } from "@/components/FeedbackQuickOptions";
import { INDEPENDENCE_DISCLAIMER, OFFICIAL_INFORMATION_SOURCES } from "@/lib/officialInformationSources";

export const metadata = {
  title: "O projekcie — Alertownik",
  description: "Czym jest Alertownik, jak działa i jak skontaktować się z autorem.",
};

export default function AboutPage() {
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
          O projekcie
        </h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 leading-relaxed">
          Alertownik to lokalny serwis alertów — w jednym miejscu zbiera
          informacje z oficjalnych komunikatów, przede wszystkim o przerwach w
          dostawie wody, utrudnieniach na drogach, odpadach i innych sprawach
          gminnych.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <section
          id="niezaleznosc"
          aria-labelledby="niezaleznosc-heading"
          className="rounded-2xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4 sm:p-5"
        >
          <h2 id="niezaleznosc-heading" className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Niezależny projekt
          </h2>
          <p className="text-sm sm:text-base text-slate-800 dark:text-slate-100 leading-relaxed">
            {INDEPENDENCE_DISCLAIMER}
          </p>
        </section>

        <section
          id="zrodla"
          aria-labelledby="zrodla-heading"
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5"
        >
          <h2 id="zrodla-heading" className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Oficjalne źródła informacji
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
            Wszystkie informacje w Alertowniku pochodzą z poniższych oficjalnych
            stron. Przy każdym alercie znajdziesz też bezpośredni link do
            konkretnego komunikatu („Zobacz źródło”).
          </p>
          <ul className="flex flex-col gap-3">
            {OFFICIAL_INFORMATION_SOURCES.map((source) => (
              <li key={source.url} className="border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {source.institution} — {source.label}
                </p>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-700 dark:text-blue-300 underline break-all hover:text-blue-800"
                >
                  {source.url}
                </a>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
                  {source.usedFor}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Lokalny pilotaż
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Alertownik działa jako publiczny, lokalny pilotaż. Zasięg jest
            celowo ograniczony do okolic opisanych niżej, a funkcje i wygląd
            serwisu mogą się jeszcze zmieniać.
          </p>
        </section>

        <section id="zasieg" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Zasięg
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
            Alertownik obejmuje rejon gminy Michałowice (m.in. Komorów, Nowa
            Wieś, Granica, Michałowice, Reguły, Opacz). Komunikaty gminy są
            sprawdzane automatycznie dwa razy dziennie, a każdy alert publikuje
            administrator po sprawdzeniu źródła. Pojedyncze alerty o Pruszkowie
            i kolei WKD dodaje ręcznie administrator — na podstawie oficjalnych
            źródeł wymienionych wyżej.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Najbardziej pomocny feedback to: zgłoszenie alertu, który jest
            nieaktualny albo błędny, informacja o ważnym komunikacie, którego
            nie zauważyliśmy, oraz sugestie nowych okolic lub źródeł do
            monitorowania.
          </p>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Kto przygotowuje alerty
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Każdy alert jest przygotowywany i publikowany przez administratora
            serwisu na podstawie komunikatów z oficjalnych źródeł wymienionych
            wyżej. Do przygotowania
            treści admin może korzystać z pomocy AI, ale AI nigdy nie publikuje
            alertów samodzielnie. Komunikaty gminy są sprawdzane automatycznie,
            ale każdy alert trafia na stronę główną dopiero wtedy, gdy
            administrator sprawdzi źródło i go zatwierdzi.
          </p>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Źródła pozostają najważniejsze
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Alertownik ułatwia szybkie zorientowanie się w sytuacji, ale nie
            zastępuje oficjalnych komunikatów. W razie wątpliwości warto sprawdzić
            źródło podane przy danym alercie — to ono jest ostatecznym
            potwierdzeniem informacji.
          </p>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Znane ograniczenia
          </h2>
          <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
            <li>To lokalny pilotaż — funkcje i wygląd mogą się jeszcze zmieniać.</li>
            <li>Automatycznie sprawdzamy na razie jedno źródło — komunikaty gminy Michałowice. Pozostałe źródła z listy wyżej mają tylko pojedyncze alerty.</li>
            <li>Alerty są zatwierdzane ręcznie przez admina po sprawdzeniu źródła, nie w czasie rzeczywistym.</li>
            <li>AI pomaga przygotować szkic alertu, ale nigdy nie publikuje go samodzielnie.</li>
            <li>Oficjalne źródła pozostają ostatecznym potwierdzeniem informacji — Alertownik je tylko ułatwia znaleźć.</li>
          </ul>
        </section>

        <section id="jak-zaczac" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Jak zacząć w minutę
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
            Kilka kroków, które pokazują, o co chodzi w aplikacji:
          </p>
          <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>Sprawdź swoją okolicę — w „Moja okolica" wpisz miejscowość albo zaznacz kategorie.</li>
            <li>Zobacz aktualne alerty na liście.</li>
            <li>Sprawdź „Odpady" albo źródło przy wybranym alercie („Zobacz źródło →").</li>
            <li>Masz uwagę albo widzisz błąd? Napisz — wystarczy jedno zdanie.</li>
            <li>
              Opcjonalnie{" "}
              <a href="#instalacja" className="font-medium text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-300 underline">
                dodaj stronę do ekranu głównego telefonu
              </a>
              .
            </li>
          </ol>
        </section>

        <section id="instalacja" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Dodaj Alertownik do ekranu głównego
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
            Alertownik działa w przeglądarce i możesz dodać go do ekranu
            głównego telefonu — będzie otwierał się jak aplikacja, bez
            pobierania czegokolwiek ze sklepu.
          </p>
          <div className="flex flex-col gap-3">
            <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-3">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-1.5">
                Android (Chrome)
              </p>
              <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside leading-relaxed">
                <li>Otwórz Alertownik w przeglądarce Chrome.</li>
                <li>Dotknij menu <span aria-hidden="true">⋮</span> w prawym górnym rogu.</li>
                <li>Wybierz „Dodaj do ekranu głównego" (na niektórych telefonach: „Zainstaluj aplikację").</li>
              </ol>
            </div>
            <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-3">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-1.5">
                iPhone (Safari)
              </p>
              <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside leading-relaxed">
                <li>Otwórz Alertownik w przeglądarce Safari.</li>
                <li>Dotknij przycisku udostępniania (kwadrat ze strzałką w górę).</li>
                <li>Przewiń w dół i wybierz „Dodaj do ekranu początkowego".</li>
              </ol>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-3">
            Nazwy opcji mogą się nieznacznie różnić w zależności od wersji
            telefonu i przeglądarki. Ikona na ekranie głównym otwiera zwykłą
            stronę Alertownika — nie instaluje niczego dodatkowego.
          </p>
        </section>

        <section id="feedback" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Masz uwagi albo pytania?
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
            Nie musi być długo. Wybierz, co najlepiej opisuje Twoją opinię —
            każda opcja otworzy e-mail z gotowym tematem i krótkim pytaniem,
            możesz też po prostu napisać własnymi słowami.
          </p>
          <div className="mb-3">
            <FeedbackQuickOptions />
          </div>
          <a
            href={buildFeedbackMailto()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 dark:bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-700 transition-colors"
          >
            Napisz do nas →
          </a>
        </section>
      </div>
    </main>
  );
}
