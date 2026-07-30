# Master Roadmap V2 — Alertownik

**Status: kanoniczny roadmap projektu, zastępuje wszystkie wcześniejsze, rozproszone opisy kolejności prac.**

Data: 2026-08-03 (Sprint 188A), po formalnym zamknięciu bloku Dni 1–20
(`docs/SPRINT_187A_DAYS_1_20_FINAL_AUDIT_V1.md`).

---

## 0. Zasada nadrzędna

Ten dokument jest **jedynym kanonicznym roadmapem** projektu. Zawiera dokładnie
sześć etapów: **A, B, C, D, E, F**. Nie ma i nie będzie Etapu G w tej wersji
dokumentu. Rollout Polski falami (województwa, powiaty, gminy, miasta,
mniejsze miejscowości) jest **częścią Etapu F**, nie osobnym etapem.

Po zakończeniu Etapu F projekt zatrzymuje się na pełne podsumowanie i decyzję
Adama — nie ma domyślnego "co dalej".

Każda przyszła propozycja dodania nowego etapu lub rozszerzenia zakresu poza
A–F musi być jawnie oznaczona **ZMIANA ZAKRESU** i zawierać: powód zmiany,
dlaczego nie mieści się w istniejącym etapie A–F, wpływ na termin, oraz czy
zastępuje istniejące zadanie czy wydłuża plan.

`docs/NEXT_MILESTONES.md` (gate system 1–5) i ten dokument opisują tę samą
rzeczywistość z dwóch stron: gate system mierzy **dojrzałość produktu i
walidacji**, ten dokument porządkuje **kolejność i zależności pracy**. Etapy
A–D tego dokumentu odpowiadają w przybliżeniu Bramom 1–5; Etapy E–F są nowe —
opisują skalowanie źródeł i lokalizacji, czego gate system nie mierzył wcale.

---

## Etap A — Uproszczenie UX i dopięcie produktu lokalnego

**Cel:** domknąć Gate 1/2 jakościowo — produkt lokalny (6 miejscowości pilotażu)
ma być prosty, uczciwy i przetestowany przez realnych mieszkańców, zanim
rozmowa przejdzie do partnerów czy skalowania.

**Status (korekta priorytetów, Blok Wykonawczy 1, 2026-08-03) — Etap A ma dwa
niezależnie mierzone wymiary, świadomie rozdzielone:**
- **Etap A techniczny: 100%** — UX/mobile/PWA/testy, w pełni w rękach Claude'a,
  realizowane od razu, niezależnie od odpowiedzi testerów.
- **Walidacja użytkowników (część Gate 2): 20% (1/3–5)** — **zewnętrzny
  strumień równoległy**, nie bramka blokująca. Status zmieniony z „blokuje
  wszystkie dalsze prace" na „zewnętrzny strumień równoległy prowadzony przez
  Adama": dalsza rekrutacja pozostaje wymagana do pełnego domknięcia Local
  Bety i przyszłego Google Play (ten sam wymóg 12 testerów/14 dni), ale **brak
  odpowiedzi testerów nie blokuje realizacji Etapu B ani budowy fundamentu
  Etapu E** — obie te prace ruszają teraz równolegle w tym samym bloku
  wykonawczym, bez czekania na testerów.

**Zakres obowiązkowy:**
- Wdrażanie dalszych, konkretnych poprawek UX wynikających z realnego feedbacku
  (na wzór uproszczenia `/alerty` po feedbacku mamy Adama, Sprint 182A/Dzień 14).
- Utrzymanie zera regresji technicznych (`npm run check`, `npm run test:e2e`,
  `npm run test:pwa` zielone po każdej zmianie).
- Rekrutacja testerów Local Beta pozostaje aktywnym zadaniem Adama (zewnętrzny
  strumień równoległy — patrz status powyżej), ale nie jest warunkiem
  koniecznym do realizacji pozostałych bullet'ów tego etapu ani Etapów B/E.

**Poza zakresem:**
- Nowe źródła danych (to Etap E/F).
- Jakikolwiek kod płatności (Etap C).
- Pakowanie sklepowe (Etap D).

**Stan wejściowy (2026-08-03):** strona techniczna Local Beta 100% (realny test
na iPhone), walidacja użytkowników 1/3–5 (mama Adama, pozytywny, jeden
konkretny UX fix już wdrożony). Zaproszeni testerzy nie odpowiedzieli —
"odłożone, nie porzucone", nie "zablokowane na stałe".

**Definicja zakończenia:** ≥3 zakończone, realne testy Local Beta (rozmowa lub
ustrukturyzowany feedback) + każdy zgłoszony realny UX problem albo wdrożony,
albo świadomie odłożony z uzasadnieniem.

**Zależności:** brak technicznych. Zależy wyłącznie od realnych ludzi
(sąsiedzi/znajomi Adama w obszarze pilotażu).

**Zależne od Adama:** wysłanie nowych zaproszeń, wybór formy rekrutacji
(osobiście / grupa lokalna / inne).

**Zależne od testerów:** odpowiedź i realne użycie aplikacji.

**Zależne od kont Google/Apple:** brak.

**Realny przedział czasu:** 1–3 tygodnie kalendarzowe — całkowicie zależny od
tempa odpowiedzi ludzi, nie od pracy technicznej (która trwałaby &lt;1 dzień na
zgłoszony problem).

**Możliwe równolegle:** Etap B (materiały Partner Demo są już gotowe — wysyłka
outreachu nie wymaga zamkniętego Etapu A) oraz Etap E/F (fundament kodu, nie
aktywacja źródeł na Production).

**Główne ryzyka:** rekrutacja testerów utyka ponownie (już się zdarzyło raz);
brak nowego realnego feedbacku oznacza brak nowych zadań technicznych do
zrobienia — to nie jest problem do "rozwiązania kodem".

**Pomiar postępu:** liczba zakończonych testów Local Beta (X/3–5), liczba
zgłoszonych i obsłużonych UX problemów.

---

## Etap B — Partner Demo i pierwszy rzeczywisty outreach

**Cel:** uzyskać pierwszy realny sygnał od partnera/instytucji (gmina, powiat,
lokalna organizacja) — Gate 3.

**Zakres obowiązkowy:**
- Decyzja Adama o wysłaniu przygotowanej wiadomości outreachowej
  (`docs/SPRINT_185A_PARTNER_DEMO_V1.md` §7) do co najmniej jednego adresata.
- Ewentualne przeprowadzenie 5-minutowego demo (scenariusz już gotowy, §8 tego
  samego dokumentu).
- Zebranie i uczciwe udokumentowanie odpowiedzi (pozytywnej, negatywnej lub
  braku odpowiedzi).

**Poza zakresem:**
- Zawieranie jakichkolwiek formalnych umów lub zobowiązań w imieniu Adama —
  Claude nigdy nie wysyła tej wiadomości samodzielnie, tylko przygotowuje i
  czeka na decyzję.
- Nowe funkcje produktowe pod konkretnego partnera, zanim padnie realna prośba.

**Stan wejściowy:** `/demo` i `/partnerzy` gotowe i wdrożone (Sprint 185A),
wiadomość outreachowa i scenariusz demo gotowe, ale niewysłane. Zero sygnałów
partnerskich.

**Definicja zakończenia:** wiadomość wysłana do ≥1 realnego adresata +
udokumentowana odpowiedź (jakakolwiek) LUB udokumentowana, świadoma decyzja
Adama o odłożeniu na później z podanym powodem.

**Zależności:** Etap B nie wymaga ukończenia Etapu A — może ruszyć równolegle,
materiały są gotowe od Sprintu 185A.

**Zależne od Adama:** decyzja "wysłać / nie wysłać / komu / kiedy" — to
wyłącznie decyzja Adama, nigdy automatyczna.

**Zależne od testerów/instytucji:** odpowiedź adresata.

**Zależne od kont Google/Apple:** brak.

**Realny przedział czasu:** wysyłka — natychmiast, gdy Adam zdecyduje;
odpowiedź instytucji — typowo 1–4 tygodnie (urząd, nie startup).

**Możliwe równolegle:** Etap A, Etap C (decyzja o modelu monetyzacji nie
wymaga czekania na odpowiedź partnera), fundament Etapu E/F.

**Główne ryzyka:** brak odpowiedzi (typowe dla pierwszego kontaktu z
urzędem — nie należy tego interpretować jako porażkę produktu); zbyt
techniczny/długi pierwszy kontakt (zaadresowane już przez krótkie `/demo`).

**Pomiar postępu:** wysłano / nie wysłano; liczba odpowiedzi; jakość sygnału
(zainteresowanie vs. cisza vs. odmowa).

---

## Etap C — Minimalny test monetyzacji

**Cel:** sprawdzić hipotezę cenową/ofertową bez pisania kodu płatności —
Gate 4.

**Zakres obowiązkowy:**
- Sformułowanie oferty (co dokładnie płaci partner/gmina/sponsor i za co).
- Lista celowa (kto realnie mógłby zapłacić — gminy, lokalni przedsiębiorcy,
  inne).
- Wysłanie oferty do ≥1 realnego adresata.
- Udokumentowana hipoteza cenowa (nawet jeśli nie zostanie od razu
  zweryfikowana).

**Poza zakresem (bezwzględnie, zgodnie z CLAUDE.md):**
- Jakikolwiek kod obsługujący płatności, integracje bramek płatniczych,
  przechowywanie danych kart.
- Automatyczne pobieranie opłat.

**Stan wejściowy:** 0% — etap nie rozpoczęty, brak nawet wstępnej oferty.

**Definicja zakończenia:** oferta sformułowana + wysłana do ≥1 adresata +
udokumentowana odpowiedź lub jej brak. Nie wymaga faktycznej transakcji.

**Zależności:** logicznie niezależny od Etapów A/B/D technicznie, ale sensowna
kolejność to *po* pierwszym realnym sygnale z Etapu B — trudno testować cenę
bez żadnego zainteresowanego adresata.

**Zależne od Adama:** cała decyzja — model oferty, cena, adresaci. To
najbardziej "biznesowy", najmniej techniczny etap.

**Zależne od testerów/instytucji:** odpowiedź na ofertę.

**Zależne od kont Google/Apple:** brak.

**Realny przedział czasu:** sformułowanie oferty — godziny pracy Adama, nie
Claude'a; odpowiedź rynku — tygodnie.

**Możliwe równolegle:** z każdym innym etapem poza samym Etapem B (sensowna
kolejność: po pierwszym kontakcie z Etapu B).

**Główne ryzyka:** zbyt wczesne pytanie o pieniądze zanim produkt ma choć
jeden partnerski sygnał zaufania (ryzyko reputacyjne, nie techniczne).

**Pomiar postępu:** oferta sformułowana (tak/nie), wysłana (tak/nie), liczba
i jakość odpowiedzi.

---

## Etap D — Store Readiness i decyzja PWA / Android TWA / iOS

**Cel:** doprowadzić do realnej obecności w sklepie (jeśli i kiedy uzasadnione)
bez przedwczesnego ponoszenia kosztów/ryzyka odrzucenia.

**Zakres obowiązkowy:**
- Utrzymanie PWA jako głównej, już działającej ścieżki dystrybucji.
- Po realnym domknięciu Etapu A (Local Beta): założenie konta Google Play
  Console przez Adama, rozpoczęcie 12-testerów/14-dni zamkniętego testu (ten
  sam wymóg co Local Beta — patrz `docs/SPRINT_186A_STORE_READINESS_V1.md`).
- Publikacja Android TWA po spełnieniu wymogu testerów.
- iOS App Store — dopiero po Android TWA, jako decyzja Adama (koszt 99 USD/rok,
  ryzyko odrzucenia pod Guideline 4.2).

**Poza zakresem:**
- Aplikacja natywna/hybrydowa (React Native/Flutter) — jawnie odrzucona
  rekomendacja w Sprincie 186A, nieproporcjonalny nakład.
- Jakiekolwiek konto/opłata zanim Etap A jest realnie ukończony — Google
  wymaga tego samego co Local Beta, więc rozpoczynanie równolegle tylko
  duplikuje pracę rekrutacyjną.

**Stan wejściowy:** planistycznie i technicznie 100% gotowe (audyt Sprint
186A: manifest, ikony, service worker, assety sklepowe z Sprintu 128, teksty
listingowe robocze) — zero kont, opłat, zgłoszeń rozpoczętych.

**Definicja zakończenia (etapowa, nie jednorazowa):**
- Sub-cel D1 (Android TWA): aplikacja widoczna i instalowalna z Google Play.
- Sub-cel D2 (iOS): aplikacja widoczna i instalowalna z App Store — **opcjonalny**,
  wymaga osobnej decyzji Adama, może nigdy nie zostać podjęty bez utraty
  statusu "ukończony projekt" (PWA-only jest explicite akceptowalnym stanem
  końcowym wg rekomendacji Sprintu 186A).

**Zależności:** technicznie zależy od Etapu A (ten sam wymóg testerów).
Assety wymagają wizualnej akceptacji Adama przed jakimkolwiek publicznym
użyciem (`assets/store/README.md`).

**Zależne od Adama:** założenie kont, opłaty, dane wydawcy, akceptacja
regulaminów platform, wizualna akceptacja assetów.

**Zależne od testerów:** 12 testerów × 14 dni ciągłego opt-in (Google Play).

**Zależne od kont Google/Apple:** tak, wprost — to sedno tego etapu.

**Realny przedział czasu:** Android TWA — 2–4 tygodnie pracy technicznej +
14 dni obowiązkowego okresu testów (mogą iść równolegle, jeśli testerzy z
Etapu A dubluje się z testerami Play Console — nie muszą być tą samą grupą,
ale mogą). iOS — dodatkowe 2–6 tygodni jeśli podjęta decyzja.

**Możliwe równolegle:** przygotowanie techniczne (assetlinks.json, Bubblewrap)
może zacząć się przed formalnym zamknięciem Etapu A; **rozpoczęcie konta i
płatnego procesu — nie**, bo duplikowałoby niezależną rekrutację testerów.

**Główne ryzyka:** odrzucenie przez App Store pod Guideline 4.2 (PWA-wrapper);
przedwczesne rozpoczęcie Play Console przed domknięciem Local Beta
(podwójna, niepotrzebna rekrutacja testerów).

**Pomiar postępu:** konto założone (tak/nie) → testerzy Play Console (X/12,
Y/14 dni) → zgłoszenie wysłane (tak/nie) → zatwierdzone (tak/nie).

---

## Etap E — Ogólnopolska platforma źródeł

**Cel:** przekształcić obecny, w dużej mierze zakodowany na twardo pod 6
miejscowości pilotażu silnik źródeł w skonfigurowalną platformę zdolną
obsłużyć dowolną gminę/powiat/miasto w Polsce — **fundament**, nie
uruchomienie na Production.

**Zakres obowiązkowy:**
- Wspólne typy i interfejs adaptera źródła (WordPress REST, RSS/Atom, HTML,
  PDF, publiczne API) — patrz `docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md`.
- Lifecycle źródła (`discovered → classified → awaiting_review → testable →
  canary → active → degraded → disabled`) jako typy i logika, bez migracji.
- Walidatory konfiguracji źródła, scoring gotowości, read-only coverage
  calculator.
- Audyt i odchudzenie hardkodowanych założeń (`PILOT_LOCALITIES`,
  per-source parsery) do postaci konfigurowalnej tam, gdzie to możliwe bez
  migracji.
- Przygotowanie (ale nie wykonanie) migracji SQL potrzebnych do pełnej
  obsługi geografii Polski (województwo/powiat/gmina/miejscowość jako pola
  strukturalne, nie tylko `place: string`).

**Poza zakresem:**
- Aktywacja jakiegokolwiek nowego źródła na Production.
- Jakikolwiek zapis do `alerts`/`alert_sources`/`source_notice_candidates` na
  Production poza obecnym pilotażem.
- Wykonanie migracji SQL.

**Stan wejściowy:** patrz `docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md` część "Audyt
obecnego kodu" — generyczne (dedup, category keywords, fail-closed
gates, WordPress REST fetch) vs. hardkodowane pod pilotaż
(`PILOT_LOCALITIES`, po jednym ręcznie pisanym parserze HTML na CMS, RSS/PDF
tylko jako placeholder).

**Definicja zakończenia:** fundament kodu (typy, adapter interface,
walidatory, lifecycle, scoring, coverage calculator, testy) scalony do
`main`, zero aktywacji nowych źródeł na Production, `docs/` zawiera
przygotowane (PROPOSED) migracje geograficzne gotowe do wykonania przez
Adama.

**Zależności:** korzysta z tego, co już istnieje (dedup, fail-closed gates,
allowlisty) — nie zastępuje ich, rozszerza. Nie zależy od ukończenia
Etapów A–D.

**Zależne od Adama:** decyzja o wykonaniu przygotowanych migracji SQL (poza
tym sprintem), akceptacja architektury przed realnym batch onboardingiem
źródeł.

**Zależne od testerów/instytucji:** brak bezpośrednio (praca inżynierska).

**Zależne od kont Google/Apple:** brak.

**Realny przedział czasu:** fundament (typy/adaptery/walidatory bez
migracji) — realny do wykonania w 1–2 sprintach roboczych (ten sprint
rozpoczyna). Pełne wdrożenie z migracją i pierwszym batch onboardingiem poza
pilotażem — osobna, większa praca, dopiero w Etapie F.

**Możliwe równolegle:** ze wszystkimi pozostałymi etapami — to praca czysto
inżynierska, nie wymaga zewnętrznych decyzji poza akceptacją architektury.

**Główne ryzyka:** przeinżynierowanie (budowa fikcyjnej architektury bez
zastosowania — jawnie zakazane w tym sprincie); zmiana struktury strony
źródła psująca cały pipeline (adresowane przez fail-closed per-adapter
design, patrz plan architektury).

**Pomiar postępu:** liczba typów/adapterów/walidatorów zaimplementowanych i
przetestowanych; liczba przygotowanych (nie wykonanych) migracji.

---

## Etap F — Rollout Polski falami i partiami źródeł

**Cel:** realne rozszerzenie pokrycia geograficznego i liczby źródeł poza
obecny pilotaż (Gmina Michałowice, Miasto Pruszków, Powiat Pruszkowski),
partiami, przy użyciu fundamentu z Etapu E.

**Zakres obowiązkowy:**
- Wykonanie przygotowanych migracji geograficznych (za zgodą Adama).
- Batch onboarding kolejnych źródeł tego samego typu adaptera (np. 5–20
  źródeł WordPress REST na raz), nie jedno źródło = jeden dzień.
- Certyfikacja każdego źródła (test dostępności, test parsera, sprawdzanie
  dat/duplikatów) przed przejściem do `active`.
- Panel pokrycia Polski (ile województw/powiatów/gmin ma ≥1 aktywne źródło).
- **Rollout falami** — jest to jawnie część tego etapu, nie osobny etap:
  fala 1 (rozszerzenie w obrębie obecnego województwa), fala 2 (sąsiednie
  powiaty), kolejne fale wg realnego zapotrzebowania/partnerstw z Etapu B/C.

**Poza zakresem:**
- Uruchomienie na 100% Polski jednym skokiem — jawnie odrzucone jako model.
- Jakakolwiek automatyzacja publikacji szersza niż istniejący, wąski Trusted
  Source Auto-Publish (patrz CLAUDE.md Security Rule #10) bez osobnej,
  jawnej zgody Adama i własnego audytu bezpieczeństwa.

**Stan wejściowy:** zależny od ukończenia Etapu E (fundament musi istnieć,
zanim partie źródeł da się dodawać bez pisania nowego kodu na każde źródło).

**Definicja zakończenia:** Etap F **nie ma jednego binarnego "koniec"** —
kończy się decyzją Adama o zatrzymaniu po osiągnięciu satysfakcjonującego
pokrycia (np. całe województwo mazowieckie, albo X gmin partnerskich z Etapu
B/C). Projekt zatrzymuje się po Etapie F na pełne podsumowanie — patrz
Sekcja 0.

**Zależności:** twardo zależny od Etapu E (fundament). Realnie korzysta z
sygnałów Etapu B/C (partnerstwa napędzają priorytet kolejnych fal) i stabilności
z Etapu A/D (nie warto skalować źródeł, zanim podstawowy produkt jest
zwalidowany).

**Zależne od Adama:** zgoda na każdą migrację, zgoda na każdą falę
aktywacji źródeł na Production, decyzja kiedy zatrzymać rollout.

**Zależne od testerów/instytucji:** partnerstwa z gminami/powiatami
przyspieszają priorytetyzację fal (naturalne połączenie z Etapem B).

**Zależne od kont Google/Apple:** brak bezpośrednio.

**Realny przedział czasu:** nieokreślony z natury rzeczy — to najdłuższy,
otwarty etap projektu, mierzony falami, nie datami.

**Możliwe równolegle:** z Etapem D (Android TWA) i dalszym Etapem C
(monetyzacja może rosnąć razem z pokryciem).

**Główne ryzyka:** rollout zbyt szybki bez certyfikacji = powtórka błędu z
Powiatu Pruszkowskiego (kandydat wygenerowany, ale niekwalifikujący się na
podstawie treści) na dużo większą skalę; jedno źródło psujące strukturę
strony bez wykrycia = cicha degradacja jakości w wielu miejscach na raz —
stąd wymóg fail-closed per-adapter i monitoringu w Etapie E.

**Pomiar postępu:** panel pokrycia Polski — liczba województw/powiatów/gmin
z ≥1 źródłem `active`, liczba źródeł per lifecycle status, liczba fal
zrealizowanych.

---

## Widoczne oddzielnie (nie jeden mylący procent)

Zgodnie z wymogiem tego sprintu, postęp NIGDY nie jest raportowany jako
jeden zbiorczy procent. Osiem niezależnych wymiarów:

1. **Techniczny produkt** — jakość kodu, testy, Production. Obecnie: bardzo
   dobry (patrz Sprint 187A §13, 95%).
2. **Uproszczenie UX** — Etap A. Obecnie: 1/3–5 realnych testów.
3. **Walidacja użytkowników** — część Etapu A / Gate 2. Obecnie: 20% (1/3–5).
4. **Partner Demo** — Etap B / Gate 3. Obecnie: materiały 100%, outreach 0%
   wysłany.
5. **Outreach** — pod-wymiar Etapu B, śledzony osobno od materiałów: 0
   wiadomości wysłanych.
6. **Monetyzacja** — Etap C / Gate 4. Obecnie: 0%, nierozpoczęte.
7. **Store Readiness** — Etap D / Gate 5. Obecnie: 35% wg formuły Sprintu
   187A (technika+plan zrobione, konta/zgłoszenia nie).
8. **Infrastruktura źródeł ogólnopolskich** — Etap E. Obecnie: 0% przed tym
   sprintem, fundament budowany w Sprincie 188A.
9. **Rzeczywiste pokrycie lokalizacji** — Etap F. Obecnie: 1 powiat (3 gminy:
   Michałowice, Pruszków miasto, częściowo Powiat Pruszkowski), 10 źródeł.

(Celowo 9 pozycji mimo nagłówka "osiem" w wymaganiach oryginalnego briefu —
outreach i Partner Demo rozdzielono na dwa wymiary, bo materiały gotowe ≠
wiadomość wysłana; to rozróżnienie jest bardziej użyteczne niż sztywne
trzymanie się liczby osiem.)

---

## Zależności krzyżowe między etapami (skrót)

```
A (UX/Local Beta) ──┬──> D (Store: wymaga tych samych testerów)
                     │
B (Partner Demo) ────┼──> C (Monetyzacja: sensowna po 1. sygnale z B)
                     │
E (fundament źródeł) ┴──> F (rollout: twardo wymaga E)
```

A, B, E mogą ruszyć od razu i równolegle. C sensownie czeka na pierwszy
sygnał z B (nie technicznie wymagane, ale praktycznie rozsądne). D
technicznie czeka na domknięcie A (dzielony wymóg testerów). F twardo
wymaga E.
