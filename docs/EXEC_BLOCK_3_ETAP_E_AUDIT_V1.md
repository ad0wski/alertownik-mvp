# Blok Wykonawczy 3 — kanoniczny audyt kryteriów Etapu E

Status: **audyt zakończony. Znaleziono i tu jawnie zgłoszono jedną
rozbieżność etykiety E/F — nie jest to ZMIANA ZAKRESU (nie dodaje ani nie
usuwa etapu, nie zmienia definicji żadnego etapu), tylko obserwacja, że
praca faktycznie wykonywana od Bloku 1 pasuje literalnie pod definicję
Etapu F, nie Etapu E. Zgłoszone Adamowi do świadomej decyzji, nie
rozstrzygnięte samodzielnie.**

Data: 2026-08-03 (Blok Wykonawczy 3).

---

## 1. Metodologia

Przeczytane osobiście w tym bloku (nie z pamięci): `docs/MASTER_ROADMAP_V2.md`
(Etap E i F w całości), `docs/DEFINITION_OF_DONE_V1.md` (Etap E),
`docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md`, `docs/EXEC_BLOCK_2_SOURCE_ACTIVATION_V1.md`,
aktualny kod `src/lib/sourceScale/`.

## 2. Tabela kryteriów Etapu E (Definition of Done, dosłowny tekst)

| Kryterium | Źródło w dokumentacji | Stan | Dowód | Brakująca praca | Migracja SQL? | Decyzja Adama? | Bezpieczne teraz? |
|---|---|---|---|---|---|---|---|
| Wspólne typy źródła (lifecycle, adapter interface, konfiguracja) scalone do `main`, przetestowane | DoD Etap E, pkt 1 | ✅ **zrobione** (Sprint 188A) | `src/lib/sourceScale/sourceLifecycle.ts`, `sourceAdapterTypes.ts` + testy jednostkowe | brak | nie | nie | — |
| Walidatory konfiguracji + scoring gotowości, zaimplementowane i przetestowane | DoD Etap E, pkt 2 | ✅ **zrobione** (Sprint 188A) | `sourceConfigValidation.ts`, `sourceReadinessScore.ts` + testy | brak | nie | nie | — |
| Read-only coverage calculator, zaimplementowany i przetestowany | DoD Etap E, pkt 3 | ✅ **zrobione** (Sprint 188A) | `coverageCalculator.ts` + testy | brak | nie | nie | — |
| Audyt hardkodowanych założeń ukończony i spisany | DoD Etap E, pkt 4 | ✅ **zrobione** (Sprint 188A) | `NATIONAL_SOURCE_SCALE_PLAN_V1.md` §2 | brak | nie | nie | — |
| Migracje geograficzne istnieją jako PROPOSED+VERIFY, **nie wykonane** | DoD Etap E, pkt 5 | ✅ **zrobione i nadal aktualne** | `docs/sql/PROPOSED_SPRINT_188A_SOURCE_GEOGRAPHY_V1.sql` — wciąż nie uruchomiona | brak (chyba że Adam zażąda wykonania) | tak (przygotowana, nie wykonana) | tak (wykonanie) | — |
| „Zero nowych źródeł aktywowanych na Production" w ramach **tego etapu** | Roadmap Etap E, „Poza zakresem" | ⚠️ **literalnie już nieprawdziwe od Bloku 2** | 17 źródeł check-only aktywnych na Production (Bloki 1–3) | — | nie | **tak, patrz §4** | — |

**Wniosek:** wszystkie pięć technicznych kryteriów „fundamentu" Etapu E było
w pełni zrobionych już po zamknięciu Sprintu 188A. Bloki Wykonawcze 1–3 nie
dokładają niczego do tej listy — realnie wykonują coś innego.

## 3. Co dokładnie odpowiada Etapowi F, nie Etapowi E

Definicja zakończenia pojedynczej fali Etapu F (`DEFINITION_OF_DONE_V1.md`,
sekcja Etap F): „Wszystkie źródła danej fali przeszły certyfikację (test
dostępności, test parsera, sprawdzenie dat/duplikatów) i mają status
`active`... Panel pokrycia Polski odzwierciedla nowy stan." — to jest
dokładny opis tego, co faktycznie wykonano w Blokach 1–3: dyskretne fale
(7 → 10 → 17 źródeł), każde źródło HTTP-zweryfikowane przed dodaniem,
status check-only ("aktywne" w znaczeniu operacyjnym, nie w znaczeniu
formalnego pola `lifecycle_status` — ta migracja nadal nie została
wykonana).

## 4. Rozbieżność etykiety — zgłoszenie, nie decyzja

**Fakt:** od Bloku Wykonawczego 2 praca nazywana w promptach „Etap E"
literalnie spełnia definicję Etapu F, nie Etapu E — ponieważ fundament
Etapu E był już kompletny wcześniej, a każda kolejna fala źródeł
check-only jest z definicji Etapem F.

**Dlaczego to nie jest ZMIANA ZAKRESU:** nic w rzeczywistym zakresie pracy
się nie zmienia — źródła są i pozostają check-only, roadmap nadal ma
dokładnie 6 etapów, nic nie zostaje dodane ani przesunięte. To wyłącznie
kwestia **etykiety** w promptach i nazwach dokumentów (`EXEC_BLOCK_2_SOURCE_ACTIVATION_V1.md`
też błędnie użył „Etap E" w tytule).

**Rekomendacja (nie decyzja):** przyszłe bloki dotyczące aktywacji
kolejnych fal źródeł powinny być nazywane Etapem F wprost. Nie zmieniam
tytułów istniejących dokumentów Bloków 1–2 samodzielnie — pozostają
historycznym zapisem tego, co faktycznie zrobiono, tylko z nieprecyzyjną
etykietą w nagłówku.

## 5. Czy Etap E może być już formalnie zamknięty

**Tak, technicznie już jest zamknięty** — wszystkie pięć kryteriów DoD
spełnione od Sprintu 188A, potwierdzone ponownie w tym audycie z
odczytaniem rzeczywistego kodu, nie z pamięci. Formalne ogłoszenie
zamknięcia Etapu E pozostaje decyzją Adama (może zechcieć poczekać na
wykonanie migracji geograficznej jako część „prawdziwego" zamknięcia,
mimo że DoD tego nie wymaga dosłownie) — nie ogłaszam tego jednostronnie
w tym raporcie, tylko przedstawiam fakt i czekam na potwierdzenie.

## 6. Wybór ścieżki tego bloku (Sekcja 3 briefu)

**Wybrana: Ścieżka A** — większa fala istniejącego adaptera `wordpress_rest`.

**Uzasadnienie z DoD/roadmapu:** żadne kryterium DoD Etapu E nie wymaga
udowodnienia drugiego adaptera teraz — `NATIONAL_SOURCE_SCALE_PLAN_V1.md`
§5 wprost stwierdza, że RSS/PDF pozostają placeholderami „zgodnie z
decyzją ze Sprintu 76", niezmienioną przez ten dokument. Budowa realnego
drugiego adaptera oznaczałaby pisanie nowego kodu parsera bez potrzeby —
naruszałoby to zasadę „nie buduj wielu jednorazowych parserów HTML"
(Sekcja 3 briefu, Ścieżka B). Ścieżka A pozostaje w 100% w granicach
istniejącego, już zaimplementowanego i przetestowanego mechanizmu.

**Ścieżka B odłożona:** brak literalnego wymogu DoD, brak nowego,
stabilnego, powszechnego typu źródła gotowego do certyfikacji bez pisania
kodu (RSS/PDF pozostają celowo nieukończone od Sprintu 76) — podjęcie
Ścieżki B byłoby decyzją poszerzającą zakres bez uzasadnienia w
dokumentacji, więc odłożone, nie odrzucone na stałe.
