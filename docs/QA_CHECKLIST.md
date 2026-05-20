# QA Checklist

Use this checklist before a demo, review session, or Vercel deployment. Mark each item as you go.

The app UI is in **Polish**. All label and button text referenced below uses the Polish strings as they appear in the UI.

---

## Pre-Demo Setup

- [ ] Open the app in a clean browser tab (or incognito) to avoid stale localStorage state
- [ ] Check that the Vercel deployment is live and accessible
- [ ] Check that the page loads without console errors (open browser DevTools → Console)
- [ ] If demoing the Builder, clear old test drafts first (Builder → "Zapisane drafty" → Usuń each one)

---

## Homepage (`/`)

- [ ] Hero section is visible: heading + subtitle + category chips (Transport, Awarie, Komunikaty lokalne)
- [ ] Alert list loads with 6 sample alerts visible
- [ ] Each alert card shows: severity badge, category badge, title, location, date
- [ ] "Wszystkie" filter is active by default
- [ ] Filter counter displays the correct count (e.g. "Wszystkich alertów: 6")
- [ ] Page is readable and correctly laid out on desktop

---

## Category Filters

- [ ] Clicking **Transport** shows only transport alerts
- [ ] Clicking **Woda** shows only water alerts
- [ ] Clicking **Wszystkie** resets to all alerts
- [ ] Counter updates correctly after each filter change
- [ ] Selecting a category with no matching alerts shows the empty state message ("Brak alertów w tej kategorii")

---

## Alert Card — Inline Details

- [ ] Clicking **Szczegóły ▼** expands the card in place
- [ ] Expanded view shows: Kiedy, Gdzie, Co się zmienia, Co zrobić, Źródło
- [ ] Source name and link are visible in the expanded section
- [ ] Clicking **Ukryj szczegóły ▲** collapses the card
- [ ] **Otwórz alert →** link is visible and navigates to the correct detail page

---

## Alert Detail Page (`/alerts/[slug]`)

- [ ] Opens correctly from a card link
- [ ] Shows correct title, category badge, severity badge
- [ ] Shows correct location and date range
- [ ] Detail rows visible: Kiedy, Gdzie, Co się zmienia, Co zrobić, Źródło
- [ ] "Zobacz źródło →" link opens the correct URL in a new tab (if source URL exists)
- [ ] "← Wróć do listy alertów" link returns to homepage
- [ ] Navigating directly to `/alerts/[slug]` (without going through the list) works correctly

---

## Builder (`/builder`)

- [ ] Page loads without errors
- [ ] "Narzędzie robocze MVP" badge is visible next to the page title
- [ ] **JSON Import**: paste a valid JSON object → click "Wczytaj JSON do formularza" → form fields populate correctly
- [ ] **JSON Import**: paste invalid JSON → error message appears ("Nie udało się wczytać JSON")
- [ ] **Form**: all fields accept input (category, severity, title, location, dates, change, action, source)
- [ ] **Live preview** panel updates as the form is filled in
- [ ] **Save draft**: click "Zapisz jako draft" → success message appears → draft appears in "Zapisane drafty" list
- [ ] **Load draft**: click "Wczytaj" on a draft → form repopulates with draft data
- [ ] **Delete draft**: click "Usuń" on a draft → draft is removed from the list
- [ ] **Publish locally**: click "Opublikuj lokalnie" → success message → alert appears in the homepage list
- [ ] **Delete published**: click "Usuń" on a locally published alert → alert removed from list and homepage
- [ ] **JSON output** block shows valid JSON for the current form state
- [ ] **Copy JSON** button copies content to clipboard and shows "Skopiowano ✓" confirmation

---

## AI Helper (`/ai-helper`)

- [ ] Page loads without errors
- [ ] "Narzędzie robocze MVP" badge is visible next to the page title
- [ ] Raw text textarea is visible and accepts input
- [ ] Source name and source URL fields accept input
- [ ] Category dropdown shows all options (AI dobierze automatycznie + 6 categories)
- [ ] **Generated prompt** section updates as input fields change
- [ ] Prompt includes the pasted raw text when provided
- [ ] Prompt includes source name and URL when provided
- [ ] **Copy prompt** button copies the prompt to clipboard and shows "Skopiowano ✓" confirmation
- [ ] Links to ChatGPT and Claude are present and open in a new tab

---

## Mobile (≤375px — e.g. iPhone SE viewport)

- [ ] Header: app name, brand icon, and all nav links are visible without horizontal overflow
- [ ] Hero section: heading and chips wrap cleanly, no clipping
- [ ] Filter pills wrap to multiple rows without overflow
- [ ] Alert cards fill full width and are readable
- [ ] "Szczegóły ▼" and "Otwórz alert →" buttons are tappable (not too small)
- [ ] Detail rows (Kiedy, Gdzie, etc.) stack vertically and are readable
- [ ] Builder form fields stack to single column on mobile
- [ ] AI Helper form stacks correctly on mobile

---

## Vercel Deployment

- [ ] App loads at `https://alertownik-mvp.vercel.app/`
- [ ] Homepage alert list is visible
- [ ] Category filters work
- [ ] Alert detail page at `/alerts/zmiana-trasy-wkd-linia-w1` (or another slug) loads correctly
- [ ] Builder at `/builder` loads correctly
- [ ] AI Helper at `/ai-helper` loads correctly
- [ ] No 404 errors on initial page load

---

## localStorage Behaviour

> **Note:** localStorage data is stored per browser, per device, and per origin. It is not shared between different browsers or different users.

- [ ] Locally published alerts appear on the homepage **only in the browser where they were published**
- [ ] Clearing browser data (or opening incognito) removes all locally published alerts and drafts
- [ ] Refreshing the page preserves locally published alerts and drafts
- [ ] Navigating away and returning preserves the same data
