import Image from "next/image";
import Link from "next/link";
import { FEEDBACK_EMAIL } from "@/lib/feedbackMailto";

export const metadata = {
  title: "Współpraca — Alertownik",
  description:
    "Możliwości współpracy z Alertownikiem — lokalnym serwisem alertów dla Komorowa, Pruszkowa i okolic: sponsoring lokalny, wspólnoty mieszkaniowe, instytucje, partnerzy danych.",
};

const cooperationTypes = [
  {
    title: "Lokalny sponsor",
    text: "Twoja firma działa w okolicy i chce wspierać dostęp mieszkańców do rzetelnych lokalnych informacji. Rozmawiamy o formie, która nie zaśmieca komunikatów i nie osłabia zaufania.",
  },
  {
    title: "Wspólnota mieszkaniowa / zarządca",
    text: "Docieranie z ogłoszeniami do mieszkańców bywa trudne. Sprawdzamy, czy Alertownik może pomóc w prostym publikowaniu komunikatów dla osiedla lub budynku.",
  },
  {
    title: "Gmina / lokalna instytucja",
    text: "Urzędy i instytucje publikują komunikaty w wielu miejscach. Chętnie porozmawiamy, jak ułatwić mieszkańcom ich znajdowanie — z pełnym poszanowaniem oficjalnych źródeł.",
  },
  {
    title: "Partner źródłowy / danych",
    text: "Prowadzisz źródło lokalnych informacji (np. o transporcie, mediach, drogach)? Możemy linkować i cytować Twoje komunikaty jako źródło — zawsze z podaniem pochodzenia.",
  },
  {
    title: "Partner beta / tester",
    text: "Chcesz po prostu pomóc testować i współtworzyć serwis na wczesnym etapie — jako osoba lub organizacja. Każda para oczu się liczy.",
  },
];

export default function PartnersPage() {
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
          Współpraca i partnerstwa
        </h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 leading-relaxed">
          Alertownik to lokalny serwis alertów dla Komorowa, Pruszkowa i okolic —
          zbiera w jednym miejscu informacje o utrudnieniach w transporcie,
          dostawach wody i prądu, drogach, odpadach i komunikatach gminnych.
        </p>
        <p className="text-sm mt-2">
          <a href="#kontakt" className="font-medium text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 hover:underline">
            Przejdź do kontaktu ↓
          </a>
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Gdzie jesteśmy dzisiaj
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Serwis jest we wczesnej fazie pilotażu na obszarze linii WKD,
            Komorowa i Pruszkowa. Każdy alert jest przygotowywany na podstawie
            oficjalnych źródeł i ręcznie zatwierdzany przez administratora —
            stawiamy na rzetelność, nie na ilość. Nie obiecujemy więcej, niż
            robimy: to pilotaż, który rozwijamy krok po kroku.
          </p>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Komu pomagamy
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Mieszkańcom, którzy chcą w jednym miejscu zobaczyć, co się dzieje w
            ich okolicy — bez przeszukiwania kilku stron urzędów i operatorów.
            Alertownik nie zastępuje oficjalnych komunikatów ani numerów
            alarmowych; przy każdym alercie podajemy źródło do samodzielnego
            sprawdzenia.
          </p>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Jak zbieramy dane i dbamy o jakość
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Każdy alert pochodzi z konkretnego, oficjalnego źródła (strona gminy,
            miasta, powiatu, WKD, PGE Dystrybucja) — nigdy z plotek czy postów w
            mediach społecznościowych, które traktujemy co najwyżej jako trop do
            sprawdzenia. Zanim komunikat trafi na listę, przechodzi automatyczne
            sprawdzenie, czy nie duplikuje już istniejącego alertu lub innego
            zgłoszonego kandydata z tego samego okresu i miejsca — dopiero potem
            administrator ręcznie weryfikuje treść, daty i lokalizację przed
            publikacją. Jeden, wąsko określony wyjątek automatycznej publikacji
            istnieje dla pojedynczego zaufanego źródła i jest w każdej chwili
            odwracalny jednym przełącznikiem — nigdy nie omija tej samej kontroli
            deduplikacji.
          </p>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Jak to wygląda w praktyce
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
            Mieszkaniec Komorowa sprawdza rano Alertownika przed wyjściem z domu i
            widzi, że na jego trasie do stacji WKD trwa czasowe zamknięcie ulicy —
            klika alert, widzi dokładny odcinek, daty i link do oficjalnego źródła,
            i wybiera objazd, zanim wyjdzie z domu. Poniżej realne zrzuty
            aktualnej wersji serwisu (bez retuszu, bez wymyślonych danych).
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Image
              src="/screenshots/home-narrow.png"
              alt="Strona główna Alertownika — dzisiejsze alerty (widok telefonu)"
              width={390}
              height={844}
              className="rounded-lg border border-slate-200 dark:border-slate-800 w-full h-auto"
            />
            <Image
              src="/screenshots/alerty-narrow.png"
              alt="Lista alertów z wyszukiwarką i filtrowaniem kategorii (widok telefonu)"
              width={390}
              height={844}
              className="rounded-lg border border-slate-200 dark:border-slate-800 w-full h-auto"
            />
            <Image
              src="/screenshots/home-wide.png"
              alt="Strona główna Alertownika na komputerze"
              width={1280}
              height={800}
              className="rounded-lg border border-slate-200 dark:border-slate-800 w-full h-auto col-span-2 sm:col-span-1"
            />
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">
            Możliwe formy współpracy
          </h2>
          <ul className="flex flex-col gap-3">
            {cooperationTypes.map((c) => (
              <li key={c.title} className="border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-1">{c.title}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{c.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="kontakt" className="bg-emerald-50 dark:bg-emerald-500/15 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 shadow-sm p-4 sm:p-5 scroll-mt-20">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Porozmawiajmy
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
            Jesteśmy na etapie pierwszych rozmów — bez zobowiązań i bez
            cenników. Jeśli którakolwiek z form współpracy brzmi ciekawie,
            napisz kilka zdań o sobie i okolicy, której dotyczysz.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
            Czego szukamy teraz: opinii o serwisie, podpowiedzi lokalnych
            źródeł, partnera pilotażu (np. wspólnoty) — a w dalszej
            kolejności lokalnego sponsora.
          </p>
          <a
            href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("Alertownik — współpraca")}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            Napisz w sprawie współpracy →
          </a>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
            Uczciwe zastrzeżenia
          </h2>
          <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
            <li>To wczesny pilotaż — zasięg i funkcje serwisu wciąż rosną.</li>
            <li>Alerty opierają się na oficjalnych źródłach i ręcznej weryfikacji.</li>
            <li>Alertownik nie jest systemem powiadamiania ratunkowego i nie gwarantuje kompletności informacji.</li>
            <li>Alertownik jest niezależnym projektem prywatnym — nie jest oficjalną aplikacją żadnej gminy, WKD, PGE ani innych operatorów.</li>
            <li>Współpraca nigdy nie wpłynie na treść ani kolejność alertów — zaufanie mieszkańców jest nienegocjowalne.</li>
          </ul>
          <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed mt-3">
            Zobacz też:{" "}
            <Link href="/prywatnosc" className="underline hover:text-slate-600 dark:hover:text-slate-400">
              Polityka prywatności
            </Link>{" "}
            ·{" "}
            <Link href="/zasady" className="underline hover:text-slate-600 dark:hover:text-slate-400">
              Zasady korzystania
            </Link>{" "}
            (szkice beta).
          </p>
        </section>
      </div>
    </main>
  );
}
