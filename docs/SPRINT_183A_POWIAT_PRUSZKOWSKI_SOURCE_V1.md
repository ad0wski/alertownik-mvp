# Sprint 183A — Nowe oficjalne źródło: Powiat Pruszkowski (Wiadomości)

Status: **wdrożone na Production, aktywowane tylko dla ręcznego/dry-run checku. Nieaktywowane do harmonogramu zapisującego dane ani auto-publikacji.**

Data: 2026-07-29 (Dzień 15).

---

## 1. Audyt źródła — wynik

**Adres:** `https://samorzad.gov.pl/web/powiat-pruszkowski/wiadomosci`

| Kryterium | Wynik |
|---|---|
| Mechanizm | Brak REST/RSS/JSON — deterministyczny HTML (Liferay, portal gov.pl) |
| HTTP | 200, brak przekierowań, brak sygnałów Cloudflare/anti-bot |
| `robots.txt` | Przekierowuje na stronę główną (brak realnego disallow) |
| Permalinki | Bezpośrednie, względne (`/web/powiat-pruszkowski/SLUG`), rozwiązywalne do bezpiecznego absolutnego URL |
| Długość treści na liście | **Zróżnicowana** — pozycje promocyjne/wydarzeniowe mają zajawkę (`intro`, 100–1200 znaków); prawdziwe komunikaty drogowe mają **wyłącznie tytuł** (49–70 znaków), bez zajawki |
| Data publikacji | **Brak pola strukturalnego** (ani na liście, ani na stronie artykułu) — daty pojawiają się wyłącznie w treści komunikatu (np. „od 20 lipca do ok. 30 sierpnia 2026 r.”), wykrywane heurystyką `detectDateInText`, tak jak w innych źródłach tego projektu |
| Kategorie wykrywalne wiarygodnie | Utrudnienia drogowe/zamknięcia/remonty/objazdy — **tak**, wąskim filtrem tematycznym. Pozostała treść (PR, wydarzenia, strategia, ostrzeżenia pogodowe) — świadomie odrzucana |
| Ryzyko zmiany HTML | Średnie — nowy szablon, brak REST fallbacku; przy zmianie struktury check bezpiecznie zwróci zero propozycji (nie wyjątek) |
| Przewidywana liczba requestów/check | 1 (lista) + do 3 (artykuły, tylko dla krótkich pozycji po filtrze tematycznym) = **maks. 4** |

**Przykładowe prawdziwe artykuły znalezione na żywo (2026-07-29):**
- „Utrudnienia w ruchu - rozbudowa ul. Piłsudskiego w Piastowie” — bez zajawki, realna treść na stronie artykułu (zamknięcie ulicy, objazd, daty 20 lipca – 30 sierpnia 2026)
- „Uwaga kierowcy! Czasowe zamknięcia dróg powiatowych - Miasto Pruszków” — bez zajawki
- „Ostrzezenie hydrologiczne Wojewodztwo mazowieckie” — **poza zakresem aplikacji** (pogoda/region, nie gmina) — poprawnie odrzucane filtrem tematycznym
- 6 innych pozycji w próbce: PR/wydarzenia/strategia — poprawnie odrzucane

### Decyzja: **GO**

Uzasadnienie zgodnie z warunkami z briefu:
- Źródło oficjalne (portal gov.pl, jednostka samorządu terytorialnego) ✅
- Dane publiczne, bez logowania ✅
- Permalinki bezpośrednie ✅
- Parser deterministyczny (stały szablon Liferay, potwierdzony na żywo) ✅
- Brak obchodzenia zabezpieczeń (brak WAF/CAPTCHA, zwykły `fetch`) ✅
- Ruch sieciowy ograniczony (maks. 4 requesty/check, twardy limit) ✅
- Błędy fail-closed (błąd/timeout/niejednoznaczność → pomiń pozycję, nigdy zgadywanie) ✅
- Filtr tematyczny wyklucza masowe fałszywe kandydaty (PR/wydarzenia/pogoda) ✅

---

## 2. Decyzja architektoniczna

Realne komunikaty drogowe na liście mają **tylko tytuł, bez zajawki** — kolidowałoby to z globalnym `MIN_PROPOSAL_TEXT_LENGTH = 60`, który obowiązuje każde źródło. **Nie obniżono tego progu.** Zamiast tego:

1. Tani filtr tematyczny (`isPowiatNoticeRelevant`, `src/lib/sourceParsers/powiatPruszkowskiParser.ts`) działa na samym tekście listy (tytuł + ewentualna zajawka) — **bez żadnego requestu** — i odrzuca PR/wydarzenia/pogodę przed jakimkolwiek pobraniem strony artykułu.
2. Pozycje, które przechodzą filtr i mają wystarczająco długi tekst na liście, stają się kandydatem od razu — bez dodatkowego requestu.
3. Pozycje, które przechodzą filtr, ale są za krótkie (realny kształt komunikatów drogowych tutaj), dostają **dokładnie jedną** próbę pobrania strony artykułu — ograniczoną do `MAX_ARTICLE_BODY_FETCHES = 3` na cały check, każda z osobnym timeoutem 8 s.
4. Błąd pobrania, brak kontenera treści (`div.editor-content`) lub wciąż za krótki wynik po połączeniu → pozycja jest **odrzucana**, nigdy nie trafia jako kandydat z samym ogólnym tytułem.
5. Wynik trafia przez ten sam współdzielony `buildCheckProposals` (cap, deduplikacja tytułów, filtr boilerplate) co każde inne źródło — brak równoległej logiki.

### Nowe pliki
- `src/lib/sourceParsers/powiatPruszkowskiParser.ts` — czyste funkcje parsujące (lista + treść artykułu), własny filtr tematyczny.
- `src/lib/sourceParsers/powiatPruszkowskiFetch.ts` — ograniczona, fail-closed orkiestracja dwuetapowego pobierania.

### Zmodyfikowane pliki
- `officialSourceChecklist.ts` — nowy wpis `powiat-pruszkowski-wiadomosci` (kategoria `roads`).
- `sourceCheck.ts` — dodane do `SAFE_CHECK_SOURCE_IDS` (5. źródło).
- `cronCheckSources.ts` i `manualSourceCheckFetch.ts` — nowa gałąź dispatchu obok istniejących HTML/REST.
- `src/app/api/sources/check/route.ts` — przekazuje nowy dyskryminator do wyboru ścieżki.
- `pageParser.ts` — naprawiono realną lukę znalezioną przy tym źródle: `decodeEntities` nie obsługiwał nazwanych encji HTML4 (`&oacute;` itp.), których używa edytor WYSIWYG tego portalu (np. „rob&oacute;t” → wcześniej „rob t”, teraz poprawnie „robót”).

---

## 3. Ograniczenia i twarde limity

- **1 request** na listing + **do 3** na artykuły = **maks. 4 requesty/check**, zawsze.
- Każdy request ma osobny timeout (10 s listing, 8 s artykuł).
- Filtr tematyczny działa **przed** jakimkolwiek requestem artykułu — PR/wydarzenia/pogoda nigdy nie generują ruchu sieciowego.
- Brak zmiany globalnego `MIN_PROPOSAL_TEXT_LENGTH` ani innych progów dedup — zero ryzyka regresji dla istniejących 4 źródeł.
- Źródło obejmuje **cały Powiat Pruszkowski** (w tym miejscowości spoza pilotażu, np. Piastów) — `whatToCheck` jawnie ostrzega admina, by przy konwersji kandydata sprawdził, czy dotyczy realnie okolic pilotażu.

## 4. Wyniki testów

- Nowy plik `tests/e2e/powiatPruszkowskiParser.spec.ts` — **24 testy**, pokrywające wszystkie 15 wymaganych scenariuszy (pobranie listy, URL, data, polskie znaki, artykuł drogowy przechodzący filtr, komunikat urzędowy/promocyjny odrzucony, brak/za krótka treść, niedostępny artykuł, timeout, duplikat, brak/niebezpieczny URL, cap propozycji, brak zapisu przy niejednoznaczności).
- Zaktualizowane pre-istniejące testy (liczba bezpiecznych źródeł 4→5): `sourceCheck.spec.ts`, `sourceChecklist.spec.ts`, `sourceHealth.spec.ts`, `cronCheckSourcesRoute.spec.ts`.
- `npm run check` — zero błędów (typecheck + lint + build).
- Pełny Playwright — **1422/1422 testów przechodzi**, zero regresji (jeden pre-istniejący, niezwiązany flaky test `themeSystem.spec.ts` potwierdzony jako przechodzący w izolacji, znany z Dnia 11).

## 5. Status Preview / Production

- Branch `sprint-183a-powiat-pruszkowski-source-v1` → push → Preview build **bez błędów** (potwierdzone przez logi buildu Vercel).
- Preview smoke test przez `curl` zablokowany przez standardową ochronę SSO Vercel (nie jest to regresja — dotyczy każdego Preview na tym koncie); zweryfikowano zamiast tego czyste logi buildu.
- Bezpieczny fast-forward merge do `main` → push → Production redeploy.
- **Production smoke test wykonany i zielony**: `/`, `/alerty`, `/login`, `/admin`, `/admin/sources` → 200; `/api/cron/check-sources` bez sekretu → 401 (fail-closed, bez zmian).
- Zero zmian danych Production — żaden write run nie został uruchomiony.

## 6. Wdrożone czy aktywowane?

**Tylko wdrożone do warstwy check.** Źródło:
- ✅ Widoczne na `/admin/sources`, z aktywnym przyciskiem „Sprawdź teraz przez aplikację” (jak pozostałe 4 bezpieczne źródła).
- ✅ Uczestniczy w dry-run cronie `/api/cron/check-sources` (bez zapisu, `SCHEDULED_CHECKS_ENABLED` bez zmian).
- ❌ **NIE** dodane do `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` (osobna zmienna środowiskowa Production) — żaden kandydat nie zostanie automatycznie zapisany.
- ❌ **NIE** dodane do listy dozwolonych źródeł Trusted Source Auto-Publish.
- ❌ Żaden realny Production write run nie został wykonany dla tego źródła w tym sprincie.

Aktywacja do harmonogramu zapisującego dane wymaga osobnej, przyszłej, jawnej decyzji Adama — zgodnie z tym samym wzorcem co pozostałe źródła.
