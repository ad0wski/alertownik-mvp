# Definition of Done V1 — Alertownik (per Etap A–F)

Status: kanoniczny, towarzyszy `docs/MASTER_ROADMAP_V2.md`.

Data: 2026-08-03 (Sprint 188A).

---

## Zasada wspólna dla każdego etapu

Niezależnie od poniższych kryteriów specyficznych dla etapu, **żaden etap nie
jest uznany za zakończony**, jeśli w danym momencie nieprawdziwe jest
którekolwiek z:

- `npm run check` (typecheck + lint + build) — zero błędów.
- `npm run test:e2e` — 100% zielone, bez pominiętych testów bez uzasadnienia.
- `npm run test:pwa` — 100% zielone.
- Production nie ma regresji: `/`, `/alerty`, `/admin`, `/admin/sources`,
  `/partnerzy`, `/demo` → 200; oba endpointy cron (`write-candidates`,
  `auto-publish-trusted-source`) → 503 (fail-closed), chyba że Adam jawnie
  zdecydował inaczej.
- Brak nowych sekretów/tokenów w repo, brak zmian `.env.local`, brak klucza
  service_role w kodzie frontendowym.
- Interfejs publiczny pozostaje w języku polskim.
- Żadna migracja SQL nie została wykonana bez jawnej zgody Adama w danej
  sesji.

---

## Etap A — Uproszczenie UX i dopięcie produktu lokalnego

**Zrobione, gdy:**
- ≥3 zakończone, realne testy Local Beta (rozmowa lub ustrukturyzowany
  feedback pisemny) zebrane i udokumentowane w `docs/`.
- Każdy zgłoszony w tych testach realny problem UX ma status: wdrożony,
  świadomie odłożony (z powodem), lub odrzucony (z powodem).
- Zero regresji technicznych względem stanu z Sprintu 187A.

**Nie liczy się jako zrobione:**
- Testerzy zaproszeni, ale nieodpowiadający (to stan "w toku", nie "zrobione").
- Poprawki UX wprowadzone bez realnego feedbacku ("bo tak powinno być
  lepiej") — te mogą być wdrażane, ale nie zamykają Etapu A same z siebie.

---

## Etap B — Partner Demo i pierwszy rzeczywisty outreach

**Zrobione, gdy:**
- Przygotowana wiadomość outreachowa wysłana do ≥1 realnego adresata z
  wiedzą i decyzją Adama.
- Odpowiedź (jakakolwiek — pozytywna, negatywna, cisza po rozsądnym czasie)
  udokumentowana w `docs/`.

**Nie liczy się jako zrobione:**
- Materiały gotowe, ale nic nie wysłane (to obecny stan, Sprint 185A/187A).
- Wysłanie przez Claude bez wyraźnej zgody Adama w danej sesji — to
  naruszenie zasady "explicit permission required" dla wysyłania wiadomości
  w imieniu użytkownika.

---

## Etap C — Minimalny test monetyzacji

**Zrobione, gdy:**
- Oferta (co płaci partner, za co) spisana w `docs/`.
- Lista celowa (kto realnie mógłby zapłacić) spisana.
- Oferta wysłana do ≥1 realnego adresata.
- Odpowiedź (lub jej brak po rozsądnym czasie) udokumentowana.

**Nie liczy się jako zrobione:**
- Jakikolwiek kod obsługujący realną płatność — to pozostaje poza zakresem
  całego etapu z definicji (CLAUDE.md: brak kodu płatności bez wyraźnej,
  osobnej zgody, i nawet wtedy nie jest to część "minimalnego testu").

---

## Etap D — Store Readiness i decyzja PWA / Android TWA / iOS

**Zrobione dla sub-etapu D1 (Android TWA), gdy:**
- Konto Google Play Console założone przez Adama.
- 12 testerów opt-in nieprzerwanie przez 14 dni osiągnięte.
- Aplikacja zgłoszona i zatwierdzona, widoczna w Google Play.

**Zrobione dla sub-etapu D2 (iOS), gdy** (opcjonalne, wymaga osobnej decyzji
Adama o rozpoczęciu):
- Konto Apple Developer Program założone.
- Aplikacja przeszła review i jest widoczna w App Store.

**Cały Etap D uznaje się za "zamknięty" (nie: "porzucony"), gdy:**
- D1 zrealizowane ORAZ Adam podjął jawną decyzję co do D2 (rozpocząć /
  odłożyć bezterminowo / nie robić) — PWA-only jest jawnie akceptowalnym
  stanem końcowym.

**Nie liczy się jako zrobione:**
- Samo przygotowanie techniczne (assetlinks.json, teksty listingowe) — to
  już zrobione w Sprincie 186A i NIE zamyka etapu.
- Rozpoczęcie procesu Play Console przed domknięciem Etapu A (naruszałoby
  zalecaną kolejność z `docs/SPRINT_186A_STORE_READINESS_V1.md`).

---

## Etap E — Ogólnopolska platforma źródeł (fundament)

**Zrobione, gdy:**
- Wspólne typy źródła (lifecycle, adapter interface, konfiguracja) scalone
  do `main`, przetestowane (testy jednostkowe adapterów).
- Walidatory konfiguracji źródła i scoring gotowości źródła zaimplementowane
  i przetestowane.
- Read-only coverage calculator zaimplementowany i przetestowany.
- Audyt hardkodowanych założeń (ten dokument + `NATIONAL_SOURCE_SCALE_PLAN_V1.md`)
  ukończony i spisany.
- Migracje geograficzne (jeśli potrzebne) istnieją jako pliki PROPOSED +
  VERIFY w `docs/`, **nie wykonane**.
- Zero nowych źródeł aktywowanych na Production, zero zapisów do Supabase
  Production wykonanych w ramach tego etapu.

**Nie liczy się jako zrobione:**
- Zaprojektowanie ogromnej, niewykorzystanej architektury bez realnego
  zastosowania w kodzie (jawnie zakazane w brief tego sprintu).
- Jakakolwiek migracja wykonana bez osobnej, jawnej zgody Adama.

---

## Etap F — Rollout Polski falami i partiami źródeł

**Zrobione dla pojedynczej fali, gdy:**
- Wszystkie źródła danej fali przeszły certyfikację (test dostępności, test
  parsera, sprawdzenie dat/duplikatów) i mają status `active` lub świadomie
  `degraded`/`disabled` z udokumentowanym powodem.
- Panel pokrycia Polski odzwierciedla nowy stan.
- Zero regresji na istniejących, już aktywnych źródłach.

**Cały Etap F nie ma jednego "zrobione"** — kończy się decyzją Adama o
zatrzymaniu (patrz `MASTER_ROADMAP_V2.md` §Etap F, "Definicja zakończenia").

**Nie liczy się jako zrobione (dla żadnej fali):**
- Aktywacja źródła bez certyfikacji.
- Aktywacja automatycznej publikacji (auto-publish) dla nowego źródła bez
  osobnej, jawnej zgody Adama i własnego audytu bezpieczeństwa — rozszerzenie
  istniejącego wąskiego wyjątku (CLAUDE.md Security Rule #10) na nowe źródła
  nie jest domyślne.

---

## Jak korzystać z tego dokumentu

Przy zamykaniu jakiegokolwiek sprintu dotyczącego Etapów A–F, sprawdź
odpowiednią sekcję powyżej **przed** ogłoszeniem etapu za zakończony. Częściowe
postępy są prawidłowo raportowane jako "w toku" z konkretnym stanem (np.
"2/3 wymaganych testów"), nigdy jako zaokrąglone "prawie gotowe".
