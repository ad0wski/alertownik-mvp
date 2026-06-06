# Pilot Readiness Checklist — Alertownik MVP

Use this checklist before running a demo or inviting pilot users.
Check each item manually unless marked with `[auto]`.

Last updated: June 2026

---

## 1. Testy automatyczne `[auto]`

- [ ] `npm run check` przechodzi bez błędów (typecheck + lint + build)
- [ ] `npm run test:e2e` przechodzi — strona główna ładuje się, alerty się wyświetlają
- [ ] Brak nowych błędów TypeScript w konsoli buildu

---

## 2. Publiczna strona główna

- [ ] Lista alertów ładuje się z Supabase
- [ ] Każda karta alertu pokazuje tytuł, kategorię, poziom ważności, miejsce, daty
- [ ] Filtry kategorii działają (Transport, Woda, Prąd, Odpady, Drogi, Komunikaty)
- [ ] Wyszukiwanie po tytule/miejscu działa
- [ ] Tryb „Moje alerty" — zapisywanie i wczytywanie preferencji działa
- [ ] Stan pusty (brak alertów / brak wyników) wyświetla czytelny komunikat
- [ ] Skeleton ładowania pojawia się przy wolnym połączeniu
- [ ] Błąd połączenia z serwerem wyświetla czytelny komunikat

---

## 3. Strona szczegółów alertu

- [ ] Wejście na `/alerts/[slug]` działa dla opublikowanych alertów
- [ ] Pola: Kiedy, Gdzie, Co się zmienia, Co zrobić, Źródło — wszystkie widoczne
- [ ] Przycisk „Wróć do listy alertów" działa
- [ ] Alert nieznaleziony — strona 404 wyświetla czytelny komunikat

---

## 4. Mobile / PWA

- [ ] Strona główna ładuje się na telefonie (Chrome/Safari)
- [ ] Nagłówek nie zakrywa treści
- [ ] Karty alertów są czytelne na ekranie 375px
- [ ] Filtry kategorii przewijają się poziomo na mobile
- [ ] Strona szczegółów alertu jest czytelna na mobile
- [ ] PWA: można dodać do ekranu głównego (opcjonalnie, sprawdź manifest)

---

## 5. Logowanie admina

- [ ] Strona `/login` ładuje się
- [ ] Logowanie poprawnym hasłem przenosi do `/admin`
- [ ] Logowanie błędnym hasłem wyświetla komunikat o błędzie
- [ ] Po wylogowaniu użytkownik wraca na `/`

---

## 6. Panel admina (`/admin`)

- [ ] Statystyki alertów (wszystkie / opublikowane / drafty / zarchiwizowane) wyświetlają prawidłowe liczby
- [ ] Liczba źródeł do sprawdzenia dziś wyświetla się poprawnie
- [ ] Ostatnie sprawdzenia źródeł wyświetlają się w sekcji
- [ ] Lista ostatnio zmienionych alertów wyświetla się poprawnie
- [ ] Linki do Kreatora, AI Helpera, Źródeł działają

---

## 7. Kreator alertu (`/builder`)

- [ ] Formularz ładuje się po zalogowaniu
- [ ] Można uzupełnić wszystkie pola i zobaczyć podgląd karty
- [ ] „Zapisz jako draft w Supabase" działa — alert pojawia się na liście poniżej
- [ ] „Opublikuj w Supabase" działa — alert jest widoczny publicznie
- [ ] Alert z AI Helpera wczytuje się do formularza
- [ ] Wczytanie alertu z listy Supabase do edycji działa
- [ ] Archiwizacja alertu działa
- [ ] Przywrócenie alertu jako draft działa

---

## 8. AI Helper (`/ai-helper`)

- [ ] Strona ładuje się po zalogowaniu
- [ ] Wypełnienie komunikatu źródłowego generuje prompt
- [ ] Kopiowanie promptu do schowka działa
- [ ] Wklejenie JSON z ChatGPT/Claude i walidacja działa
- [ ] „Wczytaj do Kreatora" przekazuje dane do Kreatora
- [ ] Przepływ Źródła → AI Helper (banner z informacją) działa

---

## 9. Źródła (`/admin/sources`)

- [ ] Lista źródeł ładuje się po zalogowaniu
- [ ] Dodawanie nowego źródła działa
- [ ] Edycja istniejącego źródła działa
- [ ] Oznaczanie źródła jako sprawdzone działa
- [ ] Historia sprawdzeń jest widoczna przy źródle
- [ ] Przycisk „Przygotuj alert" przy wpisie z komunikatem otwiera AI Helpera
- [ ] Filtry statusu i kategorii działają

---

## 10. Dane w Supabase

- [ ] W bazie są co najmniej 2–3 opublikowane alerty demonstracyjne
- [ ] Alerty mają wypełnione wszystkie pola (tytuł, miejsce, daty, zmiana, działanie, źródło)
- [ ] Stare alerty testowe (tytuły w stylu „test", „asdf") są zarchiwizowane
- [ ] W bazie nie ma danych osobowych ani testowych danych prywatnych
- [ ] RLS: publiczny użytkownik widzi tylko alerty `status = 'published'`

---

## 11. Wdrożenie (Vercel)

- [ ] Aplikacja działa na https://alertownik-mvp.vercel.app/
- [ ] Brak błędów 500 w logach Vercel
- [ ] Zmienne środowiskowe (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) są ustawione w Vercel
- [ ] Ostatni deploy jest z aktualnego kodu na gałęzi `main`

---

## 12. Czego jeszcze nie ma (nie obiecuj pilotom)

- Automatyczne sprawdzanie źródeł (scraping / RSS) — sprawdzanie jest ręczne
- Powiadomienia push / email — w planie Milestone E
- Konta użytkowników / rejestracja — każdy zalogowany ma pełny dostęp admina
- Wielojęzyczność — aplikacja jest po polsku
- Moderacja / zatwierdzanie alertów przez więcej niż jedną osobę
