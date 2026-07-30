# Blok A+D — Uproszczenie testów Local Beta + maksymalna gotowość Androida bez konta sklepowego

**Data:** 2026-07-30
**Status:** implementacja wykonana, wdrożona na Production. Android TWA
scaffold przygotowany do punktu wymagającego decyzji Adama (package name),
zatrzymany dokładnie tam, żaden klucz nie został wygenerowany, żadne konto
nie zostało założone.

---

## 1. Droga testera przed i po

**Przed:**
1. Adam wysyła link do `/instalacja`.
2. Tester widzi ogólny nagłówek "Zainstaluj Alertownik" + jeden akapit (bez
   informacji, że to test).
3. 3 sekcje instalacji (Android/iPhone/komputer).
4. Koniec strony — brak wskazówki co sprawdzić, brak jednoklikowego
   sposobu odesłania opinii. Tester musiałby sam wymyślić, co napisać i do
   kogo, albo Adam musiałby to wyjaśnić osobno w wiadomości.

**Po:**
1. Adam wysyła ten sam link do `/instalacja`.
2. Tester od razu widzi krótką plakietkę „Test wczesnej wersji — 5 minut” i
   jednozdaniowe wyjaśnienie z zapowiedzią kroku 4 (opinia = 1-2 zdania).
3. Instalacja (bez zmian w krokach — już były minimalne).
4. Nowa sekcja „Co sprawdzić (5 minut)” — dokładnie 4 konkretne rzeczy.
5. Nowa sekcja „Wyślij opinię” — jeden przycisk, gotowy e-mail z tematem i
   trzema pytaniami, jedno kliknięcie.

Efekt: ten sam link, zero dodatkowych stron do otwierania, droga testera
skrócona z "zainstaluj i zgadnij co dalej" do "zainstaluj → sprawdź 4 rzeczy
→ kliknij Wyślij opinię".

---

## 2. Co dokładnie uproszczono

- Nagłówek: dodana krótka plakietka „Test wczesnej wersji — 5 minut”
  (natychmiast widoczna, bez przewijania).
- Wstępny akapit: przeredagowany na jedno zdanie akcji (dodaj → sprawdź →
  odeślij) zamiast opisu technicznego; szczegół techniczny („Alertownik
  działa w przeglądarce…”) przeniesiony do rozwijanego elementu
  `<details>` — **poza jednym zdaniem** wymaganym przez istniejący test
  uczciwości (`Alertownika nie ma jeszcze w Google Play ani App Store”),
  które zostało celowo pozostawione widoczne, nie schowane.
- Nowa sekcja „Co sprawdzić” — dokładnie 4 pozycje, zero więcej.
- Nowa sekcja „Wyślij opinię” — jeden przycisk `min-h-[44px]`, mailto z
  gotowym tematem i szablonem 3 pytań, prośba o „jedno lub dwa zdania”.
- Nic nie usunięto z istniejących 3 sekcji instalacji (Android/iPhone/
  komputer) — audyt (§3 poniżej) nie znalazł w nich zbędnych kroków.

---

## 3. Czy powstała `/testuj`, czy wykorzystano `/instalacja` — i dlaczego

**Wykorzystano istniejącą `/instalacja`.** Zgodnie z preferowaną ścieżką z
briefu: to już jest strona, którą Adam wysyła nowym testerom, ma już
poprawne, zweryfikowane instrukcje instalacji (potwierdzone realnym testem
iPhone, Sprint 181B) i jest linkowana z stopki. Utworzenie osobnej `/testuj`
oznaczałoby albo duplikowanie tych samych instrukcji instalacji (dwa
miejsca do utrzymania), albo dodanie dla testera kolejnego kliknięcia
między „zainstaluj” a „sprawdź/odeślij opinię” — dokładnie odwrotność celu
tego bloku (skrócenie drogi, nie wydłużenie). Dopisanie checklisty i
przycisku opinii bezpośrednio na `/instalacja` daje krótszą ścieżkę niż
jakikolwiek wariant z dwiema stronami.

---

## 4. Dostępność i prostota — zweryfikowane

- **390×844 (i 375/390/414 istniejące testy):** brak poziomego scrolla —
  potwierdzone przez istniejące, niezmienione testy `test:pwa` (wciąż
  zielone po zmianie).
- **Elementy dotykowe:** przycisk „Wyślij opinię” ma `min-h-[44px]`, tak
  jak istniejący `InstallAppButton`.
- **Kolejność klawiatury/focusu:** nic nie zmieniono w istniejącej
  kolejności linków/przycisków — nowe sekcje idą naturalnie po istniejących
  w DOM, więc kolejność Tab pozostaje logiczna (potwierdzone testem
  „/instalacja links are reachable via keyboard”).
- **Kontrast:** nowe elementy reużywają dokładnie te same klasy Tailwind
  (`sectionClass`, `h2Class`, `listClass`, kolory `blue-600`/`slate-500`)
  co reszta strony — żaden nowy kolor nie został wprowadzony.
- **Prosty język:** checklisty i przyciski w krótkich, konkretnych zdaniach
  po polsku, bez żargonu.
- **Brak duplikacji:** informacja „nie ma jeszcze w Google Play/App Store”
  występuje dokładnie raz (przeniesiona do jednego zdania w głównym
  akapicie, nie powtórzona w `<details>`).
- **Brak długiego bloku tekstu przed działaniem:** plakietka + jedno zdanie
  + przycisk instalacji, zanim pojawi się jakikolwiek dłuższy tekst.
- **Informacje prawne/niezależność projektu:** nietknięte — ta strona
  nigdy ich nie zawierała (żyją na `/about`, `/prywatnosc`, `/zasady`,
  stopce), więc nic nie zostało usunięte ani ukryte.

---

## 5. Etap D — Android TWA: stan repozytorium (sprawdzony osobiście, nie zakładany)

| Element | Stan przed blokiem | Stan po bloku |
|---|---|---|
| Projekt/opakowanie TWA | ❌ nie istniał (`find` po całym repo — zero wyników) | Nadal nie istnieje jako zbudowany projekt — tylko konfiguracja-szablon (poniżej) |
| Konfiguracja Bubblewrap | ❌ brak | ✅ `android-twa/twa-manifest.example.json` — szablon, nie prawdziwy output Bubblewrap |
| `assetlinks.json` | ❌ brak, `public/.well-known/` nie istniał | Nadal brak — **celowo nieprzygotowany**, bo wymaga prawdziwego odcisku SHA-256 klucza, którego jeszcze nie ma |
| Package name (`packageId`) | ❌ nie wybrany | Nadal nie wybrany — **decyzja Adama**, oznaczona jawnym placeholderem w szablonie |
| Ikony/screenshoty dla Androida | ✅ już gotowe (`public/icon-512.png`, `icon-maskable-512.png`) | Bez zmian — potwierdzone ponownie jako poprawne |
| Build możliwy lokalnie bez konta | Sprawdzone: JDK 16 obecny (Bubblewrap zaleca 17+), Android SDK nieobecny (`ANDROID_HOME`/`ANDROID_SDK_ROOT` puste) | Wciąż brakuje SDK/JDK 17+ w tym środowisku — udokumentowane, nie zainstalowane automatycznie |
| Klucz podpisujący | ❌ nie istnieje | **Nadal nie istnieje — świadomie zatrzymane.** Zweryfikowano bezpośrednio w dokumentacji Bubblewrap: `bubblewrap init` (nie tylko `build`) generuje prawdziwy keystore, więc samo uruchomienie init byłoby już nieodwracalnym krokiem powiązanym z jeszcze niewybranym `packageId` |

**Co wykonano:** `android-twa/twa-manifest.example.json` (wszystkie pola
skopiowane 1:1 z żywego, zweryfikowanego `src/app/manifest.ts` — nazwa,
kolory, start_url, ikony — potwierdzone testem `androidTwaScaffold.spec.ts`
pilnującym zgodności z manifestem) + `android-twa/README.md` z dokładnym
uzasadnieniem, dlaczego proces zatrzymuje się właśnie tu, oraz z listą
kroków 1–6 do wykonania w przyszłej sesji.

**Czego brakuje:** package name (decyzja Adama — patrz blok decyzji
poniżej), JDK 17+/Android SDK w środowisku wykonawczym, klucz podpisujący
(generowany automatycznie przez Bubblewrap dopiero po wyborze package
name), `assetlinks.json` (wymaga odcisku z jeszcze nieistniejącego klucza).

**Co wymaga działania Adama:**
1. **Wybór `packageId`** (np. `pl.alertownik.app`) — jedyna rzecz
   blokująca dalszy postęp tego scaffoldu. Nieodwracalna po pierwszym
   przesłaniu do Google Play.
2. Potwierdzenie chęci kontynuacji (uruchomienie `bubblewrap init`
   wygeneruje prawdziwy klucz podpisujący — Adam powinien być świadomy, że
   to już nie jest odwracalny krok planistyczny).
3. Później: założenie konta Google Play Console (25 USD, jednorazowo —
   patrz `docs/EXEC_BLOCK_ACCELERATE_ABCD_V1.md` §2.6) i 12 testerów/14 dni.

**Co wymaga konta lub klucza:** wszystko od kroku 3 instrukcji w
`android-twa/README.md` wzwyż (uruchomienie `bubblewrap init`,
`assetlinks.json`, konto Play Console, zgłoszenie) — nic z tego nie
zostało wykonane w tym bloku.

---

## 6. Etap C

Nie utworzono żadnego nowego dokumentu monetyzacyjnego w tym bloku. Etap C
pozostaje na **0%, nierozpoczęty** — zgodnie z briefem, przygotowanie
materiałów w poprzednim bloku nie podnosi tego procentu; wymaga
prawdziwego testu rynku zatwierdzonego przez Adama.

---

## 7. Zmienione pliki

- `src/app/instalacja/page.tsx` — plakietka testu, checklista, sekcja
  opinii, szczegół techniczny przeniesiony do `<details>`.
- `src/lib/feedbackMailto.ts` — nowy `buildTesterFeedbackMailto()`.
- `tests/pwa/pwa.spec.ts` — 3 nowe testy (plakietka, checklista ≤4 pozycji,
  przycisk opinii).
- `tests/e2e/feedbackMailto.spec.ts` — 2 nowe testy dla
  `buildTesterFeedbackMailto`.
- `android-twa/twa-manifest.example.json` — nowy szablon konfiguracji TWA.
- `android-twa/README.md` — nowy, dokładna instrukcja i uzasadnienie
  zatrzymania.
- `tests/e2e/androidTwaScaffold.spec.ts` — nowy, pilnuje że scaffold
  pozostaje bezpieczny (placeholder packageId, brak klucza, niepodłączony
  do aplikacji).

Żaden plik SQL, RLS, `.env.local`, allowlisty writera/auto-publish, ani
konfiguracji Vercel/Supabase nie został dotknięty.

---

## 8. Wyniki testów (Green Gate)

- `npm run check` (typecheck + lint + build): **PASS**, zero błędów, zero
  nowych ostrzeżeń.
- `npm run test:pwa`: **28/28 PASS** (25 istniejących + 3 nowe).
- `npm run test:e2e` (pełny): **1746/1746 PASS** (0 failed), w tym nowy
  `androidTwaScaffold.spec.ts` (4/4) i rozszerzony `feedbackMailto.spec.ts`
  (6/6).
- Security/allowlist audit: brak sekretów/tokenów/kluczy w diffie (grep
  czysty, w tym dedykowany test pilnujący braku materiału klucza w
  `android-twa/`); żadna allowlist writera/auto-publish niedotknięta.

---

## 9. Wdrożenie

Branch `block-ad-tester-rescue-android-twa-v1` → commit → push → Preview →
smoke test Preview → fast-forward merge do `main` → push `main` →
Production deployment → smoke test Production. Szczegóły w raporcie
końcowym czatu.

Potwierdzenie zerowych zapisów: żadna operacja Supabase w tym bloku poza
`SELECT`. Oba endpointy cron pozostają 503 przed i po tym bloku.

---

## 10. Kanoniczny status A–F po tym bloku

| Etap | Status |
|---|---|
| A (techniczny) | 100% — plus ten blok: droga testera skrócona |
| A (walidacja) | 1/3–5 (20%) — niezmienione, wymaga realnych odpowiedzi |
| B | w toku (wysłano 2026-07-30, brak odpowiedzi) |
| C | 0%, nierozpoczęty |
| D | ~35% + Android TWA scaffold przygotowany do punktu decyzji Adama (packageId) — nie podnosi formalnego %, bo żaden sub-cel D1 nie został ukończony, ale skraca przyszłą pracę techniczną |
| E | zakończony |
| F | 8 fal, 16/16 województw, 13/16 z aktywnym źródłem, świadomie wstrzymane |
