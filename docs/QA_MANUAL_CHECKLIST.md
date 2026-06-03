# QA Manual Checklist — Alertownik MVP

Use this checklist before committing a sprint, before a demo, or before a Vercel deployment.
Mark each item as you go. The app UI is in Polish — labels below match the actual UI strings.

---

## 0. Automated Pre-Check

Run this first. It must pass before doing any manual testing.

```bash
npm run check
```

This runs `typecheck → lint → build` in sequence. If any step fails, fix the error before continuing.

One known warning (`react-hooks/exhaustive-deps` in `builder/page.tsx`) is expected — it is not an error and does not fail the check.

See `docs/AUTOMATED_CHECKS.md` for details on what each step covers and what it does not test.

---

## 1. Public Homepage (`/`)

- [ ] Page loads without console errors (DevTools → Console)
- [ ] Alert list shows published alerts from Supabase
- [ ] Each card shows: severity badge, category badge, title, location, date range
- [ ] "Wszystkich alertów: N" counter is correct
- [ ] Alert cards expand inline to show full detail (Kiedy, Gdzie, Co się zmienia, Co zrobić, Źródło)
- [ ] "Otwórz alert →" link navigates to the correct `/alerts/[slug]` URL

### Search

- [ ] Typing in the search field filters the list live
- [ ] "Wyczyść" button clears the search input
- [ ] Counter updates to show "Znaleziono alertów: N"
- [ ] No alerts matching query → empty state message appears

### Category filters

- [ ] Each category pill (Transport, Woda, Prąd, Odpady, Drogi, Komunikaty) filters correctly
- [ ] Active pill is visually highlighted (blue background)
- [ ] "Wszystkie" resets the filter
- [ ] Counter reflects the filtered count

### Moje alerty (user preferences)

- [ ] "Wszystkie alerty" / "Moje alerty" toggle is visible
- [ ] Switching to "Moje alerty" without saved preferences shows "Nie ustawiono jeszcze preferencji."
- [ ] Preferences form shows: location keyword input + category toggles + "Zapisz preferencje" button
- [ ] Saving preferences shows "Preferencje zapisane na tym urządzeniu."
- [ ] Saved preferences persist after page refresh (localStorage)
- [ ] "Moje alerty" mode filters alerts by saved location and category
- [ ] Blue dot indicator appears on "Moje alerty" button when prefs are saved but mode is "all"
- [ ] "Wyczyść preferencje" clears saved prefs and resets the form

---

## 2. Alert Detail Page (`/alerts/[slug]`)

- [ ] Navigates correctly from the homepage card link
- [ ] Title, category badge, severity badge visible
- [ ] Correct location and date range shown
- [ ] "Kiedy", "Gdzie", "Co się zmienia", "Co zrobić", "Źródło" rows all present
- [ ] "Zobacz źródło →" opens source URL in a new tab (if source URL is set)
- [ ] "← Wróć do listy alertów" returns to homepage
- [ ] Direct navigation to `/alerts/[slug]` without going through the list works
- [ ] Non-existent slug shows 404 state, not a blank page

---

## 3. Admin Login (`/login`)

- [ ] Login form loads
- [ ] Valid credentials → redirect to `/admin`
- [ ] Invalid credentials → error message in Polish
- [ ] After login, admin nav links appear in the header
- [ ] After logout, redirected to login page and admin pages are no longer accessible

---

## 4. Admin Dashboard (`/admin`)

- [ ] Auth-gated: visiting without a session shows "Zaloguj się" prompt
- [ ] "Statystyki alertów" shows correct counts (Wszystkie, Opublikowane, Drafty, Zarchiwizowane)
- [ ] "Źródła do sprawdzenia" section shows count of active sources not checked today
- [ ] When count > 0: amber number and "aktywnych źródeł nie sprawdzonych dziś"
- [ ] When count = 0: green "0" and "Wszystkie aktywne źródła sprawdzone dziś"
- [ ] "Ostatnie sprawdzenia" list shows up to 3 recent check entries with: source name, result label, date
- [ ] "Przejdź do źródeł →" button links to `/admin/sources`
- [ ] "Ostatnio zmienione alerty" section shows the 5 most recently changed alerts
- [ ] Each alert row shows: status badge, category, title, last-changed date
- [ ] "Edytuj w kreatorze" links to `/builder?edit=[slug]`
- [ ] "Otwórz alert" (for published alerts) opens the public detail page
- [ ] "Szybkie akcje" grid links work: Kreator, AI Helper, Źródła, Publiczna lista

---

## 5. Builder (`/builder`)

- [ ] Auth-gated
- [ ] Blank form loads for new alert creation
- [ ] All fields accept input: category, severity, title, location, dates, change, action, source name, source URL
- [ ] Live preview updates as fields change
- [ ] "Zapisz jako draft" saves to Supabase with status=draft
- [ ] "Opublikuj" saves to Supabase with status=published and appears on public homepage
- [ ] "Zarchiwizuj" changes status to archived (alert disappears from public homepage)
- [ ] "Przywróć" changes archived alert back to published
- [ ] "Wyczyść formularz" resets all fields
- [ ] **Edit mode** (`/builder?edit=[slug]`): form pre-populates with existing alert data
- [ ] Saving in edit mode updates the existing alert (not creates a duplicate)
- [ ] **AI Helper → Builder**: after pasting JSON in AI Helper and clicking "Wczytaj do Kreatora", Builder opens with all fields populated
- [ ] Alert count on dashboard updates after publish/archive

---

## 6. AI Helper (`/ai-helper`)

- [ ] Auth-gated
- [ ] Page loads with empty form
- [ ] Textarea "Wklej komunikat źródłowy" accepts text
- [ ] "Nazwa źródła" and "Link do źródła" accept input
- [ ] Category dropdown shows all options
- [ ] "Wygenerowany prompt" preview updates live as inputs change
- [ ] When raw text is empty: prompt shows placeholder "(wklej komunikat źródłowy w polu powyżej)"
- [ ] When raw text is filled: prompt includes the text under "## Komunikat źródłowy"
- [ ] "Kopiuj prompt" button copies and shows "Skopiowano ✓"
- [ ] **Source loaded (green banner)**: when navigated from "Przygotuj alert" on a source card, source fields are pre-filled and green banner is shown
- [ ] **Check loaded (blue banner)**: when navigated from "Przygotuj alert w AI Helperze →" after saving a check with notice text, the notice text is in the textarea and a blue banner is shown
- [ ] Pasting valid JSON in "Odpowiedź AI" → "JSON wygląda poprawnie."
- [ ] Pasting invalid JSON → "Nie udało się odczytać JSON."
- [ ] "Wczytaj do Kreatora" with valid JSON → navigates to `/builder` with alert pre-filled
- [ ] "Wczytaj do Kreatora" with invalid JSON → shows error, does not navigate

---

## 7. Sources (`/admin/sources`)

- [ ] Auth-gated
- [ ] Source list loads with all sources
- [ ] Each card shows: name, monitoring status badge, category, type, URL, last-checked date
- [ ] Monitoring status badges:
  - "Do sprawdzenia" (amber) = active, never checked or not checked today
  - "Sprawdzone dziś" (green) = active, checked today
  - "Ostatnio sprawdzone" (slate) = active, checked before today
  - "Nieaktywne" (gray) = `isActive = false`
- [ ] "N do sprawdzenia" badge in page header appears when sources need checking
- [ ] **Search**: filtering by name/URL/notes/category works live
- [ ] **Status filters**: Wszystkie / Aktywne / Nieaktywne / Do sprawdzenia / Sprawdzone dziś work correctly
- [ ] **Category dropdown** filter works
- [ ] "Wyświetlane źródła: X z Y" counter updates correctly
- [ ] **Add source**: "+ Dodaj źródło" opens form; submitting creates source in Supabase
- [ ] **Edit**: "Edytuj" opens inline edit form; saving updates source in Supabase
- [ ] **Toggle active**: "Wyłącz"/"Włącz" changes isActive; card opacity changes
- [ ] **Delete**: shows confirm dialog; deletes source in Supabase
- [ ] **"Przygotuj alert"**: opens AI Helper with source pre-filled (green banner)
- [ ] **"Otwórz źródło ↗"**: opens source URL in new tab

### Source check history panel

- [ ] "Historia ↓" button in card footer toggles the check panel
- [ ] Panel shows "Brak historii sprawdzeń." when no checks exist
- [ ] Result dropdown shows: Brak zmian / Znaleziono komunikat / Przygotowano alert / Wymaga późniejszego sprawdzenia
- [ ] When result is "Znaleziono komunikat", "Przygotowano alert", or "Wymaga późniejszego sprawdzenia": "Treść komunikatu lub link do komunikatu" textarea appears
- [ ] "Zapisz wynik sprawdzenia" creates a row in source_checks and updates last_checked_at
- [ ] Success message "Wynik sprawdzenia zapisany." appears
- [ ] After saving "Znaleziono komunikat": green "Przygotuj alert w AI Helperze →" button appears
- [ ] Clicking green button: navigates to AI Helper with blue banner and notice text pre-filled in textarea
- [ ] History list shows last 3 checks with: result label (coloured), date, notes
- [ ] "Przygotuj alert →" link appears on "Znaleziono komunikat" and "Wymaga późniejszego sprawdzenia" history rows
- [ ] "Oznacz jako sprawdzone" quick button: marks source as checked with result "Brak zmian", updates last_checked_at, adds row to source_checks

---

## 8. Supabase Data Integrity

- [ ] Publishing an alert in Builder → appears on public homepage immediately
- [ ] Archiving an alert → disappears from public homepage, still visible in admin dashboard
- [ ] Restoring an archived alert → reappears on public homepage
- [ ] Editing an alert via `/builder?edit=[slug]` → changes reflected on public homepage and detail page
- [ ] Source check row appears in Supabase Table Editor (source_checks) after saving
- [ ] `last_checked_at` on alert_sources updates after any check is saved

---

## 9. Mobile Viewport (≤390px)

- [ ] Header: logo + mobile menu button visible, no overflow
- [ ] Hamburger menu opens and shows all admin nav links
- [ ] Hamburger menu closes on navigation
- [ ] Homepage: alert cards full-width, readable
- [ ] Category filters scroll horizontally on mobile
- [ ] Alert detail: all sections readable, no horizontal overflow
- [ ] Builder: form fields stack to single column
- [ ] AI Helper: prompt preview does not overflow
- [ ] Sources: cards full-width, action buttons wrap cleanly
- [ ] Source check panel: form usable on mobile

---

## 10. Vercel Deployment

- [ ] Push or merge to main triggers Vercel build
- [ ] Build succeeds (check Vercel dashboard)
- [ ] Public homepage loads at `https://alertownik-mvp.vercel.app/`
- [ ] Published alerts from Supabase appear on the live site
- [ ] Admin login works on the live site
- [ ] No 404 errors on initial page loads
- [ ] `/manifest.webmanifest` returns valid JSON
- [ ] No console errors on the live deployment

---

## Pre-Commit Checklist

- [ ] `npm run build` passes locally with zero TypeScript errors
- [ ] No `.env.local` in the commit (`git status` check)
- [ ] No service_role key in any source file (`git grep service_role`)
- [ ] The specific feature being committed has been tested manually
- [ ] Public alert browsing still works
- [ ] Admin tools still protected (unauthenticated visit redirects to login)
