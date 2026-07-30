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
  // Blok Wykonawczy 2 (Etap E) — first real, HTTP-verified national-scale
  // wave: 7 Mazowieckie municipal water utilities near the existing pilot
  // (docs/EXEC_BLOCK_1_SOURCE_DISCOVERY_MAZOWIECKIE_V1.md), all sharing the
  // exact wordpress_rest adapter already proven on wodociagi-michalowice —
  // zero new parser code, only this configuration. `localities: []` is
  // deliberate and honest: these towns are outside Alertownik's own
  // 6-locality PILOT_LOCALITIES union (a real, load-bearing TypeScript
  // constraint, not an oversight — see riskNote), so they never appear in
  // "Moja okolica" personalization and are check-only, never counted toward
  // pilot coverage. Widening PILOT_LOCALITIES itself is explicitly out of
  // scope for this block (would change public-facing personalization UX,
  // not requested).
  {
    id: "eko-raszyn",
    name: "EKO-RASZYN Sp. z o.o.",
    category: "water",
    officialUrl: "https://www.ekoraszyn.pl",
    apiUrl: "https://www.ekoraszyn.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci, prace techniczne — Gmina Raszyn (poza obecnym " +
      "pilotażem, powiat pruszkowski, sąsiedni do obszaru pilotażu).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only (SAFE_CHECK_SOURCE_IDS), nigdy nie trafi " +
      "do writera ani auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "bpwik-brwinow",
    name: "Brwinowskie Przedsiębiorstwo Wodociągów i Kanalizacji",
    category: "water",
    officialUrl: "https://bpwik.pl",
    apiUrl: "https://bpwik.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, zakazy podlewania, awarie sieci — Gmina Brwinów (poza obecnym " +
      "pilotażem, powiat pruszkowski).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "pkn-nadarzyn",
    name: "Przedsiębiorstwo Komunalne Nadarzyn",
    category: "water",
    officialUrl: "https://pkn.net.pl",
    apiUrl: "https://pkn.net.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Gmina Nadarzyn (poza obecnym pilotażem, powiat " +
      "pruszkowski).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "zwik-ozarow-mazowiecki",
    name: "ZWiK Ożarów Mazowiecki",
    category: "water",
    officialUrl: "https://zwik.ozarow-mazowiecki.pl",
    apiUrl: "https://zwik.ozarow-mazowiecki.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, komunikaty sanepidu o jakości wody, awarie sieci — Gmina " +
      "Ożarów Mazowiecki (poza obecnym pilotażem, powiat warszawski zachodni).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "pwik-radzymin",
    name: "PWiK Radzymin",
    category: "water",
    officialUrl: "https://www.pwikradzymin.pl",
    apiUrl: "https://www.pwikradzymin.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Gmina Radzymin (poza obecnym pilotażem, powiat " +
      "wołomiński).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "pwk-legionowo",
    name: "PWK „Legionowo”",
    category: "water",
    officialUrl: "https://pwklegionowo.com",
    apiUrl: "https://pwklegionowo.com/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Miasto Legionowo (poza obecnym pilotażem, " +
      "powiat legionowski).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów. Treść bywa " +
      "edukacyjna/PR — filtr słów kluczowych (parseWordpressRestPosts) już to obsługuje, " +
      "ten sam wzorzec co wodociagi-michalowice.",
  },
  {
    id: "opwik-otwock",
    name: "OPWiK Otwock",
    category: "water",
    officialUrl: "https://opwik.com",
    apiUrl: "https://opwik.com/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci, prace na sieci wodociągowej — Miasto Otwock " +
      "(poza obecnym pilotażem, powiat otwocki).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "pwik-zabki",
    name: "PWiK w Ząbkach Sp. z o.o.",
    category: "water",
    officialUrl: "https://pwikzabki.pl",
    apiUrl: "https://pwikzabki.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, wymiana wodomierzy, awarie sieci — Miasto Ząbki (poza obecnym " +
      "pilotażem, powiat wołomiński). Zweryfikowane w Bloku Wykonawczym 2 (realny komunikat: " +
      "wymiana wodomierzy lipiec–listopad 2026).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "hydrosfera-jozefow",
    name: "Hydrosfera Józefów Sp. z o.o.",
    category: "water",
    officialUrl: "https://hydrosfera-jozefow.pl",
    apiUrl: "https://hydrosfera-jozefow.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Miasto Józefów (poza obecnym pilotażem, powiat " +
      "otwocki). Zweryfikowane w Bloku Wykonawczym 2 (realne zawiadomienie o przerwie w " +
      "dostawie wody, ul. Wawerska).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "pwik-zielonka",
    name: "PWiK w Zielonce Sp. z o.o.",
    category: "water",
    officialUrl: "https://pwikzielonka.com.pl",
    apiUrl: "https://pwikzielonka.com.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Miasto Zielonka (poza obecnym pilotażem, " +
      "powiat wołomiński). Zweryfikowane w Bloku Wykonawczym 2 (realny komunikat o przerwie " +
      "w dostawie wody, ulice Ossowska/Korczaka/Bartnika).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  // Etap F, Fala 2 (2026-07-30) — 4 more HTTP-verified Mazowieckie water
  // utilities, personally verified by the main agent via direct fetch
  // (no subagent involved, per the post-incident subagent ban in
  // CLAUDE.md). Same wordpress_rest mechanics, same
  // check-only-only/localities:[] pattern as Fala 1
  // (docs/EXEC_BLOCK_2_SOURCE_ACTIVATION_V1.md).
  {
    id: "pwik-minsk-mazowiecki",
    name: "PWiK Mińsk Mazowiecki",
    category: "water",
    officialUrl: "https://www.pwikminsk.pl",
    apiUrl: "https://www.pwikminsk.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Miasto Mińsk Mazowiecki (poza obecnym " +
      "pilotażem, powiat miński). Zweryfikowane w Etapie F Fala 2 (realne komunikaty: " +
      "awaria sieci wodociągowej, przerwa w dostawie wody).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów. Kanał miesza " +
      "komunikaty operacyjne z ogłoszeniami przetargowymi — filtr operacyjności " +
      "(parseWordpressRestPosts) już to obsługuje, ten sam wzorzec co wodociagi-michalowice.",
  },
  {
    id: "pwik-wyszkow",
    name: "Przedsiębiorstwo Wodociągów i Kanalizacji w Wyszkowie",
    category: "water",
    officialUrl: "https://pwikwyszkow.pl",
    apiUrl: "https://pwikwyszkow.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Miasto Wyszków (poza obecnym pilotażem, " +
      "powiat wyszkowski). Zweryfikowane w Etapie F Fala 2 (realny komunikat operacyjny " +
      "obok treści PR/finansowania).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów. Kanał skłania się " +
      "ku treściom PR/finansowaniu — filtr operacyjności już to obsługuje.",
  },
  {
    id: "pwik-pultusk",
    name: "Przedsiębiorstwo Wodociągów i Kanalizacji w Pułtusku",
    category: "water",
    officialUrl: "https://pwikpultusk.pl",
    apiUrl: "https://pwikpultusk.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci, apele do mieszkańców — Miasto Pułtusk (poza " +
      "obecnym pilotażem, powiat pułtuski). Zweryfikowane w Etapie F Fala 2 — wszystkie 3 " +
      "próbkowane wpisy w pełni operacyjne.",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "zwik-nowy-dwor-mazowiecki",
    name: "ZWiK Nowy Dwór Mazowiecki",
    category: "water",
    officialUrl: "https://zwikndm.pl",
    apiUrl: "https://zwikndm.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci, komunikaty spółki — Miasto Nowy Dwór " +
      "Mazowiecki (poza obecnym pilotażem, powiat nowodworski). Zweryfikowane w Etapie F " +
      "Fala 2.",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów. Kanał zawiera " +
      "też komunikaty administracyjne (połączenie spółek) — filtr operacyjności już to " +
      "obsługuje.",
  },
  // Etap F, Fala 3 (2026-07-30) — first Łódzkie sources. 6 more HTTP-verified
  // water utilities, personally verified by the main agent via direct fetch,
  // each checked twice to rule out a fluke (no subagent involved anywhere in
  // this block, per CLAUDE.md's post-incident subagent ban). Same
  // wordpress_rest mechanics, same check-only-only/localities:[] pattern as
  // Fala 1/2. This is the first wave to leave Mazowieckie voivodeship.
  {
    id: "zwik-pabianice",
    name: "ZWiK Pabianice",
    category: "water",
    officialUrl: "https://zwik.pabianice.pl",
    apiUrl: "https://zwik.pabianice.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Miasto Pabianice, województwo łódzkie " +
      "(poza obecnym pilotażem, powiat pabianicki). Zweryfikowane dwukrotnie w Etapie F " +
      "Fala 3 — realne komunikaty o awariach na skrzyżowaniu Warszawska/Batorego.",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "wodkan-zgierz",
    name: "Wodociągi i Kanalizacja — Zgierz",
    category: "water",
    officialUrl: "https://www.wodkan.zgierz.pl",
    apiUrl: "https://www.wodkan.zgierz.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci, ogłoszenia spółki — Miasto Zgierz, " +
      "województwo łódzkie (poza obecnym pilotażem, powiat zgierski). Zweryfikowane " +
      "dwukrotnie w Etapie F Fala 3.",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "pwik-piotrkow",
    name: "Piotrkowskie Wodociągi i Kanalizacja",
    category: "water",
    officialUrl: "https://pwik.piotrkow.pl",
    apiUrl: "https://pwik.piotrkow.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Miasto Piotrków Trybunalski, województwo " +
      "łódzkie (poza obecnym pilotażem). Zweryfikowane dwukrotnie w Etapie F Fala 3 — " +
      "realne komunikaty o awariach sieci (ul. Prosta, ul. Szmidta).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "pgkim-aleksandrow-lodzki",
    name: "PGKiM Aleksandrów Łódzki",
    category: "water",
    officialUrl: "https://pgkimal.pl",
    apiUrl: "https://pgkimal.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Miasto Aleksandrów Łódzki, województwo " +
      "łódzkie (poza obecnym pilotażem, powiat zgierski). Zweryfikowane dwukrotnie w " +
      "Etapie F Fala 3 — wszystkie próbkowane wpisy w pełni operacyjne (\"Brak wody!\").",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "komunalne-wielun",
    name: "Przedsiębiorstwo Komunalne Wieluń",
    category: "water",
    officialUrl: "https://komunalne.wielun.pl",
    apiUrl: "https://komunalne.wielun.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Miasto Wieluń, województwo łódzkie (poza " +
      "obecnym pilotażem, powiat wieluński). Zweryfikowane dwukrotnie w Etapie F Fala 3 — " +
      "wszystkie próbkowane wpisy w pełni operacyjne, precyzyjne (ulice, daty).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "mzwik-glowno",
    name: "Miejski Zakład Wodociągów i Kanalizacji — Głowno",
    category: "water",
    officialUrl: "https://mzwikglowno.pl",
    apiUrl: "https://mzwikglowno.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, apele o oszczędzanie wody w upały, awarie sieci — Miasto " +
      "Głowno, województwo łódzkie (poza obecnym pilotażem, powiat zgierski). " +
      "Zweryfikowane dwukrotnie w Etapie F Fala 3.",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów. Kanał miesza " +
      "komunikaty operacyjne (apele, przerwy) z ogłoszeniami przetargowymi — filtr " +
      "operacyjności (parseWordpressRestPosts) już to obsługuje, najsłabszy sygnał " +
      "operacyjny z tej fali — obserwować przy pierwszych realnych checkach.",
  },
  // Etap F, Fala 4 (2026-07-30) — first sources from Wielkopolskie and
  // Świętokrzyskie voivodeships, checked in one parallel batch. 6 more
  // HTTP-verified water utilities (3 per voivodeship), personally verified
  // by the main agent via direct fetch, each checked twice (no subagent
  // anywhere in this block, per CLAUDE.md's post-incident subagent ban).
  // Same wordpress_rest mechanics, same check-only-only/localities:[]
  // pattern as every prior wave.
  {
    id: "pwik-konin",
    name: "PWiK Konin",
    category: "water",
    officialUrl: "https://pwik-konin.com.pl",
    apiUrl: "https://pwik-konin.com.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Miasto Konin, województwo wielkopolskie " +
      "(poza obecnym pilotażem). Zweryfikowane dwukrotnie w Etapie F Fala 4 — realne " +
      "komunikaty o awariach przyłączy i modernizacji sieci.",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "pwik-wrzesnia",
    name: "PWiK Września",
    category: "water",
    officialUrl: "https://pwikwrzesnia.pl",
    apiUrl: "https://pwikwrzesnia.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, apele o oszczędzanie wody, spadki ciśnienia — Gmina " +
      "Września, województwo wielkopolskie (poza obecnym pilotażem). Zweryfikowane " +
      "dwukrotnie w Etapie F Fala 4.",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "sremskie-wodociagi",
    name: "Śremskie Wodociągi",
    category: "water",
    officialUrl: "https://www.sremskiewodociagi.pl",
    apiUrl: "https://www.sremskiewodociagi.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, wymiana wodomierzy, jakość wody — Gmina Śrem, " +
      "województwo wielkopolskie (poza obecnym pilotażem). Zweryfikowane dwukrotnie w " +
      "Etapie F Fala 4 — wszystkie próbkowane wpisy w pełni operacyjne.",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "mwik-ostrowiec",
    name: "MWiK Ostrowiec Świętokrzyski",
    category: "water",
    officialUrl: "https://mwikostrowiec.pl",
    apiUrl: "https://mwikostrowiec.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, modernizacja sieci — Miasto Ostrowiec Świętokrzyski, " +
      "województwo świętokrzyskie (poza obecnym pilotażem). Zweryfikowane dwukrotnie w " +
      "Etapie F Fala 4 — realny komunikat o przerwie w dostawie wody (ul. Żeromskiego).",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "mpgk-busko-zdroj",
    name: "MPGK Busko-Zdrój",
    category: "water",
    officialUrl: "https://mpgkbusko.pl",
    apiUrl: "https://mpgkbusko.pl/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Miasto Busko-Zdrój, województwo " +
      "świętokrzyskie (poza obecnym pilotażem). Zweryfikowane dwukrotnie w Etapie F Fala 4.",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów. Kanał miesza " +
      "komunikaty operacyjne z ogłoszeniami przetargowymi — filtr operacyjności już to " +
      "obsługuje, najsłabszy sygnał operacyjny z tej fali.",
  },
  {
    id: "wodociagi-pinczowskie",
    name: "Wodociągi Pińczowskie",
    category: "water",
    officialUrl: "https://wodociagipinczowskie.net",
    apiUrl: "https://wodociagipinczowskie.net/wp-json/wp/v2/posts?per_page=6",
    whatToCheck:
      "Przerwy w dostawie wody, awarie sieci — Miasto Pińczów, województwo świętokrzyskie " +
      "(poza obecnym pilotażem). Zweryfikowane dwukrotnie w Etapie F Fala 4 — realne " +
      "komunikaty o przerwach z konkretnymi ulicami i datami.",
    localities: [],
    frequency: "weekly",
    risk: "low",
    riskNote:
      "Poza 6 miejscowościami pilotażu — check-only, nigdy nie trafi do writera ani " +
      "auto-publish bez osobnej, jawnej zmiany allowlisty tych mechanizmów.",
  },
  {
    id: "powiat-pruszkowski-wiadomosci",
    name: "Powiat Pruszkowski — Wiadomości (utrudnienia drogowe)",
    category: "roads",
    officialUrl: "https://samorzad.gov.pl/web/powiat-pruszkowski/wiadomosci",
    // Sprint 183A — a genuine gov.pl self-government portal, deterministic
    // Liferay listing markup, verified live (HTTP 200, no Cloudflare/bot
    // signals, no robots.txt disallow — /robots.txt itself redirects to the
    // homepage). Real road/traffic items exist in the feed (found live both
    // in Sprint 170 and this sprint's re-check) but are published with only
    // a bare title, no teaser — see src/lib/sourceParsers/
    // powiatPruszkowskiParser.ts and powiatPruszkowskiFetch.ts for how a
    // bounded, fail-closed article-body fetch fills that in without
    // lowering the shared MIN_PROPOSAL_TEXT_LENGTH filter every source
    // relies on. This source covers the WHOLE Powiat Pruszkowski, which
    // includes towns outside Alertownik's own 6-locality pilot (e.g.
    // Piastów) — an admin converting a candidate here must still check
    // whether it actually concerns the pilot area before publishing, same
    // as every other Draft-from-Source conversion.
    whatToCheck:
      "Utrudnienia drogowe, zamknięcia ulic, remonty/rozbudowa dróg powiatowych, zmiany " +
      "organizacji ruchu, objazdy. Komunikat musi realnie dotyczyć utrudnienia — nie " +
      "promocji, wydarzenia ani ostrzeżenia pogodowego/hydrologicznego (poza zakresem " +
      "aplikacji). Sprawdź, czy dotyczy faktycznie okolic pilotażu, nie tylko powiatu " +
      "jako całości (powiat obejmuje też miejscowości spoza pilotażu, np. Piastów).",
    localities: ["Komorów", "Nowa Wieś", "Granica", "Michałowice", "Reguły", "Pruszków"],
    frequency: "weekly",
    risk: "medium",
    riskNote:
      "Nowe źródło (Sprint 183A) — deterministyczna struktura HTML, ale wymaga dwuetapowego " +
      "pobierania (lista + do 3 stron artykułów na sprawdzenie) dla wpisów bez zajawki. " +
      "Jeśli portal gov.pl zmieni szablon, check bezpiecznie zwróci zero propozycji " +
      "zamiast błędu — wróć wtedy do ręcznego sprawdzania w przeglądarce.",
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
