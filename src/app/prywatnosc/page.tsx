import Link from "next/link";
import { FEEDBACK_EMAIL } from "@/lib/feedbackMailto";

export const metadata = {
  title: "Polityka prywatności — Alertownik",
  description:
    "Polityka prywatności serwisu Alertownik (wersja beta) — jakie dane przetwarzamy, po co i jakie masz prawa.",
};

const sectionClass = "bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5";
const h2Class = "text-base font-semibold text-slate-900 mb-2";
const pClass = "text-sm text-slate-600 leading-relaxed";
const listClass = "text-sm text-slate-600 space-y-1.5 list-disc list-inside leading-relaxed";

export default function PrivacyPage() {
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
          Polityka prywatności
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          Wersja beta (szkic) — 3 lipca 2026. Ten dokument opisuje uczciwie
          obecny stan serwisu w fazie pilotażu i zostanie zaktualizowany oraz
          zweryfikowany przed szerszym publicznym startem lub publikacją w
          sklepach z aplikacjami.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <section className={sectionClass}>
          <h2 className={h2Class}>Kto prowadzi serwis</h2>
          <p className={pClass}>
            Alertownik to niezależny, niekomercyjny projekt pilotażowy.
            Administratorem danych osobowych w rozumieniu RODO jest{" "}
            <span className="font-medium">Adam Jurkowski</span>, prowadzący
            ten projekt jako osoba fizyczna. Alertownik nie jest oficjalnym
            serwisem żadnej gminy, urzędu, WKD, PGE ani innej instytucji.
            Kontakt we wszystkich sprawach, w tym dotyczących prywatności:{" "}
            <a
              href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("Alertownik — prywatność")}`}
              className="font-medium text-blue-600 hover:underline"
            >
              {FEEDBACK_EMAIL}
            </a>
            .
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Co robi serwis</h2>
          <p className={pClass}>
            Alertownik zbiera w jednym miejscu lokalne alerty (transport, woda,
            prąd, drogi, odpady, komunikaty gminne) dla Komorowa, Pruszkowa i
            okolic, na podstawie oficjalnych, publicznie dostępnych źródeł.
            Korzystanie z serwisu nie wymaga konta ani podawania danych
            osobowych.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Jakie dane mogą być przetwarzane</h2>
          <ul className={listClass}>
            <li>
              <span className="font-medium">Techniczne logi serwera</span> —
              standardowe logi hostingu (adres IP, czas żądania, przeglądarka),
              wyłącznie do działania i bezpieczeństwa serwisu.
            </li>
            <li>
              <span className="font-medium">Preferencje lokalne („Moja okolica")</span>{" "}
              — wybrana okolica i kategorie są zapisywane wyłącznie w Twojej
              przeglądarce (localStorage) i nie są wysyłane na nasz serwer.
            </li>
            <li>
              <span className="font-medium">Dane administratorów</span> — konta
              logowania (e-mail) istnieją tylko dla administratorów serwisu,
              nie dla użytkowników publicznych.
            </li>
            <li>
              <span className="font-medium">E-maile z opiniami</span> — jeśli
              zdecydujesz się napisać do nas (linki „Napisz do nas"), otrzymamy
              Twój adres e-mail i treść wiadomości.
            </li>
            <li>
              <span className="font-medium">Czego NIE zbieramy:</span>{" "}
              dokładnych adresów zamieszkania, danych płatniczych, tokenów
              powiadomień push (powiadomień jeszcze nie ma), zewnętrznych
              narzędzi analitycznych ani cookies reklamowych.
            </li>
          </ul>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Instalacja i pamięć techniczna (Cache Storage)</h2>
          <p className={pClass}>
            Alertownika można dodać do ekranu głównego telefonu lub
            zainstalować jako aplikację (zobacz{" "}
            <Link href="/instalacja" className="font-medium text-blue-600 hover:underline">
              instrukcję instalacji
            </Link>
            ). W tym celu przeglądarka korzysta z technicznej pamięci
            podręcznej (Cache Storage) i mechanizmu service worker. Zapisujemy
            w niej wyłącznie samodzielny ekran „Brak połączenia z internetem"
            i potrzebną do niego ikonę — nigdy listę alertów, treść
            konkretnych alertów, panel administratora ani odpowiedzi API czy
            Supabase. Dzięki temu offline nigdy nie pokazujemy starego alertu
            jako aktualnego. Ta pamięć pozostaje wyłącznie na Twoim
            urządzeniu i możesz ją usunąć w każdej chwili, czyszcząc dane
            witryny w przeglądarce albo odinstalowując aplikację.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Po co przetwarzamy dane</h2>
          <ul className={listClass}>
            <li>działanie i utrzymanie serwisu,</li>
            <li>bezpieczeństwo i usuwanie błędów,</li>
            <li>odbieranie i analizowanie opinii,</li>
            <li>ulepszanie pokrycia lokalnych alertów.</li>
          </ul>
          <p className={`${pClass} mt-2`}>
            Podstawą przetwarzania jest nasz prawnie uzasadniony interes
            (prowadzenie i zabezpieczenie serwisu pilotażowego), a w przypadku
            wiadomości e-mail — Twoje dobrowolne działanie (wysłanie
            wiadomości).
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Komu powierzamy dane (podmioty przetwarzające)</h2>
          <ul className={listClass}>
            <li>
              <span className="font-medium">Vercel</span> — hosting aplikacji
              (logi techniczne, np. adres IP). Funkcje serwerowe są obecnie
              wykonywane w regionie iad1 (Stany Zjednoczone) — w związku z
              tym techniczne dane obsługi żądania mogą być przetwarzane poza
              Europejskim Obszarem Gospodarczym. Vercel deklaruje w swojej
              dokumentacji prywatności stosowanie mechanizmów ochrony
              transferu danych (m.in. EU–U.S. Data Privacy Framework oraz
              odpowiednie klauzule umowne, gdy mają zastosowanie). Alertownik
              korzysta obecnie z bezpłatnego planu Vercel (Hobby); dokładny
              zakres obowiązującej relacji umownej wymaga ponownej
              weryfikacji przed szerszym startem publicznym.
            </li>
            <li>
              <span className="font-medium">Supabase</span> — baza danych
              (treść alertów; konta wyłącznie administratorów), region
              Europa Zachodnia (Londyn, Wielka Brytania). Wielka Brytania
              nie należy do EOG, ale Komisja Europejska uznaje ją za kraj
              zapewniający odpowiedni poziom ochrony danych (decyzja o
              adekwatności).
            </li>
            <li>
              <span className="font-medium">Dostawca poczty</span> — jeśli
              napiszesz do nas, Twoja wiadomość trafia do skrzynki e-mail
              administratora projektu.
            </li>
            <li>
              <span className="font-medium">Anthropic (AI)</span> — narzędzie
              AI pomaga administratorowi przygotowywać szkice alertów na
              podstawie treści oficjalnych komunikatów. Do AI trafiają
              wyłącznie teksty publicznych komunikatów źródłowych wklejane
              przez administratora — nigdy dane użytkowników serwisu.
            </li>
          </ul>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Jak długo przechowujemy dane</h2>
          <p className={pClass}>
            Minimalnie. Logi techniczne są przechowywane zgodnie z ustawieniami
            dostawcy hostingu i rotowane automatycznie. E-maile z opiniami
            przechowujemy tak długo, jak są potrzebne do ulepszania projektu, a
            następnie usuwamy. Preferencje lokalne możesz usunąć w każdej
            chwili, czyszcząc dane przeglądarki.
          </p>
        </section>

        <section className={sectionClass}>
          <h2 className={h2Class}>Twoje prawa (RODO)</h2>
          <p className={`${pClass} mb-2`}>
            W zakresie, w jakim przetwarzamy Twoje dane osobowe, masz prawo do:
          </p>
          <ul className={listClass}>
            <li>dostępu do swoich danych,</li>
            <li>ich sprostowania,</li>
            <li>usunięcia,</li>
            <li>ograniczenia przetwarzania lub sprzeciwu,</li>
            <li>wniesienia skargi do Prezesa UODO.</li>
          </ul>
          <p className={`${pClass} mt-2`}>
            Aby skorzystać z tych praw, po prostu{" "}
            <a
              href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("Alertownik — prywatność")}`}
              className="font-medium text-blue-600 hover:underline"
            >
              napisz do nas
            </a>
            .
          </p>
        </section>

        <section className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm p-4 sm:p-5">
          <h2 className={h2Class}>Status tego dokumentu</h2>
          <p className={pClass}>
            To szkic na czas pilotażu (beta) — napisany uczciwie na podstawie
            faktycznego działania serwisu, ale nieprzeznaczony jako ostateczna
            porada prawna. Przed szerszym startem publicznym lub publikacją w
            sklepie z aplikacjami zostanie zweryfikowany i zaktualizowany.
          </p>
        </section>
      </div>
    </main>
  );
}
