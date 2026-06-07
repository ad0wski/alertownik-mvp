# AI Draft Generator — Alertownik

Ten dokument opisuje architekturę i zasady działania generatora draftu alertu.

Last updated: June 2026 — Sprint 60: improved prompt, warnings, admin review UI

---

## Tryby działania

Generator działa w jednym z dwóch trybów, zależnie od konfiguracji serwera:

| Tryb | Warunek | Opis |
|------|---------|------|
| **mock** | brak `ANTHROPIC_API_KEY` | deterministyczne reguły słów kluczowych, bez zewnętrznych wywołań |
| **anthropic** | `ANTHROPIC_API_KEY` ustawiony | wywołanie Anthropic API server-side, model Haiku |

Tryb jest zwracany w odpowiedzi API jako pole `mode: "mock" | "anthropic"` i wyświetlany w UI jako badge po wygenerowaniu draftu.

---

## Tryb testowy (mock)

Generator nie wywołuje żadnego zewnętrznego API.
Zamiast tego stosuje deterministyczne reguły:

1. Wykrywa kategorię alertu na podstawie słów kluczowych w tekście źródłowym
   (np. „wkd" → transport, „woda" → water, „prąd" → power)
2. Wykrywa poziom ważności (info / warning / urgent) na podstawie słów kluczowych
   (np. „awaria" → urgent, „planowane" → warning)
3. Generuje tytuł z pierwszego zdania komunikatu (max 60 znaków)
4. Ustawia datę `startsAt` na dzisiaj, `endsAt` na null
5. Kopiuje pierwsze ~200 znaków komunikatu jako pole `change`
6. Dobiera generyczne pole `action` odpowiednie do kategorii
7. Zwraca `warnings: []` (w trybie mock nie generuje ostrzeżeń)

Aktywny gdy `ANTHROPIC_API_KEY` nie jest ustawiony w środowisku serwera.

---

## Tryb Anthropic API

Gdy `ANTHROPIC_API_KEY` jest ustawiony, generator wywołuje Claude API server-side.

- Model: `claude-haiku-4-5-20251001` (szybki, oszczędny kosztowo)
- Wywołanie: `POST /api/ai/draft-alert` → serwer → Anthropic API → JSON
- Klucz API nigdy nie trafia do przeglądarki

### Co robi model

Dostaje komunikat źródłowy + systemowy prompt z instrukcjami.
Zwraca obiekt JSON w schemacie `AlertDraft`.
Route waliduje wynik i normalizuje pola (kategoria, severity, daty) przed zwróceniem do UI.

### Jakość promptu (Sprint 60)

System prompt instruuje model, aby:
- Pisał prostym językiem dla mieszkańca, bez urzędowego stylu
- Zwracał `null` dla `startsAt`, jeśli data nie jest podana w komunikacie (nie zgadywał)
- Zwracał pusty string `""` dla `place`, jeśli lokalizacja nie jest podana (nie zgadywał)
- Używał `sourceName` i `sourceUrl` z metadanych wejściowych jeśli podane
- Nie wymyślał faktów

### Obsługa błędów

- Jeśli model zwróci JSON owinięty w markdown — route go wyodrębni
- Jeśli przed `{` lub po `}` jest tekst — route go przytnie
- Jeśli JSON jest niepoprawny lub brakuje pola `change` — route zwraca `{ ok: false, error: "AI zwróciło draft w nieprawidłowym formacie." }`
- Jeśli Anthropic API niedostępne — route zwraca przyjazny komunikat błędu i sugeruje ręczny prompt

---

## Walidacja i normalizacja

Po odebraniu odpowiedzi z AI route wykonuje:

1. **Ekstrakcja JSON** — usuwa markdown code fences i/lub otaczający tekst
2. **Parse JSON** — `JSON.parse()` w bloku try/catch
3. **Normalizacja kategorii** — jeśli AI podał nieprawidłową wartość, używa sugerowanej lub "municipal"
4. **Normalizacja severity** — mapuje aliasy ("critical" → "urgent", "uwaga" → "warning") via `normalizeAlertSeverity()`; jeśli nierozpoznane, używa wykrywania słów kluczowych
5. **Sanityzacja pól tekstowych** — trim, max długość tytułu, fallback dla pustych pól
6. **Walidacja wymaganych pól** — `change` jest jedynym polem powodującym twardy błąd jeśli puste
7. **Generowanie ostrzeżeń** — sprawdza co wymagało wypełnienia przez system a nie AI

Wymagane pola w drafcie (brak powoduje twardy błąd):
- `change` — bez opisu zmiany draft jest bezużyteczny

Pola z fallbackiem (brak nie powoduje błędu, ale może wygenerować ostrzeżenie):
- `category` → "municipal"
- `severity` → wykrywanie słów kluczowych
- `title` → "Alert lokalny"
- `action` → domyślna wskazówka dla kategorii
- `sourceName` → wartość z danych wejściowych lub pusty string + ostrzeżenie
- `startsAt` → dzisiejsza data + ostrzeżenie
- `place` → pusty string + ostrzeżenie

---

## Ostrzeżenia (warnings)

Po wygenerowaniu draftu route zwraca tablicę `warnings: string[]`.
Ostrzeżenia informują admina, które pola wymagają ręcznej weryfikacji.

Ostrzeżenia są generowane gdy:

| Warunek | Ostrzeżenie |
|---------|-------------|
| AI nie podało daty `startsAt` | "Brakuje dokładnej daty — uzupełnij datę w Kreatorze przed publikacją." |
| AI nie podało lokalizacji `place` | "Brakuje dokładnej lokalizacji — uzupełnij miejsce w Kreatorze." |
| Kategoria to `transport` | "Sprawdź, czy trasa i kierunek przejazdu są poprawne." |
| Brak `sourceName` po fallbacku | "Brakuje nazwy źródła — uzupełnij je w Kreatorze przed publikacją." |

Ostrzeżenia nie blokują generowania draftu — admin może go wysłać do Kreatora.
W trybie mock ostrzeżenia nie są generowane (`warnings: []`).

---

## Admin review flow

Po wygenerowaniu draftu UI wyświetla:

1. **Badge trybu** — "Tryb: Claude API" lub "Tryb: testowy"
2. **Raw JSON** — pełny wygenerowany draft z przyciskiem "Kopiuj JSON"
3. **Podgląd alertu** — czytelna karta z polami: Tytuł, Kategoria, Ważność, Kiedy, Gdzie, Co się zmienia, Co zrobić, Źródło
4. **Ostrzeżenia** (jeśli są) — lista "Do sprawdzenia przed publikacją"
5. **Przycisk "Wczytaj draft do Kreatora"** — przekazuje draft do Buildera przez sessionStorage

Admin musi w Kreatorze:
- Uzupełnić brakujące daty i lokalizacje
- Zweryfikować treść względem oryginalnego komunikatu
- Kliknąć "Opublikuj w Supabase" — alert nie publikuje się automatycznie

---

## Architektura

### API route

```
src/app/api/ai/draft-alert/route.ts
```

- Przyjmuje: `POST /api/ai/draft-alert`
- Wejście (JSON body):
  ```json
  {
    "sourceText":        "string (wymagane)",
    "sourceName":        "string (opcjonalne)",
    "sourceUrl":         "string (opcjonalne)",
    "suggestedCategory": "string (opcjonalne)"
  }
  ```
- Wyjście (sukces):
  ```json
  {
    "ok": true,
    "draft": {
      "category":   "transport | water | power | waste | roads | municipal",
      "severity":   "info | warning | urgent",
      "title":      "string (max ~60 znaków)",
      "slug":       "string",
      "place":      "string (może być pusty — admin musi uzupełnić)",
      "startsAt":   "YYYY-MM-DD (fallback: dzisiaj jeśli AI nie podało)",
      "endsAt":     "YYYY-MM-DD | null",
      "change":     "string",
      "action":     "string",
      "sourceName": "string",
      "sourceUrl":  "string | null"
    },
    "mode": "mock | anthropic",
    "warnings": ["string", "..."]
  }
  ```
- Wyjście (błąd):
  ```json
  { "ok": false, "error": "opis błędu" }
  ```

### Przepływ danych

```
AI Helper (formularz)
  ↓  POST /api/ai/draft-alert
API route (server-side)
  ↓  jeśli ANTHROPIC_API_KEY: wywołanie Anthropic API
  ↓  jeśli brak klucza: mock
  ↓  JSON draft + mode + warnings[]
AI Helper (wyświetla: badge trybu, JSON, podgląd, ostrzeżenia, przycisk "Wczytaj")
  ↓  sessionStorage["alertownik_pending_ai_alert_json"]
Builder (wczytuje formularz z sessionStorage, admin edytuje i weryfikuje)
  ↓  admin klika "Opublikuj w Supabase"
Supabase (alert publikowany)
```

---

## Zmienne środowiskowe

| Nazwa | Opis | Wymagana |
|-------|------|----------|
| `ANTHROPIC_API_KEY` | Klucz Anthropic API — server-only | Nie (bez niej: tryb mock) |

### Konfiguracja w Vercel

1. Wejdź w Vercel → Project → Settings → Environment Variables
2. Dodaj `ANTHROPIC_API_KEY` z wartością klucza
3. Zaznacz środowiska: Production + Preview (nie jest potrzebne lokalnie do pilota)
4. Redeploy po dodaniu zmiennej

### Konfiguracja lokalna (opcjonalnie)

Dodaj do `.env.local` (nigdy nie commituj tego pliku):
```
ANTHROPIC_API_KEY=sk-ant-...
```

**WAŻNE:** Nigdy nie używaj prefiksu `NEXT_PUBLIC_` — to wystawiłoby klucz do przeglądarki.

---

## Zasady bezpieczeństwa

1. **Admin zawsze weryfikuje draft przed publikacją** — nie ma przycisku „Generuj i publikuj od razu".
2. **Nie publikuj automatycznie** — Builder wymaga jawnego kliknięcia „Opublikuj w Supabase".
3. **Klucze API nigdy nie trafiają na frontend** — wszystkie wywołania Anthropic są wyłącznie server-side.
4. **Nie używaj `NEXT_PUBLIC_ANTHROPIC_API_KEY`** — ten prefiks eksponuje zmienną do przeglądarki.
5. **Route `/api/ai/draft-alert` nie wymaga auth** w obecnej wersji (nie wywołuje nic kosztownego bez klucza).
   Gdy API key jest aktywny w produkcji, warto dodać weryfikację sesji Supabase w handlerze.

---

## Plan kolejnych kroków (opcjonalne)

- Dodać weryfikację sesji Supabase w `/api/ai/draft-alert` gdy klucz jest aktywny w prod
- Dodać rate limiting (max N wywołań na sesję) by uniknąć nadużyć
- Rozważyć Sonnet zamiast Haiku dla trudniejszych komunikatów

---

## Istniejący manualny workflow (pozostaje bez zmian)

Sekcja „Ręczny workflow: prompt do ChatGPT / Claude" na stronie AI Helper jest zachowana jako fallback.
Admin może nadal:
1. Skopiować prompt → wkleić do ChatGPT lub Claude
2. Skopiować wynikowy JSON → wkleić w polu „Odpowiedź AI"
3. Kliknąć „Wczytaj do Kreatora"

Ten workflow zostaje **na stałe** jako backup — zarówno gdy klucz nie jest skonfigurowany, jak i gdy AI API nie jest dostępne.
