# data/waste — ręczna transkrypcja harmonogramu odpadów

Sprint 122. Ten katalog przechowuje **ręcznie przepisane, zweryfikowane**
dane harmonogramu odbioru odpadów w drodze do importu — nigdy dane
zgadywane, generowane ani pobierane automatycznie.

## Workflow (Komorów, zabudowa jednorodzinna — pierwszy import)

1. Otwórz oficjalny PDF Gminy Michałowice w przeglądarce:
   `https://www.michalowice.pl/files/307953978/file/harmonogram_jednorodzinna_final3.pdf`
   (harmonogram na 2026, ważny 1.01–31.12.2026; strona-matka:
   `https://www.michalowice.pl/ochrona-srodowiska/odbior-odpadow/nowy-harmonogram-odbioru-odpadow-komunalnych`).
2. Skopiuj `komorow-waste-schedule-template.csv` do nowego pliku, np.
   `komorow-2026-batch-1.csv`, i przepisz **tylko Komorów** i tylko
   najbliższe 4–8 tygodni (mały, weryfikowalny pakiet — nie cały rok).
3. Każdy wiersz: data przepisana 1:1 z PDF (żadnego „co dwa tygodnie"),
   `notes` z datą weryfikacji.
4. Konwersja do JSON importu (`/admin/waste` → „Import z JSON"):
   - poproś Claude Code o konwersję wypełnionego CSV (sesja lokalna), albo
   - przepisz ręcznie wg `docs/waste-schedule-import-template.md`.
   Mapowanie kolumn CSV → pól JSON: `area_name` → `areaName`,
   `street_group` → `streetGroup`, `waste_type` → `wasteType`,
   `collection_date` → `collectionDate`, `source_name` → `sourceName`,
   `source_url` → `sourceUrl` (reszta 1:1).
5. W `/admin/waste` przejrzyj podgląd i ostrzeżenia (duplikaty, przeszłe
   daty, brak źródła) → dopiero wtedy „Zaimportuj".
6. Sprawdź `/odpady` w oknie incognito — tak, jak zobaczy je mieszkaniec.

Alternatywa SQL: `docs/sprint122_komorow_waste_seed_proposal.sql`
(szablon INSERT z placeholderami — RUN ONLY AFTER DATES ARE VERIFIED
AGAINST OFFICIAL PDF).

## Twarde zasady

- **Żadnych zmyślonych dat** — każda data pochodzi z realnie otwartego
  oficjalnego dokumentu i jest przepisana, nie wywnioskowana.
- **Żadnych dokładnych adresów** — locality / strefa / zakres ulic.
- **Import zawsze ręczny** — podgląd + kliknięcie człowieka; Claude Code
  niczego nie wstawia do bazy.
- Wypełnione pliki CSV w tym katalogu zawierają wyłącznie publiczne dane
  urzędowe (terminy odbioru) — bez żadnych danych osobowych.
