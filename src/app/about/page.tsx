import Link from "next/link";

const FEEDBACK_EMAIL = "ak.jurkowski@gmail.com";

export const metadata = {
  title: "O projekcie — Alertownik",
  description: "Czym jest Alertownik, jak działa i jak skontaktować się z autorem.",
};

export default function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-700 transition-colors mb-5 sm:mb-6 group"
      >
        <span className="group-hover:-translate-x-0.5 transition-transform inline-block">←</span>
        Wróć do listy alertów
      </Link>

      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-2">
          O projekcie
        </h1>
        <p className="text-sm sm:text-base text-slate-500 leading-relaxed">
          Alertownik to lokalny serwis alertów — w jednym miejscu zbiera informacje
          o utrudnieniach w transporcie, dostawach wody i prądu, drogach, odpadach
          oraz innych komunikatach gminnych.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            Wczesny pilotaż
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Alertownik jest obecnie we wczesnej fazie pilotażu. Oznacza to, że
            funkcje i wygląd serwisu mogą się jeszcze zmieniać, a liczba dostępnych
            alertów jest ograniczona do okolic objętych testem.
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            Kto przygotowuje alerty
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Każdy alert jest przygotowywany i publikowany przez administratora
            serwisu na podstawie komunikatów z lokalnych źródeł (np. stron
            urzędów, operatorów transportu czy dostawców usług). Do przygotowania
            treści admin może korzystać z pomocy AI, ale AI nigdy nie publikuje
            alertów samodzielnie — każdy alert trafia na stronę główną tylko po
            akceptacji administratora.
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            Źródła pozostają najważniejsze
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Alertownik ułatwia szybkie zorientowanie się w sytuacji, ale nie
            zastępuje oficjalnych komunikatów. W razie wątpliwości warto sprawdzić
            źródło podane przy danym alercie — to ono jest ostatecznym
            potwierdzeniem informacji.
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            Masz uwagi albo pytania?
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-3">
            To wczesna wersja serwisu — chętnie usłyszymy, co działa dobrze, a co
            warto poprawić.
          </p>
          <a
            href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("Alertownik — opinia o pilotażu")}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Napisz do nas →
          </a>
        </section>
      </div>
    </main>
  );
}
