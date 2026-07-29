# Sprint 184A — Powiat Pruszkowski: naprawa hydration + warunkowy re-canary

Status: **naprawa wdrożona na Production. Re-canary zakończony NO-GO (na treści, nie na narzędziach). Partner Demo rozbudowane.**

Data: 2026-07-31 (Dzień 17).

---

## 1. Dokładna przyczyna problemu

`buildPowiatWiadomosciParse` (Sprint 183A) uruchamiał pobranie pełnej treści artykułu wyłącznie, gdy tekst z listy (tytuł + ewentualna zajawka) był krótszy niż `MIN_PROPOSAL_TEXT_LENGTH` (60 znaków). Dzień 16 potwierdził na żywych danych, że oba realne komunikaty drogowe mają tytuły **dokładnie ≥60 znaków bez żadnej zajawki** — więc próg długości nigdy nie wyzwalał pobrania artykułu, a kandydat miałby wyłącznie tytuł, bez jakiejkolwiek daty.

## 2. Opis poprawki

Nowa funkcja `needsArticleHydration(listText)` (`src/lib/sourceParsers/powiatPruszkowskiFetch.ts`) wyzwala pobranie artykułu, gdy:
- tekst jest krótszy niż `MIN_PROPOSAL_TEXT_LENGTH`, **LUB**
- `detectDateInText(listText)` nie wykrywa żadnej daty.

Dodatkowo: jeśli po pobraniu i połączeniu treści artykułu wciąż **nie wykryto żadnej daty**, komunikat jest **bezpiecznie odrzucany** — nigdy nie trafia jako kandydat z samym tytułem, więc nigdy nie może dotrzeć do bramki auto-publikacji bez kompletnych pól.

Ograniczenia zachowane bez zmian: `MAX_ARTICLE_BODY_FETCHES = 3`, timeout na artykuł, fail-closed przy błędzie/braku kontenera treści, dokładnie jeden fetch na pozycję, brak zmiany `MIN_PROPOSAL_TEXT_LENGTH`, brak zmiany innych źródeł.

## 3. Zmienione pliki

- `src/lib/sourceParsers/powiatPruszkowskiFetch.ts` — nowa funkcja `needsArticleHydration`, zmieniony warunek w `buildPowiatWiadomosciParse`.
- `tests/e2e/powiatPruszkowskiParser.spec.ts` — 9 nowych testów + poprawiony fixture jednego istniejącego testu (dodane daty, bo nowa logika inaczej by go unieważniła).
- `src/app/partnerzy/page.tsx` + `tests/e2e/public.spec.ts` — Część 8 (patrz §7).

## 4. Testy

- 33/33 w `powiatPruszkowskiParser.spec.ts` (9 nowych: hydration na brak daty, data bieżąca, data przyszła, wciąż brak daty → odrzucenie, kompletna data w tytule → brak fetchu, krótki tytuł działa jak wcześniej, brak podwójnego fetchu + 3 testy jednostkowe `needsArticleHydration`).
- Pełny `npm run check` — zielony (typecheck + lint + build).
- Pełny Playwright — **1439/1439** po wyczyszczeniu środowiska (patrz §6 — kilka fałszywych niepowodzeń spowodowanych przeciążeniem maszyny, niezwiązanych z kodem).

## 5. Status Preview / Production

- Branch `sprint-184a-powiat-article-hydration-v1` → Preview build czysty (logi bez błędów) → fast-forward merge do `main` → Production redeploy.
- Production smoke test zielony: `/`, `/alerty`, `/admin`, `/admin/sources`, `/partnerzy` → 200; `/api/cron/write-candidates` i `/api/cron/auto-publish-trusted-source` → 503 (bez zmian, fail-closed).
- Zweryfikowano dokładny deployowany commit (`9466e73`, potem `a094472` po Części 8).

## 6. Środowiskowa przeszkoda podczas testów (nie regresja)

W trakcie pełnego przebiegu Playwright kilkukrotnie napotkano: zawieszone procesy `next dev` z poprzednich dni (porty 3000/3001 zajęte), krytycznie niską wolną pamięć (~740 MB z 5.9 GB) i wynikające z tego panika Turbopacka (`0xc0000142`) oraz przypadkowe zabicia procesów w tle. Po zamknięciu osieroconych procesów `node.exe` (w tym jednego zużywającego 617 MB) i odzyskaniu pamięci (~1.96 GB wolnego), pełny zestaw przeszedł **1439/1439** bez żadnego niepowodzenia. Potwierdzono przez `git stash`, że wcześniejsze niepowodzenia (mobileAppShell, public.spec.ts, themeSystem) występowały identycznie na kodzie sprzed zmiany — nie są regresją tego sprintu.

## 7. Live read-only re-canary (Część 5)

Świeże pobranie feedu (2026-07-31, ten sam zestaw 10 pozycji co Dzień 16 — feed się nie zmienił). Nowa logika zadziałała poprawnie: **2 requesty artykułów wykonane** (dokładnie dla 2 pozycji przechodzących filtr tematyczny), oba teraz z pełną treścią i `hasDate: true`:

| Tytuł | Hydration | Data zdarzenia | Lokalizacja | Status aktualności | Wynik |
|---|---|---|---|---|---|
| Utrudnienia — Piłsudskiego, Piastów | ✅ uruchomione (brak daty w tytule) | 20 lipca – ok. 30 sierpnia 2026 | **Piastów — poza pilotażem** | aktualne | **not eligible** (warunek 3) |
| Uwaga kierowcy — Prusa/Komorowska, Pruszków | ✅ uruchomione (brak daty w tytule) | 9 i 13 lipca 2026 (jednodniowe) | Pruszków — w pilotażu | **minione** | **not eligible** (warunek 2; prawdopodobny duplikat/kontynuacja istniejącego alertu na tych samych ulicach) |

## 8. Decyzja GO/NO-GO

**NO-GO** — identyczna treściowa konkluzja co Dzień 16, teraz potwierdzona pełniejszymi, poprawnie zhydratowanymi danymi zamiast tylko tytułów. Poprawka działa zgodnie z projektem; NO-GO wynika z rzeczywistej treści źródła (lokalizacja poza pilotażem / przeterminowana data), nie z braków w kodzie.

- Kandydat: **nie utworzono**.
- Auto-publikacja: **nie uruchomiono**.
- Delty liczników Production: **zero** (potwierdzone read-only zapytaniem do `source_notice_candidates` — zero wierszy dla tego źródła).
- Flagi: `SCHEDULED_WRITES_ENABLED=false`, `SCHEDULED_AUTO_PUBLISH_ENABLED=false` — bez zmian przez cały dzień (503 na obu endpointach, przed i po).

## 9. Partner Demo (Część 8)

Audyt `/partnerzy` względem checklisty Dnia 17 — większość elementów już pokryta (Sprint 183B). Trzy realne braki uzupełnione:
- Scenariusz demo przekształcony z jednego akapitu w listę 4 kroków.
- „Dla kogo" doprecyzowane — jawnie wymienia Gminę Michałowice, Miasto Pruszków, Powiat Pruszkowski i zarządców infrastruktury.
- Dodano bezpośredni link „Zobacz aplikację →" do „/".

8 nowych testów (treść + brak scrolla poziomego na 375/390/414/1280px). Wdrożone na Production w tym samym dniu.
