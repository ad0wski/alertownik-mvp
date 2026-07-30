# Blok Przyspieszający Zamknięcie A–D

**Data:** 2026-07-30
**Status:** audyt + pakiety przygotowawcze gotowe do wykorzystania przez Adama.
Żadne konto nie zostało założone, żadna wiadomość nie została wysłana, żadna
płatność nie została wykonana, żaden formularz sklepowy nie został złożony.

Ten dokument łączy: audyt niespełnionych kryteriów Definition of Done dla
Etapów A, C, D (z podziałem na kto/co może to wykonać), pełny pakiet Store
Readiness (Etap D), materiały ułatwiające rekrutację testerów (Etap A) i
minimalny fundament monetyzacji (Etap C — wyłącznie planowanie, zero
kontaktu/publikacji).

---

## 1. Audyt niespełnionych kryteriów DoD — Etapy A, C, D

Źródła: `docs/MASTER_ROADMAP_V2.md`, `docs/DEFINITION_OF_DONE_V1.md`,
przeczytane w całości przed tym audytem.

### Etap A — Uproszczenie UX i dopięcie produktu lokalnego

DoD: ≥3 zakończone, realne testy Local Beta + każdy zgłoszony problem UX
obsłużony (wdrożony/odłożony/odrzucony z powodem) + zero regresji.

| Niespełnione kryterium | Grupa | Szczegóły |
|---|---|---|
| Brakuje 2–4 zakończonych testów Local Beta (obecnie 1/3–5) | **C** | Wymaga realnych ludzi (sąsiedzi/znajomi Adama) i czasu na ich odpowiedź |
| Ewentualne nowe zgłoszenia UX z tych testów | **A/B** | Claude może wdrożyć drobne poprawki od razu, jeśli się pojawią — ale nie ma ich jeszcze, bo testów brakuje |
| Wysłanie zaproszeń do kolejnych testerów | **B** | Decyzja "kogo/kiedy/jak" należy wyłącznie do Adama |

**W tym bloku wykonane (grupa A):** przegląd `/instalacja` i procesu
rekrutacji, materiały ułatwiające zbieranie odpowiedzi (§3 poniżej).

### Etap C — Minimalny test monetyzacji

DoD: oferta spisana + lista celowa spisana + oferta wysłana do ≥1 adresata +
odpowiedź (lub jej brak) udokumentowana.

| Niespełnione kryterium | Grupa | Szczegóły |
|---|---|---|
| Oferta (co płaci partner, za co) | **A** | Możliwe do przygotowania teraz — wykonane w §4 |
| Lista celowa (kto realnie mógłby zapłacić) | **A** | Możliwe do przygotowania teraz — wykonane w §4 |
| Wysłanie oferty do ≥1 adresata | **B** | Wymaga jawnej, osobnej decyzji Adama (komu, kiedy) — **nie wykonane w tym bloku, zgodnie z instrukcją** |
| Udokumentowana odpowiedź | **C** | Zależy od adresata, po wysyłce |

**W tym bloku wykonane (grupa A):** 3 modele monetyzacji, wybór jednego do
pierwszego testu, hipoteza, próg GO/NO-GO, tekst testowy, lista do 5
odbiorców (§4 poniżej) — nic z tego nie zostało wysłane ani opublikowane.

### Etap D — Store Readiness i decyzja PWA / Android TWA / iOS

DoD (D1 Android TWA): konto Google Play Console + 12 testerów/14 dni + realne
zgłoszenie i zatwierdzenie. DoD (D2 iOS, opcjonalny): konto Apple Developer +
review + widoczność w App Store. Całość "zamknięta" gdy D1 zrobione i Adam
podjął jawną decyzję co do D2.

| Niespełnione kryterium | Grupa | Szczegóły |
|---|---|---|
| Konto Google Play Console | **D** | Jednorazowa opłata (aktualnie **25 USD**, zweryfikowane w tym bloku bezpośrednio z oficjalnej pomocy Google — patrz §2.1) |
| 12 testerów opt-in × 14 dni ciągle | **C** | Ten sam wymóg co Local Beta (Etap A) — realni ludzie, czas |
| Rzeczywiste zgłoszenie do Google Play | **D** | Wymaga konta + spełnionych testerów najpierw |
| Konto Apple Developer Program (jeśli D2) | **D** | 99 USD/rok, decyzja Adama, dopiero po D1 |
| Zgłoszenie do App Store (jeśli D2) | **D** | Wymaga konta + przygotowanych assetów iOS |
| Pełny pakiet tekstów Data Safety/App Privacy/content rating/target audience | **A** | Możliwe do przygotowania teraz jako szkice — wykonane w §2 |
| `assetlinks.json` + spakowanie TWA (Bubblewrap) | **B/D** | Techniczne przygotowanie możliwe wcześniej, ale bez sensu budować przed kontem — Sprint 186A już to ustalił; nadal aktualne |
| Dane wydawcy (nazwa/adres/kontakt do formularzy) | **B** | Decyzja Adama, nie coś do wypełnienia automatycznie |
| Wizualna akceptacja assetów `assets/store/` | **B** | Adam musi jawnie zaakceptować przed jakimkolwiek publicznym użyciem |

**W tym bloku wykonane (grupa A):** pełny pakiet Store Readiness (§2) — audyt
techniczny, teksty listingowe, szkice formularzy Data Safety/App
Privacy/content rating/target audience/reklamy/uprawnienia/konta, weryfikacja
assetów, instrukcja krok-po-kroku dla Adama.

---

## 2. Etap D — Pełny pakiet Store Readiness (bez kont, bez zgłoszenia)

### 2.1 Wymagania platform zweryfikowane bezpośrednio dziś (nie zgadywane)

- **Google Play, konta osobiste założone po 13.11.2023:** minimum **12
  testerów opt-in nieprzerwanie przez 14 kolejnych dni** w teście zamkniętym,
  przed dopuszczeniem do produkcji. Źródło: oficjalna pomoc Google Play
  Console ("Testing requirements for new personal developer accounts"),
  zweryfikowane bezpośrednim fetchem 2026-07-30. Te same liczby co w Sprincie
  186A (2026-08-02) — niezmienione.
- **Google Play Console — opłata jednorazowa za konto deweloperskie:**
  aktualnie **25 USD** (jednorazowa, nie roczna).
- **Apple App Store, wytyczna 4.2 (Minimum Functionality):** "Your app should
  include features, content, and UI that elevate it beyond a repackaged
  website. If your app is not particularly useful, unique, or 'app-like', it
  doesn't belong on the App Store." (4.2.2: aplikacja nie może być głównie
  materiałem marketingowym/agregatorem linków). Zweryfikowane bezpośrednim
  fetchem oficjalnych App Store Review Guidelines 2026-07-30 — identyczny
  cytat co Sprint 186A, wciąż aktualny.
- **Wymiary assetów Google Play** (zweryfikowane bezpośrednio z oficjalnej
  pomocy Google 2026-07-30): ikona sklepu 512×512 px, feature graphic
  1024×500 px, screenshoty telefonu min. 320 px / max 3840 px (zalecane
  ≥1080p do kwalifikacji na promowane miejsca).
- **Wymiary screenshotów App Store Connect** (zweryfikowane bezpośrednio
  2026-07-30): dla iPhone m.in. 1320×2868 (6,9"), 1284×2778 (6,5"),
  1179×2556 (6,3"), 1170×2532 (6,1") — **żaden z tych rozmiarów jeszcze nie
  istnieje w projekcie**, ponieważ iOS jest ostatni w kolejności i wymaga
  osobnej decyzji Adama (patrz §2.5 poniżej — uczciwie oznaczone jako brak,
  nie jako gotowe).

### 2.2 Audyt techniczny (ponownie zweryfikowany osobiście w tym bloku)

| Element | Stan | Dowód |
|---|---|---|
| Manifest (`src/app/manifest.ts`) | ✅ kompletny | wszystkie wymagane pola, `categories: ["news","utilities"]`, 5 ikon, 3 screenshoty |
| Service worker (`public/sw.js`) | ✅ | cache tylko `offline.html` + 1 ikona, fail-closed, nigdy admin/API |
| Tryb offline | ✅ | ekran „Brak połączenia" zamiast starej treści — nigdy nieaktualny alert jako aktualny |
| Instalacja (`/instalacja`) | ✅ | 3 platformy, potwierdzone realnym testem iPhone (Sprint 181B) |
| Ikony | ✅ | 192×192, 512×512, maskable 512×512 (pełne tło), SVG, favicon multi-res (16/32/48/256), apple-icon 180×180 — wszystkie rozmiary zweryfikowane bezpośrednio z plików w tym bloku (`file` na PNG) |
| Screenshoty (public) | ✅ | 390×844 ×2, 1280×800 ×1 — zweryfikowane bezpośrednio |
| Safe-area (`viewport-fit=cover`) | ✅ | potwierdzone istniejącym testem `test:pwa` |
| Routing publiczny (`/`, `/alerty`, `/demo`, `/instalacja`) | ✅ | wszystkie 200 na Production w tym bloku |
| Prywatność (`/prywatnosc`) | ✅ istnieje, ale **status "szkic beta"** | jawnie oznaczone jako wymagające finalizacji przed prawdziwym zgłoszeniem sklepowym — nieukryte |
| Zasady (`/zasady`) | ✅ istnieje, **status "szkic beta"** | jak wyżej |
| Support/contact URL | ✅ | `alertownik.kontakt@gmail.com`, używany konsekwentnie w `/prywatnosc`, `/zasady`, linkach "Napisz do nas" |
| Brak sekretów/PII w publicznych plikach | ✅ | zweryfikowane grepem w Sprincie 186A, brak zmian od tego czasu |
| **Asset Play Store — kanał alfa ikony** | ⚠️ **wymaga weryfikacji przed zgłoszeniem** | `assets/store/play-icon-512.png` to PNG **bez kanału alfa** (RGB, nie RGBA) — oficjalna pomoc Google wspomina "32-bit PNG z kanałem alfa" dla ikony sklepu. Nie zgaduję czy to twardy błąd czy tylko zalecenie — **do potwierdzenia bezpośrednio w formularzu Play Console dopiero przy realnym zgłoszeniu**, nie regenerowane teraz bez pewności co do wymogu. |
| Assety iOS (ikona 1024×1024, screenshoty iPhone/iPad) | ❌ **nie istnieją** | uczciwie: nie zostały jeszcze wygenerowane, ponieważ iOS jest ostatni w kolejności (D2, opcjonalny, decyzja Adama) |

### 2.3 Pakiet tekstowy — listing (aktualizacja Sprint 186A §7, bez zmian treści — potwierdzone wciąż aktualne)

**Nazwa aplikacji:** Alertownik

**Krótki opis (74/80 znaków):**
> Lokalne alerty: drogi, woda, prąd, odpady i komunikaty dla Twojej okolicy.

**Pełny opis:**
> Alertownik to lokalny serwis alertów dla Komorowa, Pruszkowa i okolic
> (Gmina Michałowice, Miasto Pruszków, Powiat Pruszkowski). Zbiera w jednym
> miejscu komunikaty z oficjalnych źródeł — utrudnienia drogowe, przerwy w
> dostawie wody i prądu, zmiany w odbiorze odpadów, komunikaty gminne i
> informacje transportowe (WKD).
>
> Każdy alert pochodzi z oficjalnego źródła i jest ręcznie zatwierdzany przed
> publikacją. Alertownik ogranicza duplikaty i nieaktualne wpisy, dzięki
> czemu widzisz tylko to, co naprawdę ważne.
>
> To wczesny, niezależny pilotaż — wciąż rozwijany i testowany. Alertownik
> nie jest oficjalną aplikacją żadnej gminy, WKD, PGE ani innej instytucji i
> nie zastępuje numerów alarmowych.

**Kategoria:** Wiadomości / Narzędzia (news / utilities).

**Słowa kluczowe (jeśli platforma wymaga):** alerty lokalne, komunikaty
gminne, utrudnienia drogowe, przerwy w wodzie, wyłączenia prądu, odpady,
Komorów, Pruszków, Michałowice, WKD.

**Tekst wersji testowej (Google Play Closed Testing "release notes"):**
> Wczesna, testowa wersja Alertownika. Zbieramy alerty lokalne (drogi, woda,
> prąd, odpady, komunikaty gminne) dla Komorowa, Pruszkowa i okolic z
> oficjalnych źródeł. Prosimy o testowanie i zgłaszanie uwag — projekt jest
> w fazie pilotażu.

**Instrukcja dla testerów (Play Console "tester instructions"):**
> Dziękujemy za pomoc w testowaniu Alertownika! Po zainstalowaniu otwórz
> aplikację i sprawdź listę alertów oraz filtrowanie wg okolicy/kategorii.
> Jeśli coś nie działa lub wygląda dziwnie, napisz nam krótko na
> alertownik.kontakt@gmail.com — każda uwaga się liczy. Aby test się liczył
> do wymogu Google, prosimy o pozostanie zapisanym jako tester nieprzerwanie
> przez 14 dni.

**Opis funkcji (krótkie punkty):**
- Lista bieżących alertów z możliwością filtrowania wg kategorii i okolicy.
- "Moja okolica" — zapamiętuje wybrane miejscowości lokalnie na urządzeniu.
- Tryb ciemny/jasny/systemowy.
- Działa offline (pokazuje ekran "brak połączenia", nigdy nieaktualną treść).
- Zero kont, zero logowania dla mieszkańców.

**Informacje o źródłach danych (do sekcji "About"/opisu):**
> Wszystkie alerty pochodzą z oficjalnych, publicznie dostępnych źródeł:
> stron urzędów gmin, wodociągów, PGE Dystrybucja, WKD i zarządów dróg.
> Każdy komunikat jest ręcznie zweryfikowany przez administratora projektu
> przed publikacją — Alertownik nie publikuje niczego automatycznie na
> podstawie plotek ani mediów społecznościowych.

**Informacja o niezależności projektu:**
> Alertownik to niezależny, niekomercyjny projekt pilotażowy prowadzony przez
> osobę prywatną. Nie jest oficjalną aplikacją żadnej gminy, WKD, PGE ani
> innej instytucji wymienionej w treści alertów.

### 2.4 Szkice formularzy zgodności (Data Safety / App Privacy / content rating / target audience) — do wypełnienia przez Adama, nigdy nie składane automatycznie

Oparte wyłącznie na faktycznym, zweryfikowanym zachowaniu aplikacji
(`src/app/prywatnosc/page.tsx`, przeczytane w całości w tym bloku) — żadna z
poniższych odpowiedzi nie jest zgadywana.

**Google Play — Data Safety:**

| Pytanie formularza | Szkic odpowiedzi |
|---|---|
| Czy aplikacja zbiera lub udostępnia dane użytkownika? | Tak, w minimalnym zakresie (patrz niżej) |
| Adres e-mail | Zbierany **wyłącznie jeśli użytkownik sam napisze do nas** (link "Napisz do nas") — dobrowolne, nie wymagane do korzystania z aplikacji |
| Lokalizacja precyzyjna/przybliżona | **Nie zbierana.** "Moja okolica" to ręczny wybór miejscowości z listy, zapisywany lokalnie (localStorage) — nigdy GPS, nigdy wysyłany na serwer |
| Dane urządzenia/identyfikatory | Standardowe logi hostingu (adres IP, czas żądania, user-agent) — wyłącznie do działania/bezpieczeństwa serwisu, nie do reklam ani profilowania |
| Dane finansowe | Nie zbierane — aplikacja nie ma płatności |
| Dane zdrowotne, kontakty, zdjęcia, pliki | Nie zbierane |
| Czy dane są udostępniane stronom trzecim? | Dane trafiają wyłącznie do dostawców infrastruktury (Vercel — hosting, Supabase — baza danych) jako podmiotów przetwarzających, nigdy nie są sprzedawane ani udostępniane w celach reklamowych |
| Czy dane są szyfrowane w tranzycie? | Tak (HTTPS wszędzie) |
| Czy użytkownik może zażądać usunięcia danych? | Tak — kontakt e-mail w `/prywatnosc`, opisane prawa RODO |
| Cel zbierania | Działanie i bezpieczeństwo serwisu, odbieranie opinii — nigdy reklamy ani sprzedaż danych |

**Apple — App Privacy ("Nutrition Label"):**

| Kategoria danych Apple | Zbierane? | Powiązane z tożsamością? | Używane do śledzenia? |
|---|---|---|---|
| Contact Info (e-mail) | Tylko jeśli użytkownik sam napisze | Tak (dobrowolne) | Nie |
| Location | Nie | — | — |
| User Content | Nie (nie ma miejsca na treści generowane przez użytkownika) | — | — |
| Identifiers | Nie (brak kont, brak reklamowych ID) | — | — |
| Usage Data | Nie (brak analityki zewnętrznej) | — | — |
| Diagnostics | Standardowe logi hostingu, wyłącznie techniczne | Nie | Nie |

**Content rating (przewidywana odpowiedź na kwestionariusz IARC/Play):**
brak przemocy, treści dla dorosłych, hazardu, wulgaryzmów, treści
generowanych przez użytkowników widocznych publicznie — aplikacja
informacyjna dla wszystkich grup wiekowych. Przewidywany rating: **PEGI 3 /
Everyone**.

**Target audience (grupa docelowa):** dorośli mieszkańcy konkretnego obszaru
geograficznego (Komorów, Pruszków i okolice) — **nie kierowana do dzieci**,
brak treści ani funkcji projektowanych z myślą o dzieciach.

**Reklamy:** brak. Aplikacja nie wyświetla i nie planuje wyświetlać reklam.

**Zbieranie i udostępnianie danych:** patrz tabela Data Safety wyżej —
minimalne, wyłącznie techniczne/dobrowolne, zero sprzedaży/udostępniania
reklamowego.

**Uprawnienia (permissions):** aplikacja (PWA) nie prosi o żadne uprawnienia
natywne (brak dostępu do aparatu, mikrofonu, kontaktów, lokalizacji
GPS, SMS). Jedyne co przeglądarka może zapytać to zgoda na instalację PWA —
nie jest to uprawnienie w rozumieniu Android/iOS.

**Logowanie i konta użytkowników:** brak kont dla mieszkańców — pełny dostęp
publiczny bez logowania. Panel administratora istnieje, ale nie jest
dystrybuowany jako część publicznej aplikacji/PWA widocznej w sklepie.

### 2.5 Weryfikacja assetów — bez sztucznego uznawania braków za gotowe

- Wszystkie assety **wymagane dziś dla PWA/Android** istnieją i mają
  potwierdzone, poprawne wymiary (§2.2).
- **Ikona Play Store bez kanału alfa** — oznaczona jako wymagająca
  weryfikacji przy realnym zgłoszeniu (§2.2), **nie oznaczona jako gotowa na
  siłę**.
- **Assety iOS nie istnieją** — jawnie i uczciwie oznaczone jako brak, nie
  jako "do zrobienia później bez znaczenia". Ich brak nie blokuje niczego
  dziś, bo iOS (D2) jest z definicji ostatni w kolejności i wymaga osobnej
  decyzji Adama.
- Dodatkowe screenshoty (np. `/odpady`, tryb ciemny) pozostają opcjonalnym
  rozszerzeniem na przyszłość — nieblokujące, tak jak ustalono w Sprincie
  186A.

### 2.6 Instrukcja dla Adama — krok po kroku, gdy zdecydujesz się iść dalej

1. **Jakie konto:** Google Play Console (konto deweloperskie osobiste).
2. **Koszt:** jednorazowa opłata **25 USD** (nie abonament).
3. **Kiedy najlepiej założyć:** dopiero **po** realnym zamknięciu Local Beta
   (Etap A) — Google i tak wymaga 12 testerów/14 dni, więc zakładanie konta
   wcześniej tylko duplikuje pracę rekrutacyjną bez żadnej korzyści.
4. **Jakie dane będą wymagane przy zakładaniu konta:**
   - dane tożsamości/wydawcy (imię i nazwisko lub nazwa firmy, adres,
     kontakt),
   - metoda płatności (karta) do jednorazowej opłaty 25 USD,
   - akceptacja regulaminu Google Play Developer Distribution Agreement.
5. **Co dokładnie kliknąć później (po założeniu konta i domknięciu Local
   Beta):**
   - utworzyć nową aplikację w Play Console,
   - wypełnić Store Listing tekstami z §2.3 (skopiuj-wklej),
   - wgrać assety z `assets/store/` (po Twojej wizualnej akceptacji) —
     zweryfikować kanał alfa ikony przy wgrywaniu (§2.2),
   - wypełnić formularz Data Safety odpowiedziami z §2.4,
   - wypełnić content rating (kwestionariusz IARC) zgodnie z §2.4,
   - dodać 12 testerów opt-in do zamkniętego testu, poczekać 14 dni ciągłych,
   - dopiero wtedy złożyć zgłoszenie do produkcji.
6. **Czego jeszcze brakuje przed faktycznym zgłoszeniem:**
   - finalizacja `/prywatnosc` i `/zasady` (obecnie oznaczone jako "szkic
     beta" — decyzja czy potrzebują ostatecznej wersji/konsultacji prawnej),
   - dane wydawcy do formularzy,
   - `assetlinks.json` i spakowanie TWA (np. Bubblewrap) — techniczne, może
     wykonać Claude po Twojej decyzji o rozpoczęciu tego kroku,
   - 12 testerów Play Console (mogą, ale nie muszą, pokrywać się z testerami
     Local Beta — patrz §3).

**Nic z powyższego nie zostało wykonane automatycznie** — to jest gotowy
plan czekający na Twoje decyzje i działania w zewnętrznych panelach.

---

## 3. Etap A — Materiały ułatwiające rekrutację testerów

### 3.1 Przegląd `/instalacja` i procesu

Osobiście przeczytany `src/app/instalacja/page.tsx` w tym bloku: instrukcja
ma już tylko 3 kroki dla Android/Chrome, 4 dla iPhone/Safari (minimalne
możliwe dla iOS — Safari wymaga dodatkowego kroku "Udostępnij" niezależnie
od redakcji tekstu), 3 dla komputera. **Nie znaleziono zbędnych kroków do
usunięcia** — instrukcja jest już maksymalnie skrócona bez utraty
poprawności. Nie wykonano kosmetycznego redesignu bez konkretnego problemu
(zgodnie z zasadą projektu).

### 3.2 Bardzo krótka wiadomość do bliskiej osoby (np. rodzina, dobry znajomy)

> Cześć! Testuję prostą apkę, którą robię — pokazuje lokalne alerty
> (utrudnienia, woda, prąd, odpady) dla Komorowa/Pruszkowa. Zajmie Ci 2
> minuty: [link] → dodaj do ekranu głównego (pokażę jak, jeśli trzeba) →
> napisz mi jedno zdanie, co myślisz. Dzięki! 🙏

### 3.3 Neutralna wiadomość do dalszego znajomego

> Cześć, prowadzę niewielki, niezależny projekt — Alertownik, serwis z
> lokalnymi komunikatami (drogi, woda, prąd, odpady) dla Komorowa, Pruszkowa
> i okolic, budowany z oficjalnych źródeł. Szukam kilku osób do krótkiego
> testu — czy miał(a)byś ochotę rzucić okiem i podzielić się krótką opinią?
> Demo: https://alertownik-mvp.vercel.app/demo. Zajmie to dosłownie kilka
> minut, nie ma żadnego zobowiązania.

### 3.4 Maksymalnie prosty formularz odpowiedzi (do odesłania zwykłą wiadomością)

> 1. Czy udało się otworzyć aplikację? (tak/nie)
> 2. Czy coś było niejasne albo nie działało? (jedno zdanie wystarczy)
> 3. Czy format komunikatów ma dla Ciebie sens? (tak/nie/nie wiem)
> 4. Coś jeszcze, co chciał(a)byś powiedzieć? (opcjonalnie)

### 3.5 Checklista Adama — zebranie brakujących 2–4 testów

- [ ] Wybierz 2–4 osoby (rodzina/sąsiedzi/znajomi z obszaru pilotażu lub
      spoza niego — obie grupy dają wartościowy feedback).
- [ ] Wyślij wiadomość z §3.2 (bliska osoba) lub §3.3 (dalszy znajomy) —
      wybierz wariant pasujący do relacji.
- [ ] Poczekaj na realną odpowiedź (rozmowa lub formularz z §3.4).
- [ ] Zapisz każdą odpowiedź w `docs/` (ten sam wzorzec co istniejący wpis
      "mama Adama" w historii Etapu A).
- [ ] Każdy zgłoszony realny problem UX: przekaż Claude'owi do wdrożenia,
      świadomego odłożenia (z powodem) lub odrzucenia (z powodem).
- [ ] Gdy licznik osiągnie ≥3 zakończone testy — Etap A spełnia DoD.

**Żadna z powyższych wiadomości nie została wysłana przez Claude'a w tym
bloku** — to gotowe szkice czekające na Twoją decyzję "komu i kiedy".

---

## 4. Etap C — Minimalny fundament monetyzacji (planowanie wyłącznie)

### 4.1 Trzy realistyczne modele

| Model | Kto płaci | Za co dokładnie | Orientacyjny test | Ryzyka | Wpływ na mieszkańców/niezależność |
|---|---|---|---|---|---|
| **1. Sponsoring gminny** | Gmina/urząd (np. Michałowice) | Oficjalne partnerstwo: gmina finansuje utrzymanie/rozwój w zamian za odznaczenie "we współpracy z" i priorytetowe wsparcie ich komunikatów | Krótka oferta do gminy po pierwszym sygnale z Etapu B | Ryzyko utraty postrzeganej niezależności; gmina może oczekiwać kontroli treści | Musi być jawnie oznaczone — mieszkańcy muszą wiedzieć, że to nadal niezależny projekt, nie oficjalna aplikacja gminy |
| **2. Lokalny sponsor/przedsiębiorca** | Lokalna firma (np. sklep, usługa) | Mała, jawnie oznaczona wzmianka/baner "sponsor lokalny" — nigdy reklama wyskakująca ani targetowana | Test 1 rozmowy z lokalnym przedsiębiorcą | Ryzyko postrzegania jako "reklamowe", może zniechęcić część odbiorców | Musi być wyraźnie oddzielone od treści alertów, oznaczone jako reklama/sponsoring |
| **3. Freemium dla gmin (SaaS)** | Inne gminy/powiaty chcące własnej instancji/integracji | Dostęp do panelu zarządzania alertami dla ich obszaru, ewentualnie White-label | Test hipotezy cenowej z 1 zainteresowaną gminą spoza pilotażu | Wymaga multi-tenant architektury (znacząca praca inżynierska, poza zakresem tego bloku) — najbardziej odległy czasowo | Zero wpływu na obecnych mieszkańców pilotażu, jeśli wdrożone poprawnie jako osobna instancja |

### 4.2 Wybrany model do pierwszego testu

**Model 1 — Sponsoring gminny.** Uzasadnienie: naturalnie łączy się z
istniejącym Etapem B (Partner Demo już wysłany do Gminy Michałowice) —
sensowna kolejność to poczekać na odpowiedź z B, a dopiero potem
ewentualnie rozszerzyć rozmowę o model 1, zamiast otwierać nowy,
niepowiązany kontakt. Model 3 wymaga architektury poza zakresem tego bloku.
Model 2 jest możliwy równolegle w przyszłości, ale mniej naturalny jako
pierwszy krok.

### 4.3 Hipoteza, sygnał, próg GO/NO-GO

**Hipoteza:** Gmina obejmująca pilotaż (lub sąsiednia) byłaby skłonna
rozważyć niewielkie, jawnie oznaczone wsparcie finansowe utrzymania serwisu
w zamian za oficjalne wskazanie go mieszkańcom jako dodatkowego,
niezależnego kanału informacyjnego.

**Mierzalny sygnał zainteresowania:** odpowiedź zawierająca chęć rozmowy o
konkretach (nie tylko uprzejme "dziękujemy") — np. pytanie o koszt, warunki,
albo prośba o spotkanie/telefon.

**Próg GO/NO-GO:** GO = ≥1 odpowiedź z realnym zainteresowaniem rozmową w
ciągu 4 tygodni od wysłania. NO-GO = brak odpowiedzi lub jawna odmowa —
wtedy model 1 zostaje odłożony, nie porzucony, i można rozważyć model 2.

### 4.4 Krótki tekst testowy (do ewentualnego wysłania przez Adama, po odpowiedzi z Etapu B)

> Dzień dobry, nawiązując do poprzedniej wiadomości o Alertowniku — gdyby
> po Państwa stronie było zainteresowanie kontynuacją tego tematu, chciałbym
> zapytać, czy widzieliby Państwo sens w niewielkim, jawnie oznaczonym
> wsparciu utrzymania tego niezależnego serwisu w zamian za oficjalne
> wskazanie go mieszkańcom jako dodatkowego źródła informacji. To wciąż
> tylko pytanie rozpoznawcze, nie oferta formalna — chętnie porozmawiam o
> szczegółach, jeśli byłby czas.

### 4.5 Lista do 5 potencjalnych odbiorców (planistyczna, nikt nie skontaktowany)

1. Gmina Michałowice (już w kontakcie przez Etap B — naturalny pierwszy
   adresat po odpowiedzi).
2. Miasto Pruszków (część obecnego pilotażu, jeszcze bez wysłanego
   outreachu Etapu B).
3. Starostwo Powiatowe Pruszkowskie (obejmuje cały obszar pilotażu).
4. Lokalna organizacja pozarządowa działająca na terenie gminy (do
   zidentyfikowania przez Adama — brak konkretnej nazwy bez realnego
   researchu, żeby nie zgadywać).
5. Sąsiednia gmina z dobrym pokryciem źródeł w Etapie F (np. Gmina Raszyn,
   Gmina Brwinów — już mają aktywne źródła check-only, więc rozszerzenie
   objęcia byłoby technicznie tanie).

**Nic z §4 nie zostało wysłane, opublikowane ani nikt nie został
skontaktowany w tym bloku.** Zero kodu integrującego płatności, zero
integracji Stripe/reklam.

---

## 5. Podsumowanie zmian w tym bloku

- `docs/MASTER_ROADMAP_V2.md` — dodany jawny checkpoint Etapu F (16/16
  województw przebadanych, 13/16 z aktywnym źródłem, Lubelskie/
  Dolnośląskie/Lubuskie z 0 GO, Etap F nie porzucony, dalsze fale świadomie
  odłożone, brak Fali 9 w tym bloku).
- `docs/EXEC_BLOCK_ACCELERATE_ABCD_V1.md` — ten dokument (nowy).
- **Zero zmian w kodzie źródłowym** (`src/`) — cały blok to audyt i
  przygotowanie dokumentów; `/instalacja` przejrzana i uznana za już
  optymalną, bez uzasadnienia do zmiany.
- Zero SQL, zero RLS, zero zmian Environment Variables, zero zapisów do
  Supabase, zero wysłanych wiadomości, zero zakupów/rejestracji kont.
