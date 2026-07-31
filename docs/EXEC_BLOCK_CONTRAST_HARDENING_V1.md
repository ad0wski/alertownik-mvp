# Blok Contrast Hardening + Manual Accessibility Handoff (Etap A + D)

**Data:** 2026-07-31 (kontynuacja bloku Accessibility & Legal Readiness).
**Status:** audyt kontrastów zakończony, wszystkie znalezione naruszenia
naprawione tokenowo (bez przebudowy design systemu), testy dodane, dwa
dokumenty ręcznego handoffu przygotowane (VoiceOver + TalkBack).

To nie jest certyfikat dostępności ani opinia prawna. Sekcja prawna
(część 4) wyłącznie przytacza wcześniej ustaloną klasyfikację —
nie wprowadza nowego audytu.

---

## 1. Pełna lista sprawdzonych miejsc

Systematyczne wyszukanie w całym `src/` (grep, nie próbkowanie):
`text-slate-400`, `text-slate-500`, `dark:text-slate-500`,
`placeholder-slate-400`/`placeholder:text-slate-400` (i warianty
`dark:`), `text-slate-300` (poza wariantem `dark:`), `opacity-*` na
tekście, stany `disabled:`, `hover:`, `focus:`, `active:`, badge'e na
kolorowych tłach (`amber-*`, `blue-*`, `red-*`, `emerald-*` w parach
600/700 na 50/500-15), dolna nawigacja (`BottomNav.tsx`), nagłówek
(`AppHeader.tsx`, w tym plakietka „Admin" i `EnvironmentBadge`),
metadane alertów (`AlertCard.tsx`, `AlertDetailClient.tsx`), etykiety i
komunikaty formularzy (`PreferencesSection.tsx`, `AreaPreferenceBar.tsx`,
`login/page.tsx`, `builder/page.tsx`, `admin/*`), stan pusty/błąd/status
(`AlertList.tsx`, `WasteScheduleSection.tsx`, `SourceHealthDashboard.tsx`
i inne panele admina).

Znaleziono i zweryfikowano rzeczywisty kontrast względem **faktycznego
renderowanego tła** (nie tylko nazwy klasy) dla każdej unikalnej pary
kolor/tło — patrz część 2.

## 2. Wyniki kontrastu przed/po

### Naruszenie systemowe — odwrócona polaryzacja „tekstu wyciszonego"

**Ustalenie:** ~33 pliki używały pary `text-slate-400
dark:text-slate-500` (jasny motyw = jasnoszary na białym tle, ciemny
motyw = średnioszary na ciemnym tle) — dokładnie odwrotnie niż
poprawny, już istniejący w tej samej bazie kodu wzorzec `text-slate-500
dark:text-slate-400`.

| Element (przykład) | Tło | Kolor przed | Kontrast przed | Kolor po | Kontrast po |
|---|---|---|---|---|---|
| Data/miejsce alertu, etykiety „Kiedy/Gdzie/Źródło", stopka, tagline nagłówka, etykiety pól, komunikaty pomocnicze (jasny motyw) | Biała karta `#ffffff` | `slate-400` `#94a3b8` | **2.70:1** ❌ (próg AA: 4.5:1) | `slate-500` `#64748b` | **4.77:1** ✅ |
| Te same elementy (ciemny motyw) | Ciemna karta `slate-900` `#0f172a` | `slate-500` `#64748b` | **3.75:1** ❌ | `slate-400` `#94a3b8` | **6.63:1** ✅ |
| Placeholdery pól formularzy (login, builder, admin/sources, admin/waste, AlertList, AreaPreferenceBar, PreferencesSection, admin/new-alert) — jasny motyw | Białe pole | `slate-400` | 2.70:1 (WCAG nie wymaga tego dla placeholderów, ale ta sama naprawa zastosowana dla spójności) | `slate-500` | 4.77:1 |
| Tagline nagłówka „Lokalne alerty w jednym miejscu" (nieprzylegająca para, znaleziona osobno) | Biała/ciemna belka nagłówka | `slate-400`/`dark:slate-500` | 2.70:1 / 3.75:1 | `slate-500`/`dark:slate-400` | 4.77:1 / 6.63:1 |
| Przycisk zamknięcia baneru aktualizacji PWA („✕", `PwaController.tsx`) | Biała/ciemna belka | `slate-400`/`dark:slate-500` (stan spoczynkowy) | 2.70:1 / 3.75:1 | `slate-500`/`dark:slate-400` | 4.77:1 / 6.63:1 |

### Naruszenie lokalne — plakietka „Admin" w nagłówku

| Element | Tło | Kolor przed | Kontrast przed | Kolor po | Kontrast po |
|---|---|---|---|---|---|
| Plakietka „Admin" (`AppHeader.tsx`, widoczna wyłącznie zalogowanemu adminowi) | `amber-50` (jasny motyw) | `amber-600` `#d97706` | **3.19:1** ❌ (tekst `text-xs`, wymaga 4.5:1) | `amber-700` `#b45309` | **5.02:1** ✅ |

### Sprawdzone i już poprawne (bez zmian)

| Wzorzec | Przykładowy kontrast | Wynik |
|---|---|---|
| `text-slate-700 dark:text-slate-300` (liczniki, przyciski akcji) | 7.58:1 (jasny) / 12.04:1 (ciemny) | ✅ bez zmian |
| `text-slate-600 dark:text-slate-400` (kategorie, nieaktywne przyciski) | 7.58:1 / 6.63:1 | ✅ bez zmian |
| Badge'e 700/50 i 300/(kolor-500/15) (`amber`, `blue`, `red`, `emerald` — statusy, ostrzeżenia, powodzenie) | 4.83–6.71:1 (jasny), >7:1 (ciemny) | ✅ bez zmian, wzorzec już bezpieczny |
| Kropki-separatory dekoracyjne (`•`, `·`) | n/d — element dekoracyjny | ✅ jeden brakujący `aria-hidden` dodany (`AlertDetailClient.tsx`), reszta już oznaczona |
| Stany `disabled:opacity-*` na przyciskach | n/d | ✅ WCAG 1.4.3 wprost zwalnia nieaktywne komponenty z wymogu kontrastu — bez zmian |
| Stany `hover:`/`focus:` | zawsze ciemniejsze/jaśniejsze niż stan spoczynkowy | ✅ kontrast tylko rośnie, bez zmian |
| Stany `active:` | brak w kodzie | ➖ nie dotyczy — zero użyć w całym `src/` |

**Metoda:** ręczne obliczenie względnej luminancji WCAG (wzór
`0.2126R + 0.7152G + 0.0722B` na wartościach zlinearyzowanych z sRGB) i
współczynnika kontrastu `(L1+0.05)/(L2+0.05)` dla każdej rzeczywistej
pary kolor/tło, zweryfikowane następnie automatycznym testem
odczytującym prawdziwy `getComputedStyle` w przeglądarce (część 3
poniżej) — nie tylko obliczenia na papierze.

## 3. Wszystkie zmienione pliki

**Poprawki kontrastu (33 pliki, czysto tokenowa zamiana kolejności klas,
zero zmian struktury/odstępów):**

`src/app/about/page.tsx`, `admin/new-alert/page.tsx`, `admin/page.tsx`,
`admin/queue/page.tsx`, `admin/sources/page.tsx`, `admin/waste/page.tsx`,
`ai-helper/page.tsx`, `alerty/page.tsx`, `builder/page.tsx`,
`instalacja/page.tsx`, `login/page.tsx`, `partnerzy/page.tsx`,
`src/components/AlertCard.tsx`, `AlertDetailClient.tsx`, `AlertList.tsx`,
`AppFooter.tsx`, `AppHeader.tsx`, `AreaPreferenceBar.tsx`, `AuthGate.tsx`,
`AutomationStatusPanel.tsx`, `BetaStatusCard.tsx`, `CandidateCard.tsx`,
`LinkHealthPanel.tsx`, `NextCollectionCard.tsx`, `OdpadyClient.tsx`,
`OfficialSourceChecklist.tsx`, `PreferencesSection.tsx`,
`PwaController.tsx`, `ScheduledWriterMonitoring.tsx`,
`SourceApiCheckPanel.tsx`, `SourceHealthDashboard.tsx`, `TodayView.tsx`,
`WasteScheduleSection.tsx`.

**Testy:**

- `tests/e2e/public.spec.ts` — nowy blok `test.describe("Contrast
  Hardening — muted text meets WCAG AA against its real background")`
  (4 testy: karta alertu, stopka, etykieta wyboru kategorii, widoczność
  pierścienia fokusu) + pomocnicze funkcje `relativeLuminance`,
  `contrastRatio`, `getFgBgRgb` (rzeczywisty odczyt renderowanego koloru
  przez normalizację canvas — Chromium serializuje kolory tego projektu
  z `oklch()` Tailwind v4 jako `lab(...)`, nie `rgb(...)`, więc
  bezpośrednie parsowanie tekstu koloru by zawiodło).

**Nowe dokumenty:**

- `docs/EXEC_BLOCK_CONTRAST_HARDENING_V1.md` (ten dokument).
- `docs/SPRINT_CONTRAST_HARDENING_MANUAL_VOICEOVER_HANDOFF_V1.md` —
  instrukcja ręcznego testu VoiceOver dla Adama.
- `docs/TALKBACK_ANDROID_TESTER_CHECKLIST_V1.md` — checklista TalkBack
  dla przyszłego testera Android.

Żaden plik SQL, RLS, `.env.local`, allowlisty writera/auto-publish, ani
konfiguracji Vercel/Supabase nie został dotknięty.

## 4. Wyniki testów

- `npm run check` (typecheck + lint + build): **PASS**, zero błędów,
  zero nowych ostrzeżeń.
- `npm run test:pwa`: **28/28 PASS**.
- `npm run test:e2e` (pełny): **1751/1752 PASS**, 1 pominięty (brak
  opublikowanego alertu w tym środowisku deweloperskim — analogiczny,
  zaakceptowany wzorzec pomijania już stosowany w innych testach tego
  pliku), **0 niepowodzeń**.
- **Test wcześniej uznany za flaky (`auth-guards.spec.ts`, „/builder —
  shows login prompt”) uruchomiony ponownie w pełnym przebiegu: przeszedł
  czysto, bez powtórnego niepowodzenia.** Zgodnie z instrukcją tego
  bloku — nie zawiódł ponownie, więc nie ma podstawy do potraktowania go
  jako regresji; nie ukryto żadnego niepowodzenia pod etykietą „flaky"
  bez sprawdzenia.
- Podczas budowy testów kontrastowych wykryto i naprawiono rzeczywisty
  błąd w samym teście (nie w aplikacji): normalizacja koloru przez
  canvas wymaga `clearRect` przed każdym odczytem — malowanie w pełni
  przezroczystym kolorem nie czyści poprzednio narysowanego piksela
  (kompozycja `source-over`), co bez poprawki dawało fałszywie identyczne
  wartości tła i tekstu. Poprawione i zweryfikowane przed uznaniem
  testów za wiarygodne.
- Security/allowlist audit: brak sekretów w diffie (`git diff` czysty
  przez grep); żadna allowlist writera/auto-publish niedotknięta; brak
  zmian SQL/RLS/env.

## 5. Status Preview i Production

(Uzupełnione po wdrożeniu — patrz commit i smoke test w raporcie
końcowym czatu.)

## 6. Instrukcja ręcznego testu iPhone VoiceOver

Pełna, gotowa do wykonania instrukcja:
`docs/SPRINT_CONTRAST_HARDENING_MANUAL_VOICEOVER_HANDOFF_V1.md`.
Obejmuje: gdzie włączyć VoiceOver, jakich gestów używać, 8 konkretnych
elementów Alertownika do sprawdzenia (w tym link „Pomiń nawigację" i
ogłoszenie zapisu „Moja okolica" — oba naprawione w poprzednim bloku),
kryteria PASS dla każdego punktu, plus osobne sekcje o większym
tekście/pogrubieniu, obsłudze jedną ręką i trybie offline.
**Nieprzetestowane przez Claude — czeka na Adama.**

## 7. Checklista TalkBack dla przyszłego testera Android

Pełna checklista: `docs/TALKBACK_ANDROID_TESTER_CHECKLIST_V1.md`. Lustro
tych samych 8 punktów co VoiceOver (ta sama semantyka HTML/ARIA, ten sam
oczekiwany wynik) plus 2 punkty specyficzne dla Androida (natywny
`<select>` kategorii, kolizje gestów systemowych Chrome/Android).
**Nieprzetestowane — brak testera Android w tej sesji.**

## 8. Otwarte kwestie prawne (bez nowego audytu — powtórzenie ustalonej klasyfikacji)

Sześć pozycji wymagających realnej konsultacji prawnej (ustalone w
`docs/EXEC_BLOCK_ACCESSIBILITY_LEGAL_READINESS_V1.md` §7D, niezmienione
w tym bloku — brak nowego konkretnego odkrycia uzasadniającego zmianę):

1. Czy „administrator = osoba fizyczna, imię i nazwisko" w pełni
   spełnia wymogi Art. 13 RODO dla serwisu tej skali.
2. Dokładny zakres relacji umownej Vercel Hobby / Supabase wobec
   transferu danych poza EOG.
3. Czy PWA/TWA „opakowujący" istniejącą stronę spełnia Apple Guideline
   4.2 w praktyce (zależy od decyzji recenzenta, nie analizy tekstu).
4. Odpowiedzialność za treści alertów cytowane od stron trzecich (WKD,
   PGE, gminy) w przypadku błędu źródła.
5. Ryzyka przyszłego wykorzystania przez gminy/podmioty publiczne (B2G)
   — zamówienia publiczne, umowy administracyjne.
6. Wymogi ustawy o dostępności cyfrowej (WCAG 2.1 AA), jeśli serwis
   kiedykolwiek stanie się częścią oferty podmiotu publicznego —
   praktyczny audyt WCAG wykonano w tym i poprzednim bloku, ale formalna
   zgodność prawna z ustawą wymaga oceny prawnika.

**Dokumenty, które są obecnie wyłącznie szkicami:** `/prywatnosc` i
`/zasady` — oba jawnie oznaczone na stronie jako „Wersja beta (szkic)",
z widoczną notatką „Status tego dokumentu" zapowiadającą weryfikację
przed szerszym startem publicznym lub publikacją w sklepie.

**Czego absolutnie nie wolno jeszcze nazywać „prawnie zatwierdzonym":**
żadna z powyższych sześciu pozycji ani treść `/prywatnosc`/`/zasady` w
obecnej formie. Ten blok (jak poprzedni) nie zmienia tego statusu —
wyłącznie naprawia dostępność techniczną, nie treść ani status prawny
dokumentów.

## 9. Status każdego Etapu A–F po tym bloku

| Etap | Status |
|---|---|
| A (techniczny) | 100% + ten blok: systemowa naprawa kontrastu w 33 plikach, zero regresji, testy kontrastowe dodane |
| A (walidacja) | 1/3–5 (20%) — bez zmian, zależne od realnych testerów |
| B | w toku — bez zmian |
| C | 0%, świadomie nierozpoczęty |
| D | ~35% — bez zmian formalnych; dostępność (istotna dla ustawy o dostępności cyfrowej, gdyby dotyczyło B2G) jest teraz mocniejsza, ale to nie jest formalne kryterium Etapu D |
| E | zakończony, bez zmian |
| F | 8 fal, bez zmian w tym bloku |

## 10. Szacunkowa liczba pozostałych dużych bloków technicznych

Bez zmian względem poprzedniego bloku — nic w tym bloku nie skróciło
ani nie wydłużyło ścieżki do zamkniętego testu Google Play:

- **Do wersji gotowej do zamkniętego testu Google Play (start D1):**
  ~1 blok techniczny (dokończenie `android-twa/` do realnego
  `bubblewrap init` **po** wyborze `packageId` przez Adama) — reszta to
  konto i formularze Adama w konsoli, nie kod.
- **Do publikacji w Google Play:** powyższy blok + 14 dni kalendarzowych
  testerów (nie blok pracy) + 1 blok na ewentualne poprawki po review.
- **Do pełnego planu z monetyzacją:** nieokreślone, zależne od Etapu
  B/C i decyzji Adama, nie od pracy technicznej Claude'a.

## 11. Rekomendowany następny blok (niezaczęty)

**Rekomendacja: Etap A (dalsza walidacja użytkowników) lub Etap B
(oczekiwanie/follow-up na `sekretariat@michalowice.pl`)** — oba są
zewnętrznymi strumieniami zależnymi od ludzi, nie bloków technicznych.
Kontrast i dostępność techniczna są teraz w bardzo dobrym stanie;
kolejny sensowny blok techniczny (jeśli Adam wybierze pracę techniczną
zamiast czekania na ludzi) to dokończenie scaffoldu Android TWA do
punktu wymagającego `packageId` — ale wymaga to najpierw decyzji Adama
o wyborze nazwy pakietu. **Nic z powyższego nie rozpoczęto w tym
bloku — czeka na decyzję Adama.**
