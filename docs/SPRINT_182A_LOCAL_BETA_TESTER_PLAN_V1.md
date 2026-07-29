# Sprint 182A — Local Beta: Plan rekrutacji i testów 5–10 realnych testerów

Status: **plan gotowy do wykonania. Dokument planistyczny — brak zmian w kodzie w tym sprincie.**

Data: 2026-07-28.

Cel: zamknąć Gate 2 (Local Beta) — jedyny pozostały blocker to testerzy i realny feedback, nie gotowość techniczna (Sprint 181B zamknął tę część w 100%, potwierdzone na fizycznym iPhone).

---

## 1. Najprostszy sposób udostępnienia aplikacji

Nic nowego do zbudowania — Alertownik już działa jako PWA pod publicznym adresem:

**`https://alertownik-mvp.vercel.app/`**

- Nie wymaga Google Play ani App Store — `/instalacja` ma już gotowe instrukcje na Android i iPhone (Sprint 158B, potwierdzone realnym testem w Sprincie 181B).
- Najprostszy kanał dystrybucji: **bezpośredni link** wysłany osobiście (SMS/WhatsApp/Messenger) do każdego testera, z jednym zdaniem zachęty (patrz §3).
- Nie trzeba budować żadnego systemu zaproszeń, kodów dostępu ani rejestracji — apka jest publiczna, `status: pending` alertów jest niewidoczny publicznie (RLS), więc nie ma ryzyka ujawnienia czegokolwiek nieopublikowanego.

## 2. Kryteria wyboru 5–10 testerów

Cel: różnorodność, nie tylko życzliwi znajomi z branży IT.

- **Realnie mieszkają lub codziennie przemieszczają się** przez Komorów, Pruszków, Michałowice, Granicę, Regóły lub Nową Wieś — inaczej alerty są dla nich bez znaczenia.
- **Mix wieku i obycia z technologią** — celowo włącz przynajmniej 2–3 osoby, które NIE są "techniczne" (np. rodzic, sąsiad, osoba starsza) — oni najszybciej znajdą niejasności, które ekspert przeoczy.
- **Mix telefonów**: przynajmniej 2 osoby na iPhone, przynajmniej 2 na Androidzie — inaczej nie sprawdzisz realnie obu ścieżek instalacji.
- **Gotowość do odpowiedzi w ciągu ~1 tygodnia**, nie "kiedyś" — lepiej 5 osób, które faktycznie odpiszą, niż 15, które zainstalują i zapomną.
- **Nie zależni finansowo/zawodowo od Ciebie** (unikaj samych współpracowników) — chodzi o szczerą opinię, nie kurtuazyjną.
- Jeśli to możliwe: przynajmniej jedna osoba korzystająca regularnie z odpadów/PGE (inna kategoria niż drogi/transport) — pokrycie kategorii, nie tylko liczba osób.

## 3. Wiadomość rekrutacyjna (do wysłania osobiście, nie masowo)

> Cześć! Testuję teraz mały projekt, który robię — Alertownik. To prosta strona/apka, która zbiera w jednym miejscu lokalne alerty dla Komorowa, Pruszkowa i okolic: utrudnienia drogowe, przerwy w wodzie/prądzie, zmiany w odbiorze śmieci, komunikaty WKD. Można ją dodać do ekranu telefonu jak zwykłą appkę (bez sklepu, 2 minuty).
>
> Byłbym bardzo wdzięczny, gdybyś rzucił/a okiem i powiedział/a szczerze, co myślisz — nawet jedno zdanie "działa/nie działa/nie rozumiem" bardzo mi pomoże. Link: https://alertownik-mvp.vercel.app/
>
> To wczesna wersja pilotażowa, więc nie wszystko będzie idealne — o to właśnie chodzi w testowaniu 🙂

Ton celowo osobisty i krótki — to wiadomość 1:1, nie ogłoszenie grupowe.

## 4. Instrukcja instalacji — nie duplikować, kierować do `/instalacja`

Strona `/instalacja` już zawiera pełne, przetestowane instrukcje (Android/Chrome, iPhone/Safari, komputer). Zamiast pisać nową instrukcję, wysyłany link/wiadomość powinien wprost wspomnieć:

> „Jak dodasz stronę do telefonu, zobaczysz na dole przycisk/instrukcję instalacji — albo wejdź od razu na alertownik-mvp.vercel.app/instalacja"

Skrócona wersja na wypadek pytania "jak to zainstalować?":
- **iPhone (Safari)**: Udostępnij (ikona ze strzałką) → „Dodaj do ekranu początkowego" → Dodaj.
- **Android (Chrome)**: menu (⋮) → „Zainstaluj aplikację" / „Dodaj do ekranu głównego".

## 5. Zbieranie feedbacku — wykorzystanie istniejącego systemu, bez nowego formularza

Projekt ma już gotowy, przetestowany system feedbacku przez mailto (`src/lib/feedbackMailto.ts`, Sprint 93/95/98) — **nie buduj nowego formularza ani tabeli Supabase** (zgodnie z zasadą projektu: rozbuduj istniejące, nie duplikuj):

- Każdy alert ma link „Zgłoś problem" → mailto z gotowym tematem.
- Stopka/`/about` mają ogólny „Napisz do nas" z 6 pytaniami w treści.
- Istnieją gotowe kategorie szybkiego zgłoszenia: brakujący alert, nieaktualne dane, niejasna strona, nowa okolica, inne.

Wszystko trafia na **`alertownik.kontakt@gmail.com`**. Dla 5–10 testerów to w zupełności wystarczy — nie trzeba dedykowanej ankiety Google Forms/Typeform na tym etapie.

**Jedyna nowa rzecz (poza kodem, ręczna, po stronie Adama):** prosty arkusz (Obsidian/Notion/Excel) do klasyfikacji przychodzących e-maili — patrz §7.

## 6. Dokładna lista rzeczy, które testerzy mają sprawdzić

Poproś (nieformalnie, przy okazji wiadomości z §3 lub po tygodniu) o sprawdzenie:

1. **Pierwsze wrażenie** — czy od razu wiadomo, do czego służy strona, bez tłumaczenia?
2. **Instalacja** — czy dodanie do ekranu głównego poszło łatwo? Ile to zajęło czasu/kroków?
3. **Trafność alertów** — czy alerty dotyczą realnie ich okolicy? Czy któryś wygląda na nieaktualny?
4. **Czytelność** — czy tytuł, miejsce, data i źródło każdego alertu są jasne bez dodatkowego klikania?
5. **Odpady** (jeśli mieszkają w Komorowie) — czy przypomnienie o odbiorze jest przydatne i poprawne?
6. **Wyszukiwanie/filtrowanie** na `/alerty` — czy działa intuicyjnie?
7. **Tryb offline** — czy próbowali otworzyć appkę bez internetu i czy komunikat był zrozumiały?
8. **Czy czegoś im brakuje** — jakiej kategorii, jakiej okolicy, jakiej funkcji.
9. **Czy wróciliby** do apki bez przypominania — szczera odpowiedź, nie kurtuazyjna.

## 7. Klasyfikacja błędów i sugestii (ręczna, prosty arkusz)

Dla każdego przychodzącego zgłoszenia (e-mail) — 3 kolumny wystarczą na tym etapie, bez nadbudowy:

| Kolumna | Wartości |
|---|---|
| **Typ** | Błąd (coś nie działa) / Nieaktualne dane / Niejasność UX / Sugestia funkcji / Pochwała |
| **Waga** | Blokujące (uniemożliwia korzystanie) / Ważne (psuje zaufanie do danych) / Kosmetyczne / Do rozważenia później |
| **Status** | Nowe / W analizie / Naprawione / Odrzucone (z krótkim powodem) |

Zasada: **Blokujące i Ważne → następny sprint od razu.** Kosmetyczne i "do rozważenia" → backlog, przegląd zbiorczy po zebraniu wszystkich odpowiedzi (nie reaguj na każde pojedyncze kosmetyczne zgłoszenie w locie — to marnuje czas na feedback od 5–10 osób, który trzeba najpierw zobaczyć w całości).

## 8. Plan przejścia: Local Beta → Partner Demo

Gate 2 (Local Beta) uznajemy za zamknięty, gdy:
- Wszystkich 5–10 testerów faktycznie zainstalowało i użyło apki (nie tylko otworzyło link).
- Zebrano odpowiedzi od **przynajmniej 3–5 osób** (100% odpowiedzi nie jest realistyczne ani wymagane).
- Żadne zgłoszenie klasy „Blokujące" nie zostaje bez odpowiedzi/naprawy.
- Przynajmniej jeden sygnał pozytywny wykraczający poza n=1 (obecny stan: jeden pozytywny sygnał „jest git" — Gate 1 był już oznaczony jako „thin — n=1"; ten sprint ma to poszerzyć).

Po zamknięciu Gate 2, Gate 3 (Partner Demo) korzysta wprost z tego, co już powstało:
- **Zrzuty ekranu** z Sprintu 181B (`public/screenshots/`) — gotowa baza pod stronę demo, nie trzeba robić ich od nowa.
- **3–5 świeżych przykładów alertów** z realnego okresu testów (nie archiwalne) — naturalnie pojawią się w trakcie tego sprintu.
- **2–3 sygnały od użytkowników** — bezpośrednio z zebranego feedbacku (§7), nie trzeba osobnej rundy.
- Następny krok po tym: strona demo (`/partnerzy` już istnieje jako punkt startowy) + pierwszy, niekomercyjny outreach do jednej instytucji (gmina/urząd) z prośbą o feedback, nie sprzedaż.

## 9. Co NIE robimy w tym sprincie (celowo, zgodnie z zasadami projektu)

- Brak nowego formularza/ankiety — wykorzystujemy istniejący mailto.
- Brak nowej tabeli Supabase do trackingu feedbacku — arkusz ręczny wystarczy dla 5–10 osób.
- Brak płatności, brak powiadomień push, brak zmian w RLS/schemacie.
- Brak masowej rekrutacji (reklama, posty publiczne) — tylko osobiste zaproszenia, zgodnie z duchem "Local Beta".

---

## 10. Wynik rekrutacji — stan na 2026-07-29 (Dzień 14)

**Status: rekrutacja NIE zakończona sukcesem. Odłożona, nie zablokowana.**

Osoby zaproszone przez Adama nie odpowiedziały. Nie osiągnięto progu z §8 (5–10
zainstalowanych, 3–5 odpowiedzi). To **nie jest** powód do zatrzymania dalszego
rozwoju produktu — decyzją właściciela projektu prace produktowe/techniczne są
kontynuowane równolegle z odłożoną rekrutacją.

### Tracker (uczciwy stan)

| Miernik | Wartość |
|---|---|
| Zaproszeni | liczba nieznana — Adam nie podał dokładnej |
| Zainstalowali i użyli | nieznane (brak odpowiedzi od zaproszonych) |
| Zakończone testy z odpowiedzią | **1** |
| Kompletne odpowiedzi (§6, wszystkie punkty) | **1** |
| Minimalne wymaganie „3–5 odpowiedzi" (§8) | **niespełnione** |
| Minimalne wymaganie „5–10 zainstalowanych" (§8) | **niespełnione** |
| Pozostali zaproszeni bez odpowiedzi | „Brak odpowiedzi — walidacja odłożona, nie blocker techniczny" |

### Pierwszy zakończony test użytkownika — mama Adama

Źródło: bezpośrednia relacja od Adama (nie mailto, nie ankieta). Poniżej wyłącznie
to, co zostało realnie przekazane — bez dopisywania modelu telefonu, systemu ani
innych szczegółów, których Adam nie podał.

**Feedback (dosłownie przekazane treści):**
1. Ogólnie aplikacja wygląda ładnie.
2. Działanie aplikacji, wyszukiwanie, filtrowanie i korzystanie z funkcji są zrozumiałe i nie sprawiły problemu.
3. Na stronie „Alerty" u góry znajduje się zbyt dużo tekstu.
4. Użytkowniczka prawdopodobnie nie czytałaby tak długiego wprowadzenia.
5. Aplikację warto możliwie upraszczać, również z myślą o seniorach, o ile nie psuje to wyglądu ani funkcjonalności.
6. Ogólna ocena działania aplikacji jest pozytywna.

**Klasyfikacja:**
- ✅ **Pozytywny sygnał: wygląd aplikacji** (punkt 1, 6) — drugi pozytywny sygnał
  po Gate 1 „jest git", nadal nie n=1 statystycznie istotne, ale nie samo n=1 już.
- ✅ **Pozytywny sygnał: działanie wyszukiwania i obsługi** (punkt 2) — wyszukiwanie,
  filtrowanie i ogólna obsługa nie sprawiły problemu bez wcześniejszego tłumaczenia.
- ⚠️ **Ważna uwaga UX: za dużo tekstu na górze strony „Alerty"** (punkt 3, 4) —
  zaadresowana w tym samym dniu, patrz Część 3 poniżej.
- 🧭 **Kierunek dostępności: dalsze upraszczanie dla starszych użytkowników**
  (punkt 5) — kierunek na przyszłość, nie jednorazowa poprawka; brać pod uwagę
  przy kolejnych zmianach UI, nie tylko przy tej jednej stronie.

### Status Gate 2

**Gate 2 NIE jest w pełni zaliczony.** Rozbicie:
- Gotowość techniczna: ✅ 100% (zamknięte w Sprincie 181B, realny test na
  fizycznym iPhone).
- Walidacja prawdziwych użytkowników: ⬜ **niepełna** — 1 zakończony test
  zamiast wymaganych 3–5, próg 5–10 zainstalowanych niespełniony.
- Rekrutacja pozostałych testerów: **odłożona, nadal możliwa w przyszłości** —
  nie porzucona, nie oznaczona jako "done".
- Dalsze prace produktowe/techniczne: **kontynuowane** decyzją właściciela
  projektu, niezależnie od stanu rekrutacji (Dzień 14, Część 3 i dalej).
