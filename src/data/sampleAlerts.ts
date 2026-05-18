import { Alert } from "@/types/alert";

export const sampleAlerts: Alert[] = [
  {
    id: "1",
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
    sourceUrl: "#",
  },
  {
    id: "2",
    category: "water",
    severity: "critical",
    title: "Przerwa w dostawie wody",
    place: "Komorów, ul. Różana, Lipowa, Akacjowa",
    startsAt: "2026-05-18T07:00",
    endsAt: "2026-05-18T18:00",
    change:
      "Brak dostawy wody pitnej z powodu awarii sieci wodociągowej. Prace naprawcze trwają.",
    action:
      "Zaopatrz się w wodę pitną z wyprzedzeniem. W razie pytań dzwoń na infolinię MPWiK.",
    sourceName: "MPWiK Pruszków",
    sourceUrl: "#",
  },
  {
    id: "3",
    category: "power",
    severity: "warning",
    title: "Planowana przerwa w dostawie prądu",
    place: "Michałowice, ul. Szkolna 1–15 (numery nieparzyste)",
    startsAt: "2026-05-21T09:00",
    endsAt: "2026-05-21T14:00",
    change:
      "Brak energii elektrycznej z powodu planowanych prac konserwacyjnych sieci elektroenergetycznej Energa Operator.",
    action:
      "Zabezpiecz urządzenia wrażliwe na brak zasilania. Naładuj telefon i powerbanki dzień wcześniej.",
    sourceName: "Energa Operator SA",
    sourceUrl: "#",
  },
  {
    id: "4",
    category: "waste",
    severity: "info",
    title: "Zmiana harmonogramu odbioru odpadów",
    place: "Komorów, strefa A",
    startsAt: "2026-05-22",
    change:
      "Odbiór odpadów komunalnych (zmieszanych i segregowanych) przesunięty o jeden dzień z powodu Święta Bożego Ciała.",
    action:
      "Wystaw pojemniki w czwartek 22 maja zamiast w środę. Aktualny harmonogram dostępny na stronie gminy.",
    sourceName: "Urząd Gminy Michałowice",
    sourceUrl: "#",
  },
  {
    id: "5",
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
    sourceName: "Zarząd Dróg Powiatu Pruszkowskiego",
    sourceUrl: "#",
  },
];
