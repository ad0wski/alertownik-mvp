import { Alert } from "@/types/alert";

export const sampleAlerts: Alert[] = [
  {
    id: "1",
    category: "transport",
    severity: "warning",
    title: "Zmiana trasy WKD – linia W1",
    location: "Warszawa Śródmieście – Pruszków",
    dateFrom: "2026-05-19",
    dateTo: "2026-05-23",
    summary:
      "W związku z pracami torowisku na odcinku Warszawa Aleje Jerozolimskie – Pruszków pociągi WKD kursują zmienioną trasą. Czas przejazdu wydłużony o ok. 15 minut.",
    action:
      "Sprawdź aktualne rozkłady jazdy na stronie WKD lub aplikacji mobilnej.",
    source: "WKD – Warszawska Kolej Dojazdowa",
  },
  {
    id: "2",
    category: "water",
    severity: "critical",
    title: "Przerwa w dostawie wody",
    location: "Komorów, ul. Różana, Lipowa, Akacjowa",
    dateFrom: "2026-05-18",
    dateTo: "2026-05-18",
    summary:
      "Ze względu na awarię sieci wodociągowej planowana jest przerwa w dostawie wody pitnej. Prace naprawcze potrwają do godziny 18:00.",
    action:
      "Zaopatrz się w wodę pitną z wyprzedzeniem. W razie pytań dzwoń na infolinię MPWiK.",
    source: "MPWiK Pruszków",
  },
  {
    id: "3",
    category: "power",
    severity: "warning",
    title: "Planowana przerwa w dostawie prądu",
    location: "Michałowice, ul. Szkolna 1–15 (numery nieparzyste)",
    dateFrom: "2026-05-21",
    dateTo: "2026-05-21",
    summary:
      "Energa Operator planuje prace konserwacyjne sieci elektroenergetycznej. Przerwa w dostawie energii elektrycznej od godz. 9:00 do 14:00.",
    action:
      "Zabezpiecz urządzenia wrażliwe na brak zasilania. Upewnij się, że naładujesz telefon wcześniej.",
    source: "Energa Operator SA",
  },
  {
    id: "4",
    category: "waste",
    severity: "info",
    title: "Zmiana harmonogramu odbioru odpadów",
    location: "Komorów, strefa A",
    dateFrom: "2026-05-22",
    summary:
      "W związku ze Świętem Bożego Ciała odbiór odpadów komunalnych (zmieszanych i segregowanych) zostaje przesunięty o jeden dzień.",
    action:
      "Wystaw pojemniki w czwartek 22 maja zamiast w środę. Harmonogram dostępny na stronie gminy.",
    source: "Urząd Gminy Michałowice",
  },
  {
    id: "5",
    category: "roads",
    severity: "info",
    title: "Roboty drogowe – zwężenie pasa ruchu",
    location: "Michałowice, ul. Raszyńska (odcinek przy szkole)",
    dateFrom: "2026-05-19",
    dateTo: "2026-06-13",
    summary:
      "Trwają prace remontowe nawierzchni jezdni. Jeden pas ruchu jest wyłączony. Obowiązuje ruch wahadłowy regulowany sygnalizacją tymczasową.",
    action:
      "Uwzględnij możliwe opóźnienia w podróży. Rozważ użycie alternatywnej trasy przez ul. Parkową.",
    source: "Zarząd Dróg Powiatu Pruszkowskiego",
  },
];
