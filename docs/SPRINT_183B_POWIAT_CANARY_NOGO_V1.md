# Sprint 183B — Canary Powiatu Pruszkowskiego: analiza read-only + decyzja NO-GO

Status: **NO-GO. Zero zmian flag Production, zero requestów zapisujących, zero kandydatów, zero publikacji.**

Data: 2026-07-30 (Dzień 16).

---

## 0. Preflight

- `git status` czysty (poza lokalnym `.vscode/`, nietknięty), `main` = `origin/main` = `f9b2d61`.
- Production deployment zweryfikowany zgodny z `main` (`dpl_8sv5m3bKDiAQw7caNYSmioAyrk5J`).
- `GET /api/cron/write-candidates` → `503 {"ok":false,"error":"Tryb zapisu jest wyłączony."}` — potwierdzone `SCHEDULED_WRITES_ENABLED` nieaktywne.
- `GET /api/cron/auto-publish-trusted-source` → `503 {"ok":false,"error":"Automatyczna publikacja jest wyłączona."}` — potwierdzone `SCHEDULED_AUTO_PUBLISH_ENABLED` nieaktywne.
- `/api/admin/automation-status` wymaga zalogowanej sesji administratora — nie posiadam danych logowania Adama i nie próbowałem się logować (poza zakresem tego, co mogę zrobić bezpiecznie).
- **Blocker narzędziowy stwierdzony przed jakąkolwiek próbą zmiany flag:** rozszerzenie Chrome (Claude in Chrome) nie jest połączone w tej sesji — nie mogę bezpiecznie ustawiać/zapisywać zmiennych Vercel przez przeglądarkę. Vercel CLI nie jest zainstalowane, a jego konfiguracja wymagałaby interaktywnego logowania Adama, którego nie wykonuję (zgodnie z zasadą: nigdy nie loguję się w jego imieniu). `CRON_SECRET` jest wartością, której nie widzę i nie mogę zobaczyć.
- **Wniosek:** nawet gdyby analiza źródła (Część 2) wykazała dobrego kandydata, wykonanie Części 4–7 (realne przełączenie flag Production i requesty z `CRON_SECRET`) wymagałoby ręcznego udziału Adama — dokładnie zgodnie z warunkiem zatrzymania z instrukcji Dnia 16. W praktyce okazało się to nieistotne, ponieważ analiza źródła sama w sobie prowadzi do NO-GO (patrz niżej) — więc pytanie o dostęp do sekretu stało się bezprzedmiotowe.

## 1. Read-only analiza źródła (na żywo, 2026-07-30)

Pobrano aktualną listę `https://samorzad.gov.pl/web/powiat-pruszkowski/wiadomosci` (HTTP 200) i przepuszczono przez **dokładnie ten sam kod produkcyjny**, który uruchamia się na Production (`extractPowiatWiadomosciListItems` → `isPowiatNoticeRelevant` → `buildPowiatWiadomosciParse` z prawdziwym pobraniem artykułów → `buildCheckProposals`), uruchomiony lokalnie przez `tsx` na tymczasowym skrypcie (usuniętym po analizie, nigdy niecommitowanym).

Lista niezmieniona względem audytu ze Sprintu 183A (2026-07-29) — **żaden nowy komunikat nie pojawił się w ciągu doby.** 10 pozycji na liście, z czego tylko 2 przechodzą filtr tematyczny:

| Tytuł | URL | Filtr tematyczny | Długość tekstu kandydata | hasDate |
|---|---|---|---|---|
| Utrudnienia w ruchu - rozbudowa ul. Piłsudskiego w Piastowie | `.../utrudnienia-w-ruchu---rozbudowa-ul-pilsudskiego-w-piastowie` | ✅ przechodzi | 60 znaków (sam tytuł) | ❌ false |
| Uwaga kierowcy! Czasowe zamknięcia dróg powiatowych - Miasto Pruszków | `.../uwaga-kierowcy-czasowe-zamkniecia-drog-powiatowych---miasto-pruszkow` | ✅ przechodzi | 69 znaków (sam tytuł) | ❌ false |

Pozostałe 8 pozycji poprawnie odrzucone przez filtr tematyczny (konkurs, rocznica, wydarzenie w parku, ostrzeżenie hydrologiczne [pogoda — poza zakresem], AI/ChatBot, mistrzostwa sportowe, strategia rozwoju, tydzień mobilności).

### Realne, istotne odkrycie: luka w mechanizmie dociągania treści

Oba przechodzące filtr tytuły mają **dokładnie ≥60 znaków same z siebie** (60 i 69), więc próg `MIN_PROPOSAL_TEXT_LENGTH` jest spełniony przez sam tytuł — mechanizm pobierania treści artykułu (`fetchArticleBody`, zaprojektowany w Sprincie 183A właśnie dla takich przypadków) **nigdy się nie uruchamia** dla żadnego z nich, ponieważ trigger to `listText.length < MIN_PROPOSAL_TEXT_LENGTH`. Rezultat: kandydat składałby się **wyłącznie z gołego tytułu** — bez daty, bez opisu, bez „co zrobić". Numerycznie próg jest spełniony, ale merytorycznie treść jest niewystarczająca.

**To nie blokuje dzisiejszej decyzji** (patrz niżej — oba kandydaty odpadają z innych, jeszcze bardziej jednoznacznych powodów), ale jest realną luką do naprawienia w przyszłym sprincie: trigger powinien uwzględniać nie tylko długość, ale też brak wykrytej daty (`hasDate`) w samym tytule — patrz §5.

### Pełna treść artykułów (pobrana bezpośrednio, do oceny — nie trafiła do żadnego kandydata na Production)

**Kandydat 1 — Piłsudskiego w Piastowie:**
> „Informujemy, że w związku z realizacją kolejnego etapu rozbudowy drogi powiatowej nr 4118W (ul. Piłsudskiego w Piastowie), od 20 lipca do ok. 30 sierpnia 2026 r. nastąpi zamknięcie ul. Bohaterów Wolności na odcinku od ul. Piłsudskiego do ul. Warszawskiej."

- Daty: 20 lipca – ok. 30 sierpnia 2026 → **wciąż aktualne/trwające** (spełnia warunek 2).
- Lokalizacja: **Piastów** — miasto w Powiecie Pruszkowskim, ale **spoza sześciu miejscowości pilotażu** Alertownika (Komorów, Nowa Wieś, Granica, Michałowice, Reguły, Pruszków). **Nie spełnia warunku 3** („konkretna lokalizacja na terenie obsługiwanym przez aplikację").

**Kandydat 2 — zamknięcia dróg powiatowych, Miasto Pruszków:**
> „W związku z układaniem warstwy ścieralnej nawierzchni wystąpią całkowite zamknięcia: 9 lipca 2026 r. — DP3142W, ul. Bolesława Prusa w Pruszkowie (od ul. Pogodnej do ul. Wojska Polskiego); 13 lipca 2026 r. — DP3107W, ul. Komorowska (od torów WKD do ul. Brzozowej)."

- Daty: **9 i 13 lipca 2026** — jednodniowe zamknięcia, **już minione** względem dzisiejszej daty (2026-07-30). **Nie spełnia warunku 2** („data zdarzenia jest aktualna albo przyszła").
- Zapytanie do bazy (read-only, `alerts` table) pokazało już opublikowany alert **„Utrudnienia w ruchu na ul. Komorowskiej i Bolesława Prusa"** (kategoria `roads`, `starts_at` 2026-07-05, `ends_at` 2026-07-07, źródło `pruszkow.pl`) — te same ulice, bardzo bliski okres. Ten komunikat opisuje **kolejny, już zakończony etap tych samych prac** — realnie duplikat/superseded, nie nowa treść.

## 2. Decyzja: NO-GO

Żaden z dwóch kandydatów przechodzących filtr tematyczny nie spełnia łącznie 12 warunków z Części 3:

| Warunek | Kandydat 1 (Piłsudskiego, Piastów) | Kandydat 2 (Prusa/Komorowska, Pruszków) |
|---|---|---|
| 1. Oficjalne źródło + bezpośredni permalink | ✅ | ✅ |
| 2. Data aktualna/przyszła | ✅ (20 lip–30 sie) | ❌ **(9 i 13 lipca — minione)** |
| 3. Konkretna lokalizacja w obszarze pilotażu | ❌ **(Piastów — poza pilotażem)** | ✅ (Pruszków) |
| 4. Jednoznaczna kategoria | ✅ (roads) | ✅ (roads) |
| 5. Wystarczająca treść | ⚠️ numerycznie tak, merytorycznie nie (sam tytuł — patrz §1) | ⚠️ jw. |
| 6. Klasyfikacja new | n/d (nigdy nie zapisany) | n/d — prawdopodobnie **duplicate/superseded** (patrz §1) |
| 11. Kwalifikowałby się do auto-publish (9 warunków CLAUDE.md) | ❌ | ❌ |

**Żaden kandydat nie spełnia kompletu warunków.** Zgodnie z instrukcją: zero zmian flag, zero requestów zapisujących, zero kandydatów, zero publikacji. Przechodzimy bezpośrednio do Części 8 (Partner Demo) w tej samej sesji.

## 3. Stan po analizie

- Liczniki Production: **bez zmian** (żaden kandydat, żaden alert, żaden e-mail).
- Flagi: bez zmian — `SCHEDULED_WRITES_ENABLED`, `SCHEDULED_AUTO_PUBLISH_ENABLED` pozostają w stanie sprzed sesji (potwierdzone 503 na obu endpointach).
- Żadna migracja SQL, żadna zmiana RLS, żadne rozszerzenie uprawnień anon/public.

## 4. Rekomendacja na przyszłość (nie wykonana dziś — poza zakresem NO-GO)

Naprawić trigger dociągania treści artykułu w `powiatPruszkowskiFetch.ts`: zamiast `listText.length < MIN_PROPOSAL_TEXT_LENGTH`, wyzwalać pobranie artykułu również wtedy, gdy `!detectDateInText(listText)` — bo tytuł bez zajawki prawie nigdy nie zawiera daty, a data jest kluczowa dla `warunku 2` i całego auto-publish. To osobna, świadoma zmiana kodu wymagająca własnych testów regresyjnych — nie wykonana w tej sesji NO-GO, żeby nie mieszać audytu z niezatwierdzoną zmianą logiki.
