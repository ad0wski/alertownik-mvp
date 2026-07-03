import Link from "next/link";

export const metadata = {
  title: "Zasady korzystania — Alertownik",
  description:
    "Zasady korzystania i zastrzeżenia serwisu Alertownik (wersja beta) — czym serwis jest, a czym nie jest.",
};

const sectionClass = "bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5";
const h2Class = "text-base font-semibold text-slate-900 mb-2";
const pClass = "text-sm text-slate-600 leading-relaxed";
const listClass = "text-sm text-slate-600 space-y-1.5 list-disc list-inside leading-relaxed";

export default function TermsPage() {
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
          Zasady korzystania i zastrzeżenia
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          Wersja beta (szkic) — 3 lipca 2026. Prosto i uczciwie: czym
          Alertownik jest, a czym nie jest.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <section className="bg-red-50 rounded-2xl border border-red-200 shadow-sm p-4 sm:p-5">
          <h2 className={h2Class}>Najważniejsze: to nie jest serwis ratunkowy</h2>
          <p className={pClass}>
            Alertownik <span className="font-semibold">nie jest oficjalnym
            systemem powiadamiania alarmowego</span> i nie służy do sytuacji
            bezpośredniego zagrożenia życia, zdrowia lub mienia. W nagłych
            sytuacjach dzwoń pod numer alarmowy <span className="font-semibold">112</span>{" "}
            i korzystaj z oficjalnych kanałów służb.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Czym jest Alertownik</h2>
          <ul className={listClass}>
            <li>
              Serwis zbiera i porządkuje lokalne informacje z publicznie
              dostępnych, oficjalnych źródeł (urzędy, operatorzy transportu,
              dostawcy mediów) dla Komorowa, Pruszkowa i okolic.
            </li>
            <li>
              Każdy alert jest przygotowywany i publikowany ręcznie przez
              administratora, po sprawdzeniu źródła. AI może pomagać w
              przygotowaniu szkicu tekstu, ale nigdy nie publikuje niczego
              samodzielnie.
            </li>
            <li>
              Przy każdym alercie podajemy źródło — to oficjalny komunikat
              jest ostatecznym potwierdzeniem informacji.
            </li>
          </ul>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Czego nie gwarantujemy (uczciwie)</h2>
          <ul className={listClass}>
            <li>
              <span className="font-medium">Kompletności</span> — w fazie beta
              monitorujemy ograniczoną liczbę źródeł i okolic; ważny komunikat
              może się u nas nie pojawić.
            </li>
            <li>
              <span className="font-medium">Aktualności w czasie rzeczywistym</span>{" "}
              — alerty są dodawane ręcznie, z opóźnieniem względem źródła.
            </li>
            <li>
              <span className="font-medium">Nieprzerwanej dostępności</span> —
              serwis pilotażowy może mieć przerwy techniczne.
            </li>
          </ul>
          <p className={`${pClass} mt-2`}>
            Ważne decyzje (podróż, zdrowie, bezpieczeństwo, sprawy urzędowe)
            zawsze weryfikuj bezpośrednio w oficjalnym źródle podanym przy
            alercie.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Niezależność serwisu</h2>
          <p className={pClass}>
            Alertownik jest niezależnym projektem pilotażowym. Nie jest
            oficjalnym serwisem żadnej gminy ani urzędu i nie jest powiązany z
            WKD, PGE, dostawcami wody ani innymi operatorami, których
            komunikaty cytuje i linkuje jako źródła.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Korzystanie z serwisu</h2>
          <ul className={listClass}>
            <li>Korzystanie jest bezpłatne i nie wymaga konta.</li>
            <li>
              Treści służą celom informacyjnym; nie ponosimy odpowiedzialności
              za decyzje podjęte wyłącznie na ich podstawie — zwłaszcza gdy
              oficjalne źródło mówi co innego.
            </li>
            <li>
              Zauważyłeś/aś błąd albo nieaktualny alert?{" "}
              <Link href="/about#feedback" className="font-medium text-blue-600 hover:underline">
                Zgłoś go nam
              </Link>{" "}
              — to najlepszy sposób, by pomóc.
            </li>
          </ul>
        </section>

        <section className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm p-4 sm:p-5">
          <h2 className={h2Class}>Status tego dokumentu</h2>
          <p className={pClass}>
            Szkic na czas pilotażu (beta) — zostanie zweryfikowany i
            zaktualizowany przed szerszym startem publicznym lub publikacją w
            sklepach z aplikacjami. Zasady mogą się zmieniać wraz z rozwojem
            serwisu; aktualna wersja zawsze będzie dostępna na tej stronie.
          </p>
        </section>
      </div>
    </main>
  );
}
