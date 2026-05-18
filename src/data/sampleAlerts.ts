import { Alert } from "@/types/alert";

export const sampleAlerts: Alert[] = [
  {
    id: "1",
    slug: "zmiana-trasy-wkd-linia-w1",
    category: "transport",
    severity: "warning",
    title: "Zmiana trasy WKD – linia W1",
    place: "Warszawa Śródmieście – Pruszków",
    startsAt: "2026-05-19",
    endsAt: "2026-05-23",
    change:
      "Pociągi WKD kursują zmienioną trasą z powodu prac na torowisku na odcinku Warszawa Al. Jerozolimskie – Pruszków. Czas przejazdu wydłużony o ok. 15 minut.",
    action:
      "Sprawdź aktualne rozkłady jazdy na stronie WKD lub w aplikacji mobilnej.",
    sourceName: "WKD – Warszawska Kolej Dojazdowa",
    sourceUrl: "https://wkd.com.pl/aktualnosci/",
  },
  {
    id: "2",
    slug: "przerwa-w-dostawie-wody-komorow",
    category: "water",
    severity: "critical",
    title: "Przerwa w dostawie wody",
    place: "Komorów, ul. Różana, Lipowa, Akacjowa",
    startsAt: "2026-05-18T07:00",
    endsAt: "2026-05-18T18:00",
    change:
      "Brak dostawy wody pitnej z powodu awarii sieci wodociągowej. Prace naprawcze trwają.",
    action:
      "Zaopatrz się w wodę pitną z wyprzedzeniem. W razie pytań dzwoń na infolinię MPWiK: 22 758 50 50.",
    sourceName: "MPWiK Pruszków",
    sourceUrl: "https://www.pruszkow.pl/",
  },
  {
    id: "3",
    slug: "planowana-przerwa-pradu-michalowice",
    category: "power",
    severity: "warning",
    title: "Planowana przerwa w dostawie prądu",
    place: "Michałowice, ul. Szkolna 1–15 (numery nieparzyste)",
    startsAt: "2026-05-21T09:00",
    endsAt: "2026-05-21T14:00",
    change:
      "Brak energii elektrycznej z powodu planowanych prac konserwacyjnych sieci elektroenergetycznej PGE Dystrybucja.",
    action:
      "Zabezpiecz urządzenia wrażliwe na brak zasilania. Naładuj telefon i powerbanki dzień wcześniej.",
    sourceName: "PGE Dystrybucja SA",
    sourceUrl: "https://pgedystrybucja.pl/wylaczenia/planowane-wylaczenia",
  },
  {
    id: "4",
    slug: "zmiana-odbioru-odpadow-komorow",
    category: "waste",
    severity: "info",
    title: "Zmiana harmonogramu odbioru odpadów",
    place: "Gmina Michałowice – strefy A, B, C",
    startsAt: "2026-05-22",
    change:
      "Odbiór odpadów komunalnych (zmieszanych i segregowanych) przesunięty o jeden dzień z powodu Święta Bożego Ciała.",
    action:
      "Wystaw pojemniki w czwartek 22 maja zamiast w środę. Aktualny harmonogram sprawdzisz w aplikacji Eco-Harmonogram.",
    sourceName: "Gmina Michałowice / Eco-Harmonogram",
    sourceUrl: "https://www.pruszkow.pl/aplikacja-eco-harmonogram/",
  },
  {
    id: "5",
    slug: "roboty-drogowe-michalowice",
    category: "roads",
    severity: "info",
    title: "Roboty drogowe – zwężenie pasa ruchu",
    place: "Michałowice, ul. Raszyńska (odcinek przy szkole)",
    startsAt: "2026-05-19",
    endsAt: "2026-06-13",
    change:
      "Jeden pas ruchu wyłączony z eksploatacji. Obowiązuje ruch wahadłowy sterowany tymczasową sygnalizacją świetlną z powodu remontu nawierzchni jezdni.",
    action:
      "Uwzględnij możliwe opóźnienia w podróży. Rozważ alternatywną trasę przez ul. Parkową.",
    sourceName: "Gmina Michałowice — utrudnienia drogowe",
    sourceUrl: "https://www.michalowice.pl/start?q=utrudnienia",
  },
  {
    id: "6",
    slug: "konsultacje-spoleczne-michalowice",
    category: "municipal",
    severity: "info",
    title: "Konsultacje społeczne – zmiany w planie zagospodarowania",
    place: "Gmina Michałowice, teren ul. Turystycznej i okolic",
    startsAt: "2026-05-20",
    endsAt: "2026-06-04",
    change:
      "Urząd Gminy Michałowice prowadzi konsultacje dotyczące zmian w Miejscowym Planie Zagospodarowania Przestrzennego dla rejonu ul. Turystycznej.",
    action:
      "Zapoznaj się z projektem planu na stronie gminy. Uwagi składaj w formie pisemnej w urzędzie lub przez formularz online do 4 czerwca 2026.",
    sourceName: "Urząd Gminy Michałowice",
    sourceUrl: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty",
  },
];
