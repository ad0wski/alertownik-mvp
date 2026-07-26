import type { AlertCategory } from "@/types/alert";

// Sprint 129 — Source Checker Dashboard v1.
//
// Static, code-level definitions of the official sources Adam checks BY HAND.
// Deliberately not persisted in Supabase: v1 is a checklist, not a monitor.
// No fetching, no cron, no autopublish — a found notice always goes through
// Draft from Source (/admin/new-alert) as a DRAFT and is published manually
// from the Builder only after verification.
//
// Facebook/community posts are never a publication source — at most a clue
// to go find the official notice.

export type CheckFrequency = "daily" | "weekly" | "when_needed";
export type CheckRisk = "low" | "medium" | "high";

export const PILOT_LOCALITIES = [
  "Komorów",
  "Nowa Wieś",
  "Granica",
  "Michałowice",
  "Reguły",
  "Pruszków",
] as const;

export type PilotLocality = (typeof PILOT_LOCALITIES)[number];

export interface OfficialSourceCheck {
  id: string;
  name: string;
  category: AlertCategory;
  officialUrl: string;
  /** Co sprawdzić — what to actually look for on the page. */
  whatToCheck: string;
  localities: PilotLocality[];
  frequency: CheckFrequency;
  /** Free-text cadence detail when the enum is too coarse (e.g. "2–3× w tygodniu"). */
  frequencyNote?: string;
  risk: CheckRisk;
  /** Why this source is riskier/awkward (bot-blocking, region picker, scans…). */
  riskNote?: string;
  /** Sprint 168 — when set, the manual in-app check fetches this WordPress
   *  REST API endpoint (JSON) instead of parsing `officialUrl`'s HTML.
   *  `officialUrl` still stays the human-facing link ("Otwórz źródło").
   *  See src/lib/manualSourceCheckFetch.ts and
   *  src/lib/sourceParsers/pageParser.ts's parseWordpressRestPosts. */
  apiUrl?: string;
}

export const FREQUENCY_LABELS: Record<CheckFrequency, string> = {
  daily: "codziennie",
  weekly: "co tydzień",
  when_needed: "w razie potrzeby",
};

export const RISK_LABELS: Record<CheckRisk, string> = {
  low: "niskie ryzyko",
  medium: "średnie ryzyko",
  high: "wysokie ryzyko",
};

// One policy for every source on this list — shown once above the cards,
// not configurable per source, because it is a project rule, not a setting.
export const CHECKLIST_PUBLISH_POLICY = [
  "Sprawdzanie jest ręczne — nic nie pobiera się samo.",
  "Znalezisko trafia najpierw do szkicu (Draft from Source) — nigdy prosto do publikacji.",
  "Publikacja wyłącznie ręcznie z Kreatora, po zweryfikowaniu źródła, dat i miejsca.",
  "Facebook/grupy lokalne to tylko trop — publikujemy wyłącznie na podstawie oficjalnego komunikatu.",
  "Nic nie znaleziono? To też wynik — zaloguj check przy źródle poniżej i wróć zgodnie z rytmem.",
] as const;

export const OFFICIAL_SOURCE_CHECKS: OfficialSourceCheck[] = [
  {
    id: "wkd-aktualnosci",
    name: "WKD — aktualności",
    category: "transport",
    officialUrl: "https://wkd.com.pl/aktualnosci",
    whatToCheck:
      "Zmiany rozkładu, ograniczenia prędkości, awarie i planowane prace na linii WKD. " +
      "Zwróć uwagę na daty obowiązywania — komunikat sprzed tygodnia może nadal trwać.",
    localities: ["Komorów", "Nowa Wieś", "Granica", "Michałowice", "Reguły", "Pruszków"],
    frequency: "weekly",
    frequencyNote: "plus dzień przed planowanym wyjazdem",
    risk: "low",
  },
  {
    id: "michalowice-komunikaty",
    name: "Gmina Michałowice — komunikaty",
    category: "municipal",
    officialUrl: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty",
    whatToCheck:
      "Komunikaty urzędu gminy: przerwy w dostawach, prace, zmiany organizacji ruchu, " +
      "ostrzeżenia lokalne. Filtruj wzrokiem pod kątem miejscowości pilotażowych.",
    localities: ["Komorów", "Nowa Wieś", "Granica", "Michałowice", "Reguły"],
    frequency: "weekly",
    risk: "low",
  },
  {
    id: "pruszkow-aktualnosci",
    name: "Miasto Pruszków — aktualności",
    category: "municipal",
    officialUrl: "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/",
    // Sprint 169 — the historical HTTP 403 (Sprint 73/77) turned out to
    // apply to the rendered HTML page, not to this site's own WordPress
    // REST API, which is publicly reachable (verified live: category 371
    // "Aktualności dla Mieszkańców", 2843 posts). Unlike Wodociągi's
    // category, most posts here are general municipal PR/event content —
    // parsePruszkowRestPosts (pageParser.ts) applies its own, broader
    // keyword filter tuned to this source's actual whatToCheck scope
    // (road/traffic changes, heat/hot-water interruptions, waste-schedule
    // changes, alarm-siren tests) so off-topic posts never get proposed.
    apiUrl: "https://www.pruszkow.pl/wp-json/wp/v2/posts?categories=371&per_page=6",
    whatToCheck:
      "Ogłoszenia urzędu miasta: remonty, przerwy w dostawie ciepła/ciepłej wody, " +
      "zmiany w odbiorze odpadów, wydarzenia zamykające ulice.",
    localities: ["Pruszków"],
    frequency: "weekly",
    risk: "medium",
    riskNote:
      "Renderowana strona HTML blokuje automatyczne pobieranie (HTTP 403) — check przez " +
      "aplikację używa WordPress REST API tego serwisu (publicznie dostępne), nie scrapuje " +
      "HTML. Cloudflare tej domeny może zachować się inaczej dla ruchu z Vercela niż lokalnie " +
      "— jeśli check zacznie zawodzić, wróć do ręcznego sprawdzania w przeglądarce.",
  },
  {
    id: "pge-planowane",
    name: "PGE Dystrybucja — planowane wyłączenia prądu",
    category: "power",
    officialUrl: "https://pgedystrybucja.pl/wylaczenia/planowane-wylaczenia",
    whatToCheck:
      "Planowane wyłączenia dla wszystkich 6 miejscowości pilotażu (wybierz rejon/gminę " +
      "w wyszukiwarce PGE). Notuj: miejscowość, ulice/numery, datę i godziny od–do.",
    localities: ["Komorów", "Nowa Wieś", "Granica", "Michałowice", "Reguły", "Pruszków"],
    frequency: "weekly",
    frequencyNote: "docelowo 2–3× w tygodniu",
    risk: "medium",
    riskNote:
      "Interfejs wymaga ręcznego wyboru rejonu — nie da się podejrzeć jednym linkiem; " +
      "szczegóły: PGE Manual Check Guide (Obsidian).",
  },
  {
    id: "pge-aktualne",
    name: "PGE Dystrybucja — aktualne przerwy w dostawie",
    category: "power",
    officialUrl: "https://pgedystrybucja.pl/wylaczenia/aktualne-przerwy-w-dostawie-energii",
    whatToCheck:
      "Awarie trwające teraz. Sprawdzaj przy zgłoszeniu od mieszkańca, po burzy/wichurze " +
      "albo gdy sam zauważysz brak prądu — nie ma sensu wchodzić tu codziennie bez powodu.",
    localities: ["Komorów", "Nowa Wieś", "Granica", "Michałowice", "Reguły", "Pruszków"],
    frequency: "when_needed",
    risk: "medium",
    riskNote: "Awarie znikają ze strony po usunięciu — zrób notatkę/zrzut od razu.",
  },
  {
    id: "michalowice-wylaczenia-pradu",
    name: "Gmina Michałowice — wyłączenia prądu",
    category: "power",
    officialUrl: "https://www.michalowice.pl/dla-mieszkancow-i-inwestorow/wylaczenia-pradu",
    whatToCheck:
      "Gminna strona zbiorcza o wyłączeniach — gmina sama odsyła do PGE, ale czasem " +
      "publikuje własne zestawienie z ulicami. Dobre potwierdzenie znaleziska z PGE.",
    localities: ["Komorów", "Nowa Wieś", "Granica", "Michałowice", "Reguły"],
    frequency: "weekly",
    risk: "low",
  },
  {
    id: "michalowice-odpady",
    name: "Gmina Michałowice — harmonogram odbioru odpadów",
    category: "waste",
    officialUrl:
      "https://www.michalowice.pl/ochrona-srodowiska/odbior-odpadow/nowy-harmonogram-odbioru-odpadow-komunalnych",
    whatToCheck:
      "Czy pojawił się nowy/zmieniony harmonogram PDF (obecny import: Komorów, zabudowa " +
      "jednorodzinna, cały 2026). Zmiana harmonogramu = aktualizacja danych w /admin/waste.",
    localities: ["Komorów", "Nowa Wieś", "Granica", "Michałowice", "Reguły"],
    frequency: "when_needed",
    frequencyNote: "raz w miesiącu wystarczy; częściej przy zmianie sezonu",
    risk: "low",
    riskNote: "PDF-y są skanowane — daty przepisuje się ręcznie (workflow: data/waste/README.md).",
  },
  {
    id: "wodociagi-michalowice",
    name: "Wodociągi Michałowice — awarie i przerwy",
    category: "water",
    officialUrl: "https://wodociagimichalowice.pl/category/aktualnosci/",
    // Sprint 168 — the homepage itself exposes no notice list in a
    // recognizable shape; the real content lives in this WordPress site's
    // "Aktualności" category (verified live: 294 posts, overwhelmingly
    // genuine water-interruption notices — "Przerwa w dostawie wody" —
    // plus occasional office-hours/pricing announcements). The category
    // archive page is kept as the human-facing officialUrl; the actual
    // check uses the WordPress REST API below (apiUrl), which returns
    // clean, structured, official data — not a scrape.
    apiUrl: "https://wodociagimichalowice.pl/wp-json/wp/v2/posts?categories=1&per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci, płukanie sieci. Dla ciepłej wody/ciepła " +
      "w Pruszkowie patrz też aktualności Pruszkowa (komunikaty ciepłownicze).",
    localities: ["Komorów", "Nowa Wieś", "Granica", "Michałowice", "Reguły"],
    frequency: "weekly",
    risk: "low",
  },
  {
    id: "roboty-drogowe",
    name: "Remonty i utrudnienia drogowe — gmina + Pruszków",
    category: "roads",
    officialUrl: "https://www.michalowice.pl/dzieje-sie/aktualnosci",
    whatToCheck:
      "Zamknięcia ulic, frezowanie, objazdy — zwykle w aktualnościach gminy albo Pruszkowa " +
      "(nie ma jednej dedykowanej strony). Plotka z FB o remoncie = trop: szukaj komunikatu " +
      "urzędu; bez oficjalnego źródła nie publikujemy.",
    localities: ["Komorów", "Nowa Wieś", "Granica", "Michałowice", "Reguły", "Pruszków"],
    frequency: "when_needed",
    frequencyNote: "przy tropie od mieszkańca lub sezonie remontowym",
    risk: "medium",
    riskNote: "Rozproszone źródło — łatwo o starą wiadomość; zawsze sprawdź datę publikacji.",
  },
];

// What to do when a check finds something — the single source-to-draft flow,
// rendered once above the cards. Mirrors the Obsidian page "Source to Draft Flow".
export const FOUND_SOMETHING_STEPS = [
  "Skopiuj dokładny adres URL komunikatu (nie stronę główną, jeśli jest podstrona).",
  "Skopiuj treść komunikatu (albo kluczowe fakty: miejsce, ulice, od–do).",
  "Otwórz „Nowy alert ze źródła” i wklej treść + URL — powstanie szkic.",
  "Sprawdź w szkicu: kategoria, daty (data komunikatu ≠ data prac!), miejscowość, źródło.",
  "Zapisz jako draft. Publikacja — ręcznie z Kreatora, dopiero po weryfikacji.",
] as const;
