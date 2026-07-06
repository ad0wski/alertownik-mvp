import Link from "next/link";
import { OdpadyClient } from "@/components/OdpadyClient";

export const metadata = {
  title: "Odpady — Alertownik",
  description: "Najbliższe terminy odbioru odpadów przepisane ręcznie z oficjalnych harmonogramów — na start Komorów (Gmina Michałowice, 2026). Zawsze z linkiem do źródła.",
};

const PLANNED_WASTE_TYPES = [
  "zmieszane",
  "papier",
  "plastik i metal",
  "szkło",
  "bio",
  "odpady wielkogabarytowe (jeśli dotyczy okolicy)",
];

const OFFICIAL_SOURCES = [
  {
    name: "Gmina Michałowice — harmonogram odbioru odpadów",
    url: "https://www.michalowice.pl/ochrona-srodowiska/odbior-odpadow/nowy-harmonogram-odbioru-odpadow-komunalnych",
    note: "Oficjalne harmonogramy PDF na 2026 rok (ważne 1.01–31.12.2026, m.in. Komorów, Nowa Wieś, Granica, Michałowice, Reguły) — z harmonogramu dla zabudowy jednorodzinnej planujemy przepisać pierwsze terminy dla Komorowa.",
  },
  {
    name: "Eco-Harmonogram (Pruszków)",
    url: "https://www.pruszkow.pl/aplikacja-eco-harmonogram/",
    note: "Aplikacja gminna — wybierz adres, zobacz aktualny harmonogram odbioru.",
  },
  {
    name: "MZO Pruszków — terminy odbioru odpadów",
    url: "https://www.pruszkow.pl/mieszkancy/terminy-odbioru-odpadow/",
    note: "Strona urzędu z terminami odbioru — czasem trzeba otworzyć ją wprost w przeglądarce.",
  },
  {
    name: "Gmina Michałowice — komunikaty",
    url: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty",
    note: "Ogłoszenia gminne, w tym zmiany w harmonogramie odbioru odpadów (np. po świętach).",
  },
];

export default function OdpadyPage() {
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
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Odpady — harmonogram odbioru
          </h1>
          <span className="inline-flex items-center text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5">
            Wczesna wersja
          </span>
        </div>
        <p className="text-sm sm:text-base text-slate-500 leading-relaxed">
          Alertownik pokazuje najbliższe terminy odbioru odpadów dla Twojej
          okolicy — bez przeszukiwania harmonogramów PDF. Sekcja poniżej
          pokazuje wyłącznie terminy przepisane ręcznie z oficjalnych
          harmonogramów i zweryfikowane przed publikacją — każdy z linkiem do
          źródła. Zaczynamy od{" "}
          <span className="font-medium text-slate-600">Komorowa</span> (zabudowa
          jednorodzinna, harmonogram Gminy Michałowice na 2026 rok); jeśli
          Twojej okolicy jeszcze tu nie ma, skorzystaj z oficjalnych źródeł
          poniżej.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <OdpadyClient />

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            Jak to ma działać
          </h2>
          <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside leading-relaxed">
            <li>Wybierasz swoją okolicę albo grupę ulic — bez podawania dokładnego adresu.</li>
            <li>Nie musisz się logować — preferencja zapisuje się tylko w tej przeglądarce.</li>
            <li>Widzisz najbliższe terminy odbioru, podzielone według rodzaju odpadów.</li>
            <li>Każdy termin wskazuje źródło, z którego pochodzi — to ono jest najważniejsze, nie ta strona.</li>
            <li>Przypomnienia (np. dzień wcześniej) są planowane na później — na razie strona pokazuje tylko terminy.</li>
          </ul>
          <p className="text-sm text-slate-500 mt-3 leading-relaxed">
            Planowane rodzaje odpadów: {PLANNED_WASTE_TYPES.join(", ")}.
          </p>
        </section>

        <section className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-amber-900 mb-2">
            Pełny harmonogram znajdziesz w oficjalnym źródle
          </h2>
          <p className="text-sm text-amber-800 leading-relaxed mb-3">
            Alertownik pokazuje tylko terminy, które zostały już ręcznie
            przepisane i zweryfikowane — pozostałe okolice, typy zabudowy i
            frakcje znajdziesz w źródłach, które same prowadzą harmonogram:
          </p>
          <ul className="flex flex-col gap-2.5">
            {OFFICIAL_SOURCES.map((s) => (
              <li key={s.url} className="text-sm">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
                >
                  {s.name} →
                </a>
                <p className="text-amber-700 mt-0.5">{s.note}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            Ogłoszenia o zmianach harmonogramu już dziś
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Jednorazowe zmiany w odbiorze (np. przesunięcie terminu po święcie)
            są już publikowane jako zwykłe alerty w kategorii „Odpady" — możesz
            je zobaczyć na{" "}
            <Link href="/" className="font-medium text-blue-600 hover:underline">
              stronie głównej
            </Link>{" "}
            albo zaznaczyć kategorię „Odpady" w „Moje alerty", żeby widzieć
            tylko je.
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            Źródła pozostają najważniejsze
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Tak jak przy innych alertach — gdy harmonogram odbioru odpadów
            faktycznie się tu pojawi, każdy termin trzeba będzie zweryfikować
            z oficjalnym źródłem gminy albo operatora odpadów. Alertownik nie
            zastępuje urzędowego harmonogramu, tylko ułatwia go znaleźć.
            Alertownik jest niezależnym projektem — nie jest oficjalną stroną
            Gminy Michałowice ani żadnej gminy czy operatora odpadów; w razie
            wątpliwości rozstrzygające jest zawsze oficjalne źródło.
          </p>
        </section>
      </div>
    </main>
  );
}
