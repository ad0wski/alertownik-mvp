# Etap E — formalne zamknięcie: ogólnopolska platforma źródeł (fundament)

Status: **ZAKOŃCZONY.**

Data formalnego zamknięcia: 2026-07-30 (blok „Incident Closeout + formalne
zamknięcie Etapu E", bezpośrednio po Bloku Wykonawczym 2 i incydencie
subagenta w Bloku Wykonawczym 3).

---

## 1. Zakres Etapu E

Zgodnie z `docs/MASTER_ROADMAP_V2.md` §Etap E: przekształcenie silnika
źródeł zakodowanego na twardo pod 6 miejscowości pilotażu w skonfigurowalny
**fundament** (typy, walidatory, lifecycle, scoring, coverage calculator)
zdolny w przyszłości obsłużyć dowolną gminę/powiat/miasto w Polsce —
wyraźnie **fundament, nie uruchomienie na Production**.

## 2. Definition of Done — dowód spełnienia każdego kryterium

Źródło kryteriów: `docs/DEFINITION_OF_DONE_V1.md` §Etap E (identyczne z
`MASTER_ROADMAP_V2.md` §Etap E, zakres obowiązkowy).

| Kryterium | Dowód | Commit |
|---|---|---|
| Wspólne typy źródła (lifecycle, adapter interface, konfiguracja) scalone do `main`, przetestowane | `src/lib/sourceScale/sourceLifecycle.ts`, `sourceAdapterTypes.ts` + `tests/e2e/sourceScaleLifecycle.spec.ts` (7 testów) | `93c5b8d` |
| Walidatory konfiguracji + scoring gotowości, zaimplementowane i przetestowane | `sourceConfigValidation.ts`, `sourceReadinessScore.ts` + testy (9+8 testów) | `93c5b8d` |
| Read-only coverage calculator, zaimplementowany i przetestowany | `coverageCalculator.ts` + testy (7 testów) | `93c5b8d` |
| Audyt hardkodowanych założeń, ukończony i spisany | `docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md` §2 (co generalizuje się, co jest zakodowane na twardo, luki schematu, ryzyko SPOF) | `93c5b8d` |
| Migracje geograficzne jako PROPOSED + VERIFY w `docs/`, nie wykonane | `docs/sql/PROPOSED_SPRINT_188A_SOURCE_GEOGRAPHY_V1.sql` + `VERIFY_...READ_ONLY_V1.sql` + test anti-drift (`sourceGeographyMigrationShape.spec.ts`, 9 testów) — **nadal niewykonane**, zweryfikowane w tym bloku ponownie (§5) | `93c5b8d` |
| Zero nowych źródeł aktywowanych na Production w ramach tego etapu | Prawda dla Etapu E samego w sobie — patrz §6 (granica E→F) dla wyjaśnienia późniejszej aktywacji w Etapie F | `93c5b8d` |

**Wniosek: wszystkie 6 kryteriów spełnione w jednym, atomowym commicie
`93c5b8d` (Sprint 188A), zanim jakiekolwiek źródło zostało kiedykolwiek
aktywowane.**

## 3. Testy

Fundament Etapu E: 45 testów jednostkowych (lifecycle 7, config validation
9, batch onboarding 5, coverage calculator 7, readiness score 8, geography
anti-drift 9) — wszystkie zielone w `93c5b8d` i we wszystkich kolejnych
commitach aż do obecnego bezpiecznego stanu (`9453034`). `npm run check`
zielony, pełny `npm run test:e2e` zielony w każdym punkcie kontrolnym.

## 4. Stan Production

Aktualny bezpieczny commit: `9453034` (revert incydentu Bloku 3, funkcjonalnie
identyczny z `352fad9`, Blok Wykonawczy 2). Oba endpointy zapisujące
(`/api/cron/write-candidates`, `/api/cron/auto-publish-trusted-source`) →
503, potwierdzone na żywo w tym bloku. Zero migracji wykonanych.

## 5. Stan źródeł

- Fundament (typy/walidatory/lifecycle/scoring/coverage) — scalony do
  `main`, zero powiązania z konkretnym źródłem czy Production.
- Migracja geograficzna — nadal **PROPOSED, niewykonana**, zweryfikowana w
  tym bloku jako wciąż nieaplikowana (schemat Supabase niezmieniony od
  Sprintu 172).
- 10 realnych źródeł mazowieckich aktywowanych check-only — to **nie jest
  część Etapu E**, patrz §6.

## 6. Jasna granica Etap E → Etap F

To jest najważniejsza korekta tego dokumentu zamknięcia:

**Etap E = fundament (typy, walidatory, lifecycle, scoring, coverage
calculator, audyt, migracje PROPOSED). Zero aktywacji źródeł.**

**Etap F = wszystko, co aktywuje realne źródło check-only na Production —
certyfikacja, batch onboarding, fale.** Definicja Etapu F
(`MASTER_ROADMAP_V2.md` §Etap F) mówi wprost: „Batch onboarding kolejnych
źródeł tego samego typu adaptera... Certyfikacja każdego źródła (test
dostępności, test parsera, sprawdzanie dat/duplikatów) przed przejściem do
`active`." — to dokładnie to, co wykonano w Blokach Wykonawczych 1 i 2 (10
źródeł mazowieckich, `wordpress_rest`, HTTP-zweryfikowane, aktywowane
check-only).

**Korekta etykietowania:** dokumenty `docs/EXEC_BLOCK_1_SOURCE_DISCOVERY_MAZOWIECKIE_V1.md`
i `docs/EXEC_BLOCK_2_SOURCE_ACTIVATION_V1.md` opisują tę pracę jako „Etap
E" w swoich nagłówkach — było to niepoprawne w świetle tego audytu.
**Żadna praca ani kod nie zostały cofnięte** — tylko etykieta jest
korygowana tym dokumentem: te dwa bloki są retrospektywnie **Falą 1 Etapu
F**, nie Etapu E. Treść merytoryczna (7→10 zweryfikowanych źródeł,
aktywacja check-only, testy) pozostaje prawidłowa i aktualna.

## 7. Ograniczenia

- Fundament nie jest podłączony do żadnego UI admina — `src/lib/sourceScale/*`
  nie jest jeszcze zintegrowane z `/admin/sources`, celowo (poza zakresem
  Etapu E, patrz `NATIONAL_SOURCE_SCALE_PLAN_V1.md` §5).
- Coverage calculator działa dziś tylko na danych z `place: string`
  (heurystyki), nie na strukturalnej geografii — wymaga migracji z §5 tego
  dokumentu.
- Lifecycle (`discovered → ... → active`) istnieje wyłącznie jako typy;
  żadne realne źródło (w tym 10 z Fali 1 Etapu F) nie ma faktycznie
  zapisanego statusu lifecycle w bazie — bo migracja `lifecycle_status`
  wciąż nie wykonana.

## 8. Elementy celowo niewykonane (zgodnie z pierwotnym briefem Sprintu 188A)

- Żaden nowy adapter RSS/Atom czy PDF (nadal placeholder ze Sprintu 76).
- Żaden mechanizm automatycznego discovery źródeł (wymagałby scrapowania
  poza zakresem bez zgody).
- Żadna integracja `sourceScale/*` z `/admin/sources`.
- Żadna migracja wykonana.

## 9. Zależności Etapu F

Etap F zależy twardo od Etapu E (teraz spełnione — fundament istnieje).
Dalsze fale Etapu F **nie wymagają** migracji geograficznej do
funkcjonowania (Fala 1 zadziałała bez niej, `gmina` jako zwykły string) —
migracja jest potrzebna dopiero dla realnego panelu pokrycia Polski
zasilanego danymi z Supabase, nie dla samej aktywacji check-only kolejnych
źródeł.

## 10. Jasne stwierdzenie

**Etap E jest formalnie zakończony.** Nie istnieje Etap G. Cały dalszy
rozwój liczby i zasięgu źródeł — łącznie z każdą przyszłą falą — jest
Etapem F, nigdy nie „kolejną częścią Etapu E".
