# AI Draft Generator — Alertownik

Ten dokument opisuje architekturę i zasady działania generatora draftu alertu.

Last updated: June 2026

---

## Stan obecny: tryb testowy (mock)

Generator działa w trybie testowym. **Nie wywołuje żadnego zewnętrznego API AI.**
Zamiast tego stosuje proste deterministyczne reguły, aby zademonstrować przepływ danych.

### Co robi mock generator

1. Wykrywa kategorię alertu na podstawie słów kluczowych w tekście źródłowym
   (np. „wkd" → transport, „woda" → water, „prąd" → power)
2. Wykrywa poziom ważności (info / warning / urgent) na podstawie słów kluczowych
   (np. „awaria" → urgent, „planowane" → warning)
3. Generuje tytuł z pierwszego zdania komunikatu (max 60 znaków)
4. Ustawia datę `startsAt` na dzisiaj, `endsAt` na null
5. Kopiuje pierwsze ~200 znaków komunikatu jako pole `change` (do ręcznej weryfikacji)
6. Dobiera generyczne pole `action` odpowiednie do kategorii

### Czego mock NIE robi (i co będzie w Milestone B)

- Nie rozumie kontekstu — przetwarza tylko słowa kluczowe
- Nie generuje opisu `change` ani `action` z prawdziwą treścią — tylko szkic
- Nie wyciąga lokalizacji — admin **musi** uzupełnić pole `place` ręcznie
- Nie wyciąga dat — admin **musi** sprawdzić i ustawić `startsAt` / `endsAt`

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
      "place":      "(pusty — admin musi uzupełnić)",
      "startsAt":   "YYYY-MM-DD",
      "endsAt":     null,
      "change":     "string (fragment komunikatu, do weryfikacji)",
      "action":     "string (generyczny, do weryfikacji)",
      "sourceName": "string",
      "sourceUrl":  "string | null"
    },
    "mock": true
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
API route (server-side, bez zewnętrznych SDK)
  ↓  JSON draft
AI Helper (wyświetla draft, przycisk "Wczytaj draft do Kreatora")
  ↓  sessionStorage["alertownik_pending_ai_alert_json"]
Builder (wczytuje formularz z sessionStorage, admin edytuje)
  ↓  admin klika "Opublikuj w Supabase"
Supabase (alert publikowany)
```

---

## Zasady bezpieczeństwa

1. **Admin zawsze weryfikuje draft przed publikacją** — nie ma przycisku „Generuj i publikuj od razu".
2. **Klucze API nigdy nie trafiają na frontend** — wszystkie wywołania zewnętrznego AI będą wyłącznie server-side.
3. **Klucz API AI nie jest jeszcze dodany** — mock nie wymaga żadnych zewnętrznych credencjali.
4. **Route `/api/ai/draft-alert` nie wymaga auth** w obecnej wersji, bo nie wywołuje żadnego płatnego API.
   W momencie dodania prawdziwego AI API należy dodać weryfikację sesji Supabase w handlerze.
5. **Nie dodawać klucza `ANTHROPIC_API_KEY` ani `OPENAI_API_KEY` do `.env.local` ani Vercel** do czasu, gdy sprint B jest gotowy do testu.

---

## Planowane zmienne środowiskowe (tylko nazwy — bez wartości)

| Nazwa | Opis | Kiedy |
|-------|------|-------|
| `AI_PROVIDER` | Wybrany dostawca: `anthropic` lub `openai` | Milestone B |
| `ANTHROPIC_API_KEY` | Klucz Anthropic API | Milestone B |
| `AI_DRAFT_MODEL` | Model do generowania (np. `claude-haiku-4-5`) | Milestone B |

Te zmienne **nie istnieją jeszcze** w żadnym środowisku.
Zostaną dodane w Vercel jako tajne zmienne środowiskowe — nigdy w kodzie źródłowym.

---

## Plan Milestone B — prawdziwe API AI

Gdy będziemy gotowi podłączyć prawdziwe API:

1. Dodać Anthropic SDK (`@anthropic-ai/sdk`) lub OpenAI SDK jako zależność
2. Wczytać `ANTHROPIC_API_KEY` po stronie serwera (nie w przeglądarce)
3. Zastąpić logikę mock w `route.ts` prawdziwym wywołaniem API
4. Zachować ten sam format wyjściowy (interfejs `AlertDraft`) — Builder i AI Helper nie wymagają zmian
5. Dodać rate limiting (np. max 10 wywołań na sesję) — by uniknąć nadużyć
6. Dodać weryfikację sesji Supabase w handlerze
7. Zaktualizować ten dokument

### Prompt, który zostanie użyty

Istniejący prompt z `buildPrompt()` w `src/app/ai-helper/page.tsx` jest gotowy.
W Milestone B zostanie przeniesiony do warstwy serwera i przekazany do API AI jako system/user prompt.

---

## Istniejący manualny workflow (pozostaje bez zmian)

Sekcja „Ręczny workflow: prompt do ChatGPT / Claude" na stronie AI Helper jest zachowana jako fallback.
Admin może nadal:
1. Skopiować prompt → wkleić do ChatGPT lub Claude
2. Skopiować wynikowy JSON → wkleić w polu „Odpowiedź AI"
3. Kliknąć „Wczytaj do Kreatora"

Ten workflow zostaje **na stałe** jako backup, nawet po podłączeniu prawdziwego API.
