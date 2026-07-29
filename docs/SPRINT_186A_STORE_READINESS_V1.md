# Sprint 186A — Store Readiness: audyt PWA, assety, listing i plan opakowania

Status: **audyt zakończony, jedna bezpieczna poprawka wdrożona, żadne konto ani proces sklepowy nie został rozpoczęty.**

Data: 2026-08-02 (Dzień 19).

---

## 1. Co było poprawne przed sprintem

Fundament PWA okazał się solidny — poprzednie sprinty (128, 158B, 162, 181B) już go rzetelnie zbudowały i przetestowały:

- **Manifest** (`src/app/manifest.ts`): wszystkie wymagane pola (`name`, `short_name`, `description`, `id`, `start_url`, `scope`, `display`, `theme_color`, `background_color`), `orientation`, `lang: pl-PL`, ikony z `purpose: maskable`, 3 realne screenshoty.
- **Wymiary plików zweryfikowane bezpośrednio z bajtów PNG/ICO** (nie tylko deklaracje w manifeście): `icon-192.png` = 192×192, `icon-512.png` = 512×512, `icon-maskable-512.png` = 512×512, `apple-icon.png` = 180×180 (poprawny rozmiar Apple touch icon), `favicon.ico` zawiera realnie 4 rozdzielczości (16/32/48/256), `screenshots/*` = dokładnie zadeklarowane wymiary (390×844 ×2, 1280×800 ×1). Zero rozbieżności.
- **Service worker** (`public/sw.js`): cache'uje wyłącznie `offline.html` + jedną ikonę, nigdy alerty/admin/API; wersjonowanie cache (`alertownik-pwa-v2`) z czyszczeniem starych wersji przy `activate`; fail-closed fallback tylko dla nawigacji GET tego samego originu.
- **`/instalacja`**: instrukcje Android/iPhone/desktop, już potwierdzone realnym testem na fizycznym iPhone (Sprint 181B), uczciwie stwierdza brak obecności w sklepach.
- **Bezpieczeństwo danych**: brak prywatnego adresu/danych Adama w manifeście, layout, `/instalacja`, `/demo`, `offline.html` (zweryfikowane grepem).
- **Istniejące assety sklepowe** (odkryte podczas audytu, wcześniej nieudokumentowane w żadnym dzienniku Dnia): `assets/store/play-icon-512.png` (512×512, pełne tło) i `assets/store/feature-graphic-1024x500.png` (1024×500) — oba już wygenerowane w Sprincie 128 przez `scripts/generate-mobile-assets.mjs`, gotowe do wglądu i ewentualnego użycia, **nigdy nieserwowane przez aplikację**, opatrzone `assets/store/README.md` z jasnymi zasadami (brak logo instytucji, brak twierdzeń o oficjalnej afiliacji, wymagana wizualna akceptacja Adama przed jakimkolwiek publicznym użyciem).
- **Pełny `npm run test:pwa`**: 19/19 przed sprintem.

## 2. Co było rzeczywistym brakiem

Audyt **nie znalazł żadnego błędu funkcjonalnego**. Jedyny prawdziwy brak: manifest nie miał pola `categories` (opcjonalne, ale przydatne dla bogatszego UI instalacji przeglądarki i przyszłego pakowania TWA/Play Console, które odczytuje tę samą wartość jako podpowiedź kategorii).

Poza tym: brakuje **treści listingowych** (opis krótki/długi, dokładna lista brakujących formalności) — to nie jest błąd kodu, tylko naturalny, oczekiwany brak przed rozpoczęciem procesu sklepowego. Uzupełniony w części 7–9 poniżej.

## 3. Co wdrożono

- `src/app/manifest.ts` — dodane pole `categories: ["news", "utilities"]`.
- `tests/pwa/pwa.spec.ts` — 6 nowych testów (patrz §4).

Żadna inna zmiana kodu nie była uzasadniona audytem — zgodnie z zasadą „nie przebudowuj bez konkretnego problemu”.

## 4. Zmienione pliki

- `src/app/manifest.ts`
- `tests/pwa/pwa.spec.ts`
- `docs/SPRINT_186A_STORE_READINESS_V1.md` (ten dokument)

## 5. Wyniki testów

- **`npm run test:pwa`: 25/25** (19 istniejących + 6 nowych: uczciwy status „nie ma jeszcze w Google Play ani App Store”, obecność i niepustość `manifest.categories`, brak scrolla poziomego na `/instalacja` przy 375/390/414px, dostępność klawiaturowa `/instalacja`).
- `npm run check` — zielony (typecheck + lint + build).
- Pełny `npm run test:e2e` — wykonany po wdrożeniu, wynik w części Preview/Production poniżej.

## 6. Decyzja opakowania (Część C)

Zweryfikowano oficjalne wymagania na dzień **2026-08-02**:

- **Google Play — konta osobiste założone po 13.11.2023**: przed dopuszczeniem do produkcji wymagane jest **co najmniej 12 testerów opt-in nieprzerwanie przez 14 kolejnych dni** w teście zamkniętym (źródło: oficjalny artykuł pomocy Google Play Console, sekcja „Testing requirements for new personal developer accounts”, zweryfikowano 2026-08-02).
- **Apple App Store — wytyczna 4.2 (Minimum Functionality)**: aplikacja nie może być „repackaged website” / prostym opakowaniem treści webowej bez dodatkowej, natywnej wartości; wytyczne nie wspominają PWA wprost, ale język („particularly useful, unique, or app-like”) systemowo utrudnia akceptację prostego wrappera (zweryfikowano 2026-08-02, oficjalne App Store Review Guidelines).

### Porównanie

| Opcja | Nakład pracy | Konta/opłaty | Ryzyko odrzucenia | Aktualizacje | Powiadomienia | Testowanie przez mieszkańców |
|---|---|---|---|---|---|---|
| **1. Pozostać przy publicznej PWA** | Zero — już gotowe i przetestowane na realnym iPhone | Brak | Brak procesu review | Natychmiastowe (redeploy = aktualizacja dla wszystkich) | Brak (świadomie poza zakresem projektu) | Już możliwe dziś, dowolna liczba osób, zero barier |
| **2. Android przez TWA (Trusted Web Activity)** | Małe-średnie — istniejący PWA jako baza, dodać `assetlinks.json` + spakować (np. Bubblewrap) | **Konto Google Play Console (jednorazowa opłata) + podpisanie klucza przez Adama** | Niskie przy spełnieniu Digital Asset Links, ALE: **wymaga 12 testerów przez 14 dni ciągle — dokładnie ta sama przeszkoda co Gate 2 (Local Beta), który wciąż nie jest spełniony** | Nadal przez redeploy (TWA tylko opakowuje) | Możliwe technicznie w przyszłości (poza obecnym zakresem) | Wymaga formalnego opt-in przez Play Console — nie to samo co obecne osobiste zaproszenia |
| **3. Aplikacja natywna/hybrydowa (React Native/Flutter)** | Duże — osobny kod UI, osobny cykl wydań | Konta na obu platformach + opłaty | Średnie-wysokie (pełny review obu sklepów) | Wymaga wydania nowej wersji przez sklep (opóźnienie) | Pełne możliwości, ale poza obecnym zakresem projektu | Zależne od procesu beta obu platform |
| **4. iOS jako PWA vs przyszła aplikacja App Store** | PWA: zero (już działa, potwierdzone na realnym iPhone). App Store: duże | Apple Developer Program: **99 USD/rok** | Wysokie dla prostego web-wrappera pod wytyczną 4.2 | PWA: natychmiastowe. App Store: przez review | — | PWA: już możliwe. App Store: TestFlight, osobny proces |

### Rekomendowana kolejność

1. **Krótkoterminowo: pozostać wyłącznie przy publicznej PWA.** Zero dodatkowego nakładu, zero kont, zero opłat, już zweryfikowana instalacja na obu platformach. To jedyna opcja spójna z obecnym etapem projektu (Local Beta wciąż niezamknięta, Partner Demo dopiero się zaczyna).
2. **Android TWA jako naturalny następny krok — ale dopiero po realnym zamknięciu Gate 2.** Wymóg Google (12 testerów × 14 dni ciągle) to w praktyce to samo zadanie, które i tak trzeba wykonać dla Local Beta — nie warto rozpoczynać procesu Play Console, dopóki ten sam problem (rekrutacja testerów) nie zostanie rozwiązany niezależnie od sklepu.
3. **iOS App Store najdalej w kolejności.** Koszt (99 USD/rok), rygorystyczny review pod kątem „nie tylko opakowana strona”, a PWA na iPhone już działa i jest realnie przetestowana — brak pilnego uzasadnienia biznesowego na tym etapie.
4. **Aplikacja natywna/hybrydowa — nie rekomendowana obecnie.** Nieproporcjonalny nakład względem obecnej fazy pilotażu i już działającego PWA.

## 7. Pakiet listingowy (robocze teksty)

**Nazwa robocza:** Alertownik

**Krótki opis (74/80 znaków):**
> Lokalne alerty: drogi, woda, prąd, odpady i komunikaty dla Twojej okolicy.

**Dłuższy opis:**
> Alertownik to lokalny serwis alertów dla Komorowa, Pruszkowa i okolic (Gmina Michałowice, Miasto Pruszków, Powiat Pruszkowski). Zbiera w jednym miejscu komunikaty z oficjalnych źródeł — utrudnienia drogowe, przerwy w dostawie wody i prądu, zmiany w odbiorze odpadów, komunikaty gminne i informacje transportowe (WKD).
>
> Każdy alert pochodzi z oficjalnego źródła i jest ręcznie zatwierdzany przed publikacją. Alertownik ogranicza duplikaty i nieaktualne wpisy, dzięki czemu widzisz tylko to, co naprawdę ważne.
>
> To wczesny, niezależny pilotaż — wciąż rozwijany i testowany. Alertownik nie jest oficjalną aplikacją żadnej gminy, WKD, PGE ani innej instytucji i nie zastępuje numerów alarmowych.

**Główne kategorie i zastosowanie:** komunikaty lokalne / narzędzia (news / utilities) — drogi, transport, woda, prąd, odpady, komunikaty gminne.

**Obecny zakres pilotażu:** Gmina Michałowice, Miasto Pruszków, Powiat Pruszkowski — 6 miejscowości (Komorów, Nowa Wieś, Granica, Michałowice, Reguły, Pruszków).

**Status:** niezależny, wczesny pilotaż — nie jest oficjalną aplikacją żadnej gminy, WKD, PGE ani innej instytucji.

## 8. Lista assetów

### Screenshoty
| Plik | Status |
|---|---|
| `public/screenshots/home-narrow.png` (390×844) | ✅ istnieje, realne, użyte w manifeście |
| `public/screenshots/alerty-narrow.png` (390×844) | ✅ istnieje, realne, użyte w manifeście i `/demo` |
| `public/screenshots/home-wide.png` (1280×800) | ✅ istnieje, realne, użyte w manifeście |
| Dodatkowe screenshoty (np. `/odpady`, `/demo`, tryb ciemny) | ⬜ brak — opcjonalne rozszerzenie na przyszłość, nie blokuje niczego dziś |

### Ikony
| Plik | Rozmiar | Status |
|---|---|---|
| `public/icon-192.png` | 192×192 | ✅ zweryfikowane |
| `public/icon-512.png` | 512×512 | ✅ zweryfikowane |
| `public/icon-maskable-512.png` | 512×512 (pełne tło) | ✅ zweryfikowane |
| `public/icon.svg` | wektor | ✅ istnieje |
| `src/app/favicon.ico` | 16/32/48/256 (multi-res) | ✅ zweryfikowane |
| `src/app/apple-icon.png` | 180×180 | ✅ zweryfikowane |
| `assets/store/play-icon-512.png` | 512×512 | ✅ istnieje (Sprint 128), nieserwowane, do wglądu przed użyciem |
| `assets/store/feature-graphic-1024x500.png` | 1024×500 | ✅ istnieje (Sprint 128), nieserwowane, do wglądu przed użyciem |

## 9. Publiczne adresy

- Strona: `https://alertownik-mvp.vercel.app/`
- Polityka prywatności: `https://alertownik-mvp.vercel.app/prywatnosc` (istnieje)
- Zasady korzystania: `https://alertownik-mvp.vercel.app/zasady` (istnieje)
- Publiczny kontakt: `alertownik.kontakt@gmail.com`

## 10. Braki prawne/produktowe (bez porady prawnej)

To nie jest porada prawna — wyłącznie lista rzeczy do sprawdzenia z prawnikiem lub samodzielnie przed faktycznym złożeniem aplikacji:

- Regulamin (`/zasady`) i polityka prywatności (`/prywatnosc`) są oznaczone jako „szkice beta” — przed prawdziwym listingiem sklepowym warto rozważyć, czy wymagają finalnej wersji.
- Brak zarejestrowanego podmiotu/nazwy wydawcy w formie wymaganej przez formularze Google Play/App Store (dane wydawcy to decyzja Adama, nie coś do wypełnienia automatycznie).
- Google Play i Apple mają własne, zmieniające się wymagania dot. deklaracji o przetwarzaniu danych (Data Safety / Privacy Nutrition Labels) — będą wymagały osobnego wypełnienia w konsoli, niezależnie od istniejącej polityki prywatności.

## 11. Czynności wymagające później udziału Adama

- Ostateczny wybór kolejności Android/iOS (rekomendacja w §6, decyzja należy do Adama).
- Założenie konta Google Play Console i/lub Apple Developer Program.
- Opłaty (jednorazowa Google, roczna Apple).
- Zaakceptowanie regulaminów obu platform.
- Dane wydawcy (nazwa, adres, dane kontaktowe do formularzy sklepowych).
- Finalne wysłanie aplikacji do weryfikacji.
- Wizualna akceptacja assetów w `assets/store/` przed jakimkolwiek publicznym użyciem (zgodnie z zasadą w `assets/store/README.md`).

## 12. Rekomendowana kolejność dalszych działań

1. Kontynuować i domknąć Gate 2 (Local Beta — realna rekrutacja testerów) — to jednocześnie fundament pod przyszły wymóg Google (12 testerów/14 dni).
2. Kontynuować Partner Demo / outreach (Gate 3).
3. Dopiero po realnym postępie w (1) — rozważyć rozpoczęcie procesu Android TWA, zaczynając od założenia konta przez Adama (poza zakresem automatyzacji).
4. iOS App Store — odłożone, PWA na iPhone pozostaje główną ścieżką.
