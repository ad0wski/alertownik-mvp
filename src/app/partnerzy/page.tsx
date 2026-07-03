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
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-700 transition-colors mb-5 sm:mb-6 group"
      >
        <span className="group-hover:-translate-x-0.5 transition-transform inline-block">←</span>
        Wróć do listy alertów
      </Link>

      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-2">
          Współpraca i partnerstwa
        </h1>
        <p className="text-sm sm:text-base text-slate-500 leading-relaxed">
          Alertownik to lokalny serwis alertów dla Komorowa, Pruszkowa i okolic —
          zbiera w jednym miejscu informacje o utrudnieniach w transporcie,
          dostawach wody i prądu, drogach, odpadach i komunikatach gminnych.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            Gdzie jesteśmy dzisiaj
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Serwis jest we wczesnej fazie pilotażu na obszarze linii WKD,
            Komorowa i Pruszkowa. Każdy alert jest przygotowywany na podstawie
            oficjalnych źródeł i ręcznie zatwierdzany przez administratora —
            stawiamy na rzetelność, nie na ilość. Nie obiecujemy więcej, niż
            robimy: to pilotaż, który rozwijamy krok po kroku.
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            Komu pomagamy
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Mieszkańcom, którzy chcą w jednym miejscu zobaczyć, co się dzieje w
            ich okolicy — bez przeszukiwania kilku stron urzędów i operatorów.
            Alertownik nie zastępuje oficjalnych komunikatów ani numerów
            alarmowych; przy każdym alercie podajemy źródło do samodzielnego
            sprawdzenia.
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-3">
            Możliwe formy współpracy
          </h2>
          <ul className="flex flex-col gap-3">
            {cooperationTypes.map((c) => (
              <li key={c.title} className="border border-slate-100 rounded-xl p-3">
                <p className="text-sm font-medium text-slate-800 mb-1">{c.title}</p>
                <p className="text-sm text-slate-600 leading-relaxed">{c.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-emerald-50 rounded-2xl border border-emerald-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            Porozmawiajmy
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-2">
            Jesteśmy na etapie pierwszych rozmów — bez zobowiązań i bez
            cenników. Jeśli którakolwiek z form współpracy brzmi ciekawie,
            napisz kilka zdań o sobie i okolicy, której dotyczysz.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed mb-3">
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

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            Uczciwe zastrzeżenia
          </h2>
          <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside leading-relaxed">
            <li>To wczesny pilotaż — zasięg i funkcje serwisu wciąż rosną.</li>
            <li>Alerty opierają się na oficjalnych źródłach i ręcznej weryfikacji.</li>
            <li>Alertownik nie jest systemem powiadamiania ratunkowego i nie gwarantuje kompletności informacji.</li>
            <li>Współpraca nigdy nie wpłynie na treść ani kolejność alertów — zaufanie mieszkańców jest nienegocjowalne.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
