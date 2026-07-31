# Instrukcja ręcznego testu — VoiceOver na iPhonie (dla Adama)

**Nie wykonano przez Claude — brak fizycznego urządzenia z VoiceOver w tym
środowisku.** Poniższe kroki nie zostały odhaczone przez nikogo. To nie
jest certyfikat dostępności ani potwierdzenie, że Alertownik "przeszedł
test osoby niewidomej" — to jedynie przygotowana, praktyczna instrukcja
do wykonania przez Adama na prawdziwym iPhonie.

Adres testowy: `https://alertownik-mvp.vercel.app`

---

## Wynik wstępny (Adam, 2026-07-31)

Adam rozpoczął ręczne prowadzenie przez tę instrukcję na swoim
fizycznym iPhonie i zatrzymał je po czterech krokach, ponieważ nie jest
doświadczonym użytkownikiem czytnika ekranu i nie jest w stanie
wiarygodnie ocenić pełnej jakości kolejności odczytu, komunikatów ani
ergonomii nawigacji — słusznie odmówił zgadywania wyniku PASS/FAIL dla
elementów, których oceny nie da się wykonać bez doświadczenia z
VoiceOver.

**Wstępny ręczny smoke test VoiceOver wykonany przez osobę bez
doświadczenia z czytnikiem ekranu. Potwierdzono możliwość uruchomienia
aplikacji, odnalezienie linku »Przejdź do treści«, przejście do głównej
zawartości oraz rozpoznawalne nazwy i stan aktywnej zakładki dolnej
nawigacji. Nie znaleziono oczywistego blockera. Wynik nie jest
formalnym audytem ani testem wykonanym przez osobę niewidomą.**

Konkretnie sprawdzone (kroki 1–4 sekcji A poniżej): włączenie
VoiceOver, uruchomienie aplikacji z ikony na ekranie głównym (ikona
odczytana poprawnie jako „Alertownik"), obecność i działanie linku
„Przejdź do treści" na stronie głównej, oraz nazwy i stan aktywnej
zakładki dolnej nawigacji.

**Pozostałe punkty sekcji A (karta alertu, rozwijanie szczegółów,
zakładka „Alerty", wyszukiwarka i filtry, panel „Moja okolica",
`/instalacja` i przycisk opinii, komunikat offline/błędu), oraz całe
sekcje B–D — pozostają: PENDING — końcowa walidacja przez
doświadczonego użytkownika technologii asystującej przed publikacją
sklepową.**

---

## A. VoiceOver

### Gdzie włączyć

Ustawienia → Dostępność → VoiceOver → włącz przełącznik. (Skrót: potrójne
kliknięcie bocznego przycisku, jeśli wcześniej skonfigurowane w
Ustawienia → Dostępność → Skrót dostępności.)

### Podstawowe gesty, których będziesz używać

- **Przesunięcie w prawo/lewo jednym palcem** — przejście do
  następnego/poprzedniego elementu.
- **Podwójne stuknięcie** — aktywacja zaznaczonego elementu (odpowiednik
  zwykłego dotknięcia).
- **Przesunięcie w górę/dół dwoma palcami** — czytanie od góry ekranu.
- **Obrót (rotor)** — przekręcenie dwóch palców na ekranie jak pokrętło;
  pozwala przełączyć tryb nawigacji na "Nagłówki", co przyspiesza
  poruszanie się po długich stronach (`/prywatnosc`, `/zasady`).

### Co dokładnie sprawdzić (8 elementów)

1. **Link „Pomiń nawigację"** — otwórz stronę główną, zrób jedno
   przesunięcie w prawo od samej góry. Pierwszym odczytanym elementem
   powinien być link „Przejdź do treści". Podwójne stuknięcie na nim
   powinno przenieść czytanie od razu do głównej treści (np. nagłówka
   „Dzisiaj"), pomijając cały nagłówek i nawigację.
   **PASS:** VoiceOver czyta "Przejdź do treści, łącze" jako pierwszy
   element, a po aktywacji czytanie kontynuuje od głównej treści.
2. **Karta alertu** — przesuwaj się przez pierwszą kartę alertu na
   stronie głównej lub `/alerty`. VoiceOver powinien odczytać kategorię,
   poziom ważności, tytuł, miejsce i datę w zrozumiałej kolejności.
   **PASS:** słyszysz kolejno np. "Drogi, Informacja, Nowe, Trwa,
   [tytuł alertu], łącze" — nic nie brzmi jak przypadkowy fragment.
3. **Przycisk „Szczegóły"** — znajdź i aktywuj przycisk „Szczegóły ▼" na
   karcie alertu. VoiceOver powinien ogłosić zmianę stanu (rozwinięte).
   **PASS:** usłyszysz coś w rodzaju "Ukryj szczegóły, rozwinięte" po
   aktywacji, nie ciszę.
4. **Zapis „Moja okolica"** — przejdź do `/alerty`, znajdź „Ustaw moją
   okolicę", wpisz dowolną miejscowość i aktywuj „Zapisz preferencje".
   **PASS:** VoiceOver **automatycznie ogłasza na głos** "Preferencje
   zapisane — tylko w tej przeglądarce", bez potrzeby ręcznego
   przesuwania palcem do tego miejsca. (To jest dokładnie to, co
   naprawiono w tym bloku — jeśli usłyszysz ciszę zamiast ogłoszenia,
   zanotuj to jako błąd.)
5. **Dolna nawigacja** — przesuń się przez cztery zakładki (Dzisiaj,
   Alerty, Odpady, Więcej). Aktywna zakładka powinna być rozpoznawalna.
   **PASS:** VoiceOver dodaje "wybrane" przy aktualnie aktywnej zakładce.
6. **Formularz logowania (`/login`)** — przejdź do pól Email i Hasło.
   **PASS:** każde pole jest zapowiedziane własną nazwą ("Email, pole
   tekstowe", "Hasło, zabezpieczone pole tekstowe"), nie tylko "pole
   tekstowe" bez kontekstu.
7. **Rotor „Nagłówki" na `/prywatnosc`** — użyj rotoru, wybierz
   "Nagłówki", przesuwaj się w dół.
   **PASS:** rotor pokazuje wszystkie sekcje ("Kto prowadzi serwis",
   "Jakie dane...", itd.) jako osobne przystanki — nie trzeba czytać
   całej strony liniowo, by dotrzeć do interesującej sekcji.
8. **Przycisk zamknięcia baneru aktualizacji PWA** (jeśli się pojawi,
   np. po ponownym wejściu na stronę) — przycisk „✕" (Zamknij).
   **PASS:** VoiceOver odczytuje "Zamknij, przycisk", nie samo "X" bez
   kontekstu.

### Co zapisać lub sfotografować

- Dla każdego z 8 punktów: PASS / FAIL + jedno zdanie, co dokładnie
  usłyszałeś (nie musisz nagrywać dźwięku — wystarczy notatka).
- Jeśli coś nie działa: zrób zrzut ekranu miejsca, w którym się
  zatrzymałeś, i prześlij razem z notatką.
- Nie trzeba oceniać "ogólnego wrażenia" — konkretne PASS/FAIL na każdy
  punkt wystarczy.

---

## B. Większy tekst i pogrubienie

### Ustawienia iOS

Ustawienia → Ekran i jasność → Rozmiar tekstu — przesuń suwak maksymalnie
w prawo. Dodatkowo: Ustawienia → Dostępność → Wyświetlacz i rozmiar
tekstu → włącz "Pogrubiony tekst" (wymaga ponownego uruchomienia
telefonu — iOS o tym poinformuje).

Dla jeszcze większego przybliżenia: Ustawienia → Dostępność →
Wyświetlacz i rozmiar tekstu → Większy tekst → włącz "Większy tekst
ułatwień dostępu" i przesuń suwak do końca (to wykracza poza zwykły
zakres Dynamic Type).

### Co sprawdzić

- Strona główna, `/alerty`, szczegóły dowolnego alertu, `/odpady`,
  `/login` — otwórz każdą.
- Sprawdź, czy tytuły alertów, przyciski i etykiety pól nadal mieszczą
  swoją treść w całości.
- Sprawdź przyciski „Zapisz preferencje", „Szczegóły ▼", zakładki
  dolnej nawigacji — czy tekst nie jest obcięty ani nie nachodzi na
  ikonę.

### Jak rozpoznać ucinanie lub nakładanie

- **Ucinanie:** tekst kończy się nagle w połowie słowa albo znika za
  krawędzią przycisku/karty bez trzech kropek (…).
- **Nakładanie:** dwa fragmenty tekstu (np. etykieta i ikona, albo dwie
  linie tekstu) wizualnie się pokrywają lub stykają bez odstępu.
- Jeśli zobaczysz którekolwiek z powyższych, zrób zrzut ekranu z
  dokładną nazwą strony i elementu.

---

## C. Obsługa jedną ręką i bez dokładnego celowania

- Trzymając telefon jedną ręką (kciukiem obsługując ekran), sprawdź czy
  dolna nawigacja (Dzisiaj/Alerty/Odpady/Więcej) jest wygodna do
  dotknięcia bez zmiany chwytu.
- Sprawdź przycisk „Zapisz preferencje" i „Szczegóły ▼" na karcie
  alertu — czy trafienie kciukiem bez patrzenia dokładnie na krawędź
  przycisku nadal działa (obszary dotykowe mają zaprojektowane min.
  44×44px, ale warto potwierdzić to w praktyce, nie tylko w kodzie).
- Spróbuj otworzyć ustawienia „Moja okolica" i zapisać preferencję,
  trzymając telefon tylko jedną ręką od początku do końca.

**PASS:** żadna z powyższych czynności nie wymagała zmiany chwytu ani
użycia drugiej ręki do precyzyjnego trafienia w mały element.

---

## D. Tryb offline i błąd sieci

1. Włącz tryb samolotowy (Centrum sterowania → ikona samolotu).
2. Otwórz Alertownik (jeśli był wcześniej odwiedzony w tej przeglądarce
   — najlepiej z ekranu głównego, jeśli dodany).
3. **Co powinno się pojawić:** ekran „Brak połączenia z internetem" z
   przyciskiem „Spróbuj ponownie" — **nigdy** stara lista alertów
   pokazana jako aktualna.
4. Wyłącz tryb samolotowy.
5. Dotknij „Spróbuj ponownie" (albo odśwież stronę).
6. **Jak wrócić do działania:** strona powinna załadować się normalnie,
   pokazując aktualną listę alertów, bez konieczności zamykania i
   ponownego otwierania aplikacji.
7. Dodatkowo: spróbuj otworzyć `/alerty` w trybie samolotowym bez
   wcześniejszego odwiedzenia strony (pierwsza wizyta offline) — to
   pokaże błąd przeglądarki (brak połączenia), nie ekran offline
   Alertownika, ponieważ nic nie zostało jeszcze zapisane w pamięci
   podręcznej. To oczekiwane zachowanie, nie błąd.

---

## Status tego dokumentu

Przygotowana instrukcja, **niewykonana**. Żaden z powyższych punktów nie
został przetestowany przez Claude ani przez rzeczywistą osobę
niewidomą — to nie jest certyfikat dostępności, tylko lista kontrolna
czekająca na ręczne wykonanie przez Adama.
