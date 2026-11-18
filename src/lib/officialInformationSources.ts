// Google Play "Misleading Claims — Missing Source Link for Government
// Information" fix (18.11.2026). Single source of truth for the official
// sources Alertownik's PUBLIC content really comes from, shown on
// /about and mirrored in docs/google-play/V1_STORE_COPY.md (a test keeps
// the two in sync).
//
// Built from Production data, not guessed: every published alert's
// source_url and every waste_schedule_items.source_url belongs to one of
// these institutions (audit 18.11.2026). Add an entry here BEFORE
// publishing content from a new institution.

export interface OfficialInformationSource {
  institution: string;
  label: string;
  url: string;
  usedFor: string;
}

export const OFFICIAL_INFORMATION_SOURCES: readonly OfficialInformationSource[] = [
  {
    institution: "Gmina Michałowice",
    label: "Komunikaty Urzędu Gminy",
    url: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty",
    usedFor:
      "Główne źródło: przerwy w dostawie wody, utrudnienia na drogach i komunikaty gminne. Sprawdzane automatycznie dwa razy dziennie.",
  },
  {
    institution: "Gmina Michałowice",
    label: "Harmonogram odbioru odpadów",
    url: "https://www.michalowice.pl/ochrona-srodowiska/odbior-odpadow/nowy-harmonogram-odbioru-odpadow-komunalnych",
    usedFor: "Terminy odbioru odpadów w zakładce „Odpady”.",
  },
  {
    institution: "Miasto Pruszków",
    label: "Aktualności dla mieszkańców",
    url: "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/",
    usedFor: "Pojedyncze alerty o Pruszkowie, dodawane ręcznie.",
  },
  {
    institution: "Warszawska Kolej Dojazdowa (WKD)",
    label: "Aktualności WKD",
    url: "https://wkd.com.pl/aktualnosci",
    usedFor: "Pojedyncze alerty o kolei WKD, dodawane ręcznie.",
  },
];

export const INDEPENDENCE_DISCLAIMER =
  "Alertownik jest niezależnym projektem. Nie jest oficjalną aplikacją ani przedstawicielem Gminy Michałowice, Miasta Pruszków, Warszawskiej Kolei Dojazdowej ani żadnej innej instytucji publicznej i nie działa w ich imieniu.";
