# Sprint 148 — Vercel Preview Env Block (Kroki 4–6 runbooku)

Uzupełnienie do `docs/SPRINT_148_CONTROLLED_WRITE_TEST_RUNBOOK_V1.md`.
Kroki 1–3 wykonane i zweryfikowane. Ten plik zbiera Kroki 4–6 w jednym
miejscu, z potwierdzonym UUID źródła Michałowice.

**Zero sekretów w tym pliku.** Hasła, `CRON_SECRET` i faktyczne wartości
wklejasz wyłącznie w UI Vercela / menedżerze haseł — nigdy tutaj.

**`is_active` na rekordzie Michałowice:** pozostaje `false` — audyt
(2026-07-11) potwierdził, że ani `/api/cron/write-candidates`, ani
`/api/sources/check`, ani cron dry-run nie czytają tej kolumny (writer
nie ma nawet SELECT-a na `alert_sources`). Nie blokuje testu.

---

## Potwierdzony UUID źródła

```
Gmina Michałowice — komunikaty
alert_sources.id = a56cfb33-a443-47aa-8365-89c6303e7fcc
url = https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty
```

Potwierdzone niezależnie przez §1 (URL) i §3 (fuzzy match) w
`docs/sql/GET_MICHALOWICE_SOURCE_REGISTRY_ID_READ_ONLY_V1.sql`. §2
(dokładna nazwa) zwrócił 0 wierszy — nazwa w bazie różni się od etykiety
w checkliście; nie jest to błąd, id jest jednoznacznie potwierdzone przez
§1/§3.

---

## Krok 4 — Wygeneruj dane logowania (poza repo)

```
openssl rand -base64 32     # hasło konta technicznego
openssl rand -hex 32        # CRON_SECRET
```

Hasło ustaw w Supabase Dashboard → Authentication → Users → konto
techniczne → Reset/set password. Zapisz oba sekrety wyłącznie w
menedżerze haseł.

- [ ] Hasło konta technicznego wygenerowane i ustawione
- [ ] `CRON_SECRET` wygenerowany

## Krok 5 — Zmienne środowiskowe w Vercel (scope: **Preview only**)

Project Settings → Environment Variables → dodaj każdą, zaznaczając
wyłącznie środowisko **Preview**:

| Variable | Value | Uwagi |
|---|---|---|
| `SUPABASE_SCHEDULED_WRITER_EMAIL` | email konta technicznego z Kroku 2 | |
| `SUPABASE_SCHEDULED_WRITER_PASSWORD` | hasło z Kroku 4 | tylko w Vercel UI / password managerze |
| `CRON_SECRET` | wartość z Kroku 4 | tylko w Vercel UI / password managerze |
| `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` | `{"michalowice-komunikaty":"a56cfb33-a443-47aa-8365-89c6303e7fcc"}` | **nie dodawaj `wkd-aktualnosci`** — poza zakresem tej zgody |

- [ ] Wszystkie 4 zmienne dodane, scope = Preview (zweryfikowane w UI, nie Production/Development)

## Krok 6 — Kill switche (scope: **Preview only**)

| Variable | Value |
|---|---|
| `SCHEDULED_CHECKS_ENABLED` | `true` |
| `SCHEDULED_WRITES_ENABLED` | `true` |

- [ ] Oba dodane, scope = Preview
- [ ] Nowy Preview deployment wyzwolony (żeby zmienne weszły w życie)
- [ ] W Vercel dashboard widać wszystkie 6 zmiennych z badge'em "Preview" (nie "Production")

---

## Po tym bloku

Przejdź do Kroku 7 runbooku (`docs/SPRINT_148_CONTROLLED_WRITE_TEST_RUNBOOK_V1.md`)
— pojedyncze, ręczne wywołanie z jawnym `sourceKey=michalowice-komunikaty`,
nigdy bez tego parametru. Weryfikacja przez
`docs/sql/VERIFY_SPRINT_148_CONTROLLED_WRITE_TEST_READ_ONLY_V1.sql` (Krok 8),
wyłączenie `SCHEDULED_WRITES_ENABLED` po teście (Krok 9).

**Status (2026-07-11): Krok 7 wykonany, Krok 8 zweryfikowany —
CONTROLLED WRITER TEST VERIFIED ✅.** Pierwsza próba została przechwycona
przez Vercel Deployment Protection (HTML zamiast JSON, zero zapisu w
bazie — potwierdzone). Druga próba, z dodatkowym nagłówkiem
`x-vercel-protection-bypass` (osobny sekret Vercela, nigdy `CRON_SECRET`),
zakończyła się sukcesem: `candidatesInserted: 1`, `published: false`,
zweryfikowane 1:1 przez
`docs/sql/VERIFY_SPRINT_148_CONTROLLED_WRITE_TEST_SINGLE_RESULT_READ_ONLY_V1.sql`.

---

## Krok 9 — Zamknięcie testu (checklist)

- [ ] W Vercel: `SCHEDULED_WRITES_ENABLED` → `false` (lub usuń zmienną),
      scope nadal **Preview only**, gałąź
      `sprint-148-controlled-writer-preview`. `SCHEDULED_CHECKS_ENABLED`
      może zostać `true` (sam dry-run nigdy nic nie zapisuje) — ale
      bezpieczniej ustawić też `false`, jeśli nie planujesz kolejnych
      dry-runów w najbliższym czasie.
- [ ] Wyzwól nowy Preview deployment, żeby zmiana weszła w życie
      (redeploy bez zmiany kodu — sama zmienna env).
- [ ] **Decyzja o Protection Bypass secret** (rekomendacja: **usuń go
      po tym teście**). Uzasadnienie: był potrzebny wyłącznie do tego
      jednego kontrolowanego wywołania; pozostawienie go czynnym w
      Vercelu bez aktywnego przypadku użycia to niepotrzebna ekspozycja
      — ten sam "safer resting state" co przy `SCHEDULED_WRITES_ENABLED`.
      Jeśli planujesz kolejny kontrolowany test w najbliższych dniach,
      możesz go zostawić — to Twoja decyzja, nie blokuje niczego
      technicznie.
- [ ] Production: bez zmian (nic tam nigdy nie było ustawione w ramach
      Sprintu 148).
- [ ] Brak Vercel Cron, brak `vercel.json`, brak harmonogramu — potwierdzone
      ponownie w repo audycie.
