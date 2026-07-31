# Checklista TalkBack na Androidzie — dla przyszłego testera

**Nie wykonano.** Ten dokument to przygotowana checklista dla
przyszłego testera z telefonem Android — nikt jeszcze nie przeprowadził
tego testu. Nie twierdzimy, że Alertownik "przeszedł test TalkBack" —
dopóki ktoś realnie nie zaznaczy poniższych punktów, status pozostaje
"do zrobienia".

Adres testowy: `https://alertownik-mvp.vercel.app` (Chrome na Androidzie).

---

## Gdzie włączyć TalkBack

Ustawienia → Ułatwienia dostępu → TalkBack → włącz przełącznik.
(Dokładna ścieżka menu może się różnić między producentami — Samsung,
Pixel itd. — ale "Ułatwienia dostępu" → "TalkBack" jest wspólne dla
wszystkich Androidów z Google.)

## Co sprawdzić (te same 8 punktów co VoiceOver, ta sama semantyka HTML)

TalkBack i VoiceOver czytają tę samą stronę na podstawie tej samej
semantyki HTML/ARIA, nie osobnego kodu — więc oczekiwany wynik powinien
być taki sam. Powtórz dokładnie te same kroki co w
`docs/SPRINT_CONTRAST_HARDENING_MANUAL_VOICEOVER_HANDOFF_V1.md`, sekcja
A, punkty 1–8:

- [ ] 1. Link „Przejdź do treści" jest pierwszym odczytanym elementem
      po wejściu na stronę i przenosi czytanie do głównej treści.
- [ ] 2. Karta alertu czytana jest w sensownej kolejności (kategoria →
      ważność → tytuł → miejsce → data).
- [ ] 3. Przycisk „Szczegóły ▼" ogłasza zmianę stanu po aktywacji.
- [ ] 4. Zapis „Moja okolica" **automatycznie ogłasza** "Preferencje
      zapisane" bez ręcznego przesuwania do tego miejsca.
- [ ] 5. Dolna nawigacja — aktywna zakładka jest rozpoznawalna jako
      wybrana.
- [ ] 6. Pola formularza logowania mają własne, konkretne nazwy (nie
      tylko "pole edycji").
- [ ] 7. Nagłówki sekcji na `/prywatnosc` są dostępne przez nawigację
      "po nagłówkach" (w TalkBack: gest w górę/dół, następnie w
      lewo/prawo, po ustawieniu granulacji na "Nagłówki").
- [ ] 8. Przycisk zamknięcia baneru aktualizacji ma zrozumiałą nazwę
      ("Zamknij"), nie samo "X".

## Specyficzne dla TalkBack — dodatkowo sprawdź

- [ ] 9. **Natywny `<select>` kategorii** na małym ekranie (widoczny
      poniżej breakpointu `sm`, czyli na typowym telefonie) —
      TalkBack obsługuje natywne listy rozwijane inaczej niż VoiceOver
      (zwykle otwiera pełnoekranowy wybór opcji). Sprawdź, czy każda
      opcja (Wszystkie, Transport, Woda, Prąd, Odpady, Drogi,
      Komunikaty) jest czytana poprawnie i czy wybór faktycznie
      filtruje listę alertów.
- [ ] 10. Gesty przesuwania w Chrome na Androidzie czasami kolidują z
      gestami systemowymi (np. przesunięcie od krawędzi = "wstecz") —
      zanotuj, jeśli którykolwiek gest TalkBack nie zadziałał zgodnie z
      oczekiwaniem z powodu takiej kolizji (to problem systemowy
      Chrome/Android, nie kod Alertownika, ale warto to udokumentować).

## Co zapisać

Dla każdego punktu: PASS / FAIL + jedno zdanie z tego, co usłyszałeś.
Zrzuty ekranu przy FAIL. Bez oceny "ogólnego wrażenia" — konkretny
wynik na punkt wystarczy.

---

## Status tego dokumentu

Przygotowana checklista, **niewykonana**. Wymaga realnego testera z
telefonem Android — nie jest to test przeprowadzony przez Claude ani
raport z rzeczywistego użycia TalkBack.
