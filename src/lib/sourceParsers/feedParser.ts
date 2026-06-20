// RSS/Atom feed strategy — discovery only (see pageParser's findFeedUrl,
// used via /api/sources/fetch-preview). Actually fetching and parsing a
// feed's items is NOT implemented this sprint, on purpose (see Sprint 76
// in the Obsidian Sprint Log): it needs an XML parser and a decision on
// where parsed items land (likely the proposed source_notice_candidates
// table, not source_checks). This module exists so the strategy is a real
// abstraction point — swapping in a real parser later means implementing
// this one function, not restructuring callers.

export interface FeedParseResult {
  ok: false;
  feedUrl: string;
  message: string;
}

export function getFeedParserPlaceholder(feedUrl: string): FeedParseResult {
  return {
    ok: false,
    feedUrl,
    message:
      "Parsowanie kanału RSS/Atom nie jest jeszcze obsługiwane — wykryto link do kanału, " +
      "ale jego zawartość nie jest automatycznie pobierana. Otwórz link ręcznie, sprawdź " +
      "nowe wpisy i wklej treść do AI Helpera.",
  };
}
