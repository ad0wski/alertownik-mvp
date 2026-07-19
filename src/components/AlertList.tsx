"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertCard } from "@/components/AlertCard";
import { PreferencesSection } from "@/components/PreferencesSection";
import { getSupabaseAlerts } from "@/lib/getSupabaseAlerts";
import { getAlertTimeStatus } from "@/lib/getAlertTimeStatus";
import { buildFeedbackQuickReasons } from "@/lib/feedbackMailto";
import { matchPilotLocality, pilotLocalitiesLabel } from "@/lib/pilotCoverage";
import {
  loadPreferences,
  savePreferences,
  clearPreferences,
  hasPreferences,
  loadMode,
  saveMode,
  type UserPreferences,
} from "@/lib/userPreferences";
import type { Alert, AlertCategory } from "@/types/alert";

// ── Sorting ──────────────────────────────────────────────────────────────────

const STATUS_ORDER = { active: 0, upcoming: 1, ended: 2, unknown: 3 } as const;

function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const sa = getAlertTimeStatus(a.startsAt, a.endsAt);
    const sb = getAlertTimeStatus(b.startsAt, b.endsAt);
    const diff = STATUS_ORDER[sa] - STATUS_ORDER[sb];
    if (diff !== 0) return diff;
    if (sa === "active")   return b.startsAt.localeCompare(a.startsAt);
    if (sa === "upcoming") return a.startsAt.localeCompare(b.startsAt);
    if (sa === "ended") {
      const endA = a.endsAt ?? a.startsAt;
      const endB = b.endsAt ?? b.startsAt;
      return endB.localeCompare(endA);
    }
    return 0;
  });
}

// ── Category filter config ────────────────────────────────────────────────────

type FilterValue = AlertCategory | "all";

const categoryFilters: { label: string; value: FilterValue }[] = [
  { label: "Wszystkie", value: "all" },
  { label: "Transport", value: "transport" },
  { label: "Woda",      value: "water" },
  { label: "Prąd",      value: "power" },
  { label: "Odpady",    value: "waste" },
  { label: "Drogi",     value: "roads" },
  { label: "Komunikaty", value: "municipal" },
];

// Polish labels used when matching search query against category name
const categoryLabels: Record<AlertCategory, string> = {
  transport: "transport",
  water:     "woda",
  power:     "prąd",
  waste:     "odpady",
  roads:     "drogi",
  municipal: "komunikaty",
};

// ── Filter helpers ────────────────────────────────────────────────────────────

function matchesSearch(alert: Alert, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return (
    alert.title.toLowerCase().includes(q) ||
    alert.place.toLowerCase().includes(q) ||
    alert.change.toLowerCase().includes(q) ||
    alert.action.toLowerCase().includes(q) ||
    (categoryLabels[alert.category] ?? "").includes(q)
  );
}

function matchesMyAlerts(alert: Alert, prefs: UserPreferences): boolean {
  const keywords = prefs.locationKeywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  const hasKeywords   = keywords.length > 0;
  const hasCategories = prefs.categories.length > 0;

  // If categories are selected, alert must be in one of them
  const categoryOk = hasCategories ? prefs.categories.includes(alert.category) : true;

  // If location keywords are set, at least one must appear in one of the text fields
  let keywordOk = true;
  if (hasKeywords) {
    const fields = [alert.title, alert.place, alert.change, alert.action]
      .map((f) => (f ?? "").toLowerCase());
    keywordOk = keywords.some((kw) => fields.some((f) => f.includes(kw)));
  }

  return categoryOk && keywordOk;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AlertList() {
  // Existing filter state
  const [selected, setSelected] = useState<FilterValue>("all");
  const [query, setQuery] = useState("");

  // Data state
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  // "Moje alerty" state — initialised from localStorage in useEffect
  const [mode, setMode]           = useState<"all" | "my">("all");
  const [prefs, setPrefs]         = useState<UserPreferences>({ locationKeywords: "", categories: [] });
  const [prefsReady, setPrefsReady] = useState(false);

  // Sprint 114 — ended alerts are collapsed by default so stale content
  // can't dominate the page even before old rows get archived in the DB.
  const [showEnded, setShowEnded] = useState(false);

  // Sprint 158A — a single settings panel (PreferencesSection) is now the
  // only place "Moja okolica" is set or changed. It replaces two previously
  // separate mechanisms (a compact chip-only picker here, plus a fuller
  // form only shown once mode==="my") that Userbrain testers (Franklin,
  // Elizabeth) both found confusing — neither could tell if the search box
  // was a second way to set the same thing.
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  useEffect(() => {
    // Fetch alerts
    getSupabaseAlerts()
      .then(({ alerts: data, error }) => {
        setAlerts(sortAlerts(data));
        if (error) setFetchError(true);
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));

    // Load saved mode and preferences from localStorage (client-only)
    setMode(loadMode());
    setPrefs(loadPreferences());
    setPrefsReady(true);
  }, []);

  function handleSetMode(next: "all" | "my") {
    setMode(next);
    saveMode(next);
  }

  function handleSavePrefs(newPrefs: UserPreferences) {
    savePreferences(newPrefs);
    setPrefs(newPrefs);
    // Saving from the settings panel always means "personalize now" —
    // switch into "Moja okolica" mode so the active-scope bar and filtered
    // list appear immediately instead of leaving the save silently inert.
    if (hasPreferences(newPrefs)) {
      handleSetMode("my");
    }
    setShowSettingsPanel(false);
  }

  function handleClearPrefs() {
    clearPreferences();
    setPrefs({ locationKeywords: "", categories: [] });
  }

  const prefsSet = hasPreferences(prefs);
  const localitySet = prefs.locationKeywords.trim().length > 0;

  // ── Pilot coverage (Sprint 158A) ────────────────────────────────────────
  // Only meaningful while actually filtering by area — checking it in
  // "Wszystkie alerty" mode would flag a saved-but-inactive preference.
  const areaActive = mode === "my" && prefsSet;
  const localityStatus = areaActive ? matchPilotLocality(prefs.locationKeywords) : "empty";
  const localityUnsupported = localityStatus === "unsupported";
  const localityUnclear = localityStatus === "unclear";

  // ── "Co sprawdzić teraz" status (Sprint 96) ─────────────────────────────────
  // A practical "reason to return" line, independent of whatever category/
  // search filter is currently active — always computed from the raw,
  // unfiltered `alerts` list so it answers "what's going on right now,"
  // not "what does my current filter show." Reuses data already fetched by
  // this component (no new Supabase query) — narrowed to the saved
  // okolica/categories only while that preference is actually active
  // (mode === "my"), since a saved-but-inactive preference must not claim
  // to describe what's currently shown (Sprint 158A active-scope clarity).
  const liveAlerts = alerts.filter((a) => getAlertTimeStatus(a.startsAt, a.endsAt) !== "ended");
  const liveAlertsForMe = areaActive ? liveAlerts.filter((a) => matchesMyAlerts(a, prefs)) : liveAlerts;

  // Sprint 97 — "what's actually new" is a different, complementary signal
  // from "how many are active right now": a returning visitor with the same
  // active count as last time has no reason to look again unless something
  // changed. Uses publishedAt/updatedAt — both already public fields, no
  // new query — to surface up to 2 alerts touched in the last 7 days.
  const recentlyTouched = [...liveAlertsForMe]
    .filter((a) => {
      const touchedAt = a.updatedAt || a.publishedAt;
      if (!touchedAt) return false;
      const days = (new Date().getTime() - new Date(touchedAt).getTime()) / 86_400_000;
      return days >= 0 && days <= 7;
    })
    .sort((a, b) => (b.updatedAt || b.publishedAt || "").localeCompare(a.updatedAt || a.publishedAt || ""));

  // ── Filtering pipeline ─────────────────────────────────────────────────────
  // Step 1: "Moje alerty" filter (only when mode=my and preferences exist)
  const byMyAlerts = areaActive
    ? alerts.filter((a) => matchesMyAlerts(a, prefs))
    : alerts;

  // Step 2: category button filter (always active)
  const byCategory =
    selected === "all"
      ? byMyAlerts
      : byMyAlerts.filter((a) => a.category === selected);

  // Step 3: text search (always active)
  const filtered = byCategory.filter((a) => matchesSearch(a, query));

  const hasQuery        = query.trim().length > 0;
  const categoryActive  = selected !== "all";
  const activeAxesCount = [areaActive, categoryActive, hasQuery].filter(Boolean).length;
  const selectedCategoryLabel = categoryFilters.find((f) => f.value === selected)?.label ?? "";

  // Sprint 158A — distinct, testable empty states instead of one generic
  // "no matches" message (Userbrain finding: testers couldn't tell an empty
  // area from an unsupported one from a search miss).
  type EmptyStateKind =
    | "none"             // no filters active, truly nothing to show
    | "unsupported-area" // area filter set to somewhere outside the pilot
    | "area-empty"       // area filter active, no matches, area only
    | "category-empty"   // category filter active, no matches, category only
    | "search-empty"     // search active, no matches, search only
    | "combined";         // 2+ of the above active at once

  const isEmpty = filtered.length === 0 && !loading;
  let emptyStateKind: EmptyStateKind | null = null;
  if (isEmpty) {
    if (localityUnsupported) {
      emptyStateKind = "unsupported-area";
    } else if (activeAxesCount === 0) {
      emptyStateKind = "none";
    } else if (activeAxesCount > 1) {
      emptyStateKind = "combined";
    } else if (areaActive) {
      emptyStateKind = "area-empty";
    } else if (categoryActive) {
      emptyStateKind = "category-empty";
    } else {
      emptyStateKind = "search-empty";
    }
  }

  // Sprint 103 — a filtered-empty result during early beta is a coverage
  // gap, not a bug; reuse the existing "add-area" feedback reason instead
  // of a new mailto/component (same pattern as BetaStatusCard).
  const addAreaReason = buildFeedbackQuickReasons().find((r) => r.id === "add-area");

  // Separate current/upcoming alerts from ended ones so stale content never
  // looks as prominent as live content — order within each group is already
  // correct from sortAlerts(), this just splits the already-sorted list.
  const liveFiltered  = filtered.filter((a) => getAlertTimeStatus(a.startsAt, a.endsAt) !== "ended");
  const endedFiltered = filtered.filter((a) => getAlertTimeStatus(a.startsAt, a.endsAt) === "ended");
  const showAllEndedNotice = filtered.length > 0 && liveFiltered.length === 0 && endedFiltered.length > 0;

  return (
    <>
      {/* ── Mode toggle ─────────────────────────────────────────────────── */}
      {prefsReady && (
        <div className="flex items-center gap-2 mb-1.5">
          <button
            onClick={() => handleSetMode("all")}
            className={`min-h-[44px] inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              mode === "all"
                ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-600"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Wszystkie alerty
          </button>
          <button
            onClick={() => handleSetMode("my")}
            className={`min-h-[44px] inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              mode === "my"
                ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-600"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Moja okolica
            {/* Small dot indicator when prefs are saved but mode is "all" */}
            {mode === "all" && prefsSet && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>
      )}

      {/* ── Active scope / settings entry point + "Co sprawdzić teraz" ──── */}
      {/* Sprint 158A: this box now has three distinct states instead of a
          single "locality set or not" branch — see the three branches
          below. The box itself is the single, unmistakable place that
          answers "what am I looking at right now" (Userbrain finding). */}
      {(prefsReady || !loading) && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-4 py-1.5 mb-1.5 flex flex-col gap-1.5">
          {prefsReady && (
            <>
              {!prefsSet ? (
                // State 1 — nothing saved yet.
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Ustaw swoją okolicę, aby widzieć tylko alerty, które mogą Cię dotyczyć.
                  </p>
                  <button
                    onClick={() => setShowSettingsPanel((v) => !v)}
                    aria-expanded={showSettingsPanel}
                    className="shrink-0 min-h-[44px] inline-flex items-center rounded-lg bg-blue-600 dark:bg-blue-500 px-3.5 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors"
                  >
                    Ustaw moją okolicę
                  </button>
                </div>
              ) : areaActive ? (
                // State 2 — preferences saved AND actively filtering the
                // list below right now. This is the "active scope" bar
                // required by Sprint 158A: it must state plainly what the
                // list underneath is scoped to.
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    Pokazujesz alerty dla:{" "}
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {localitySet ? prefs.locationKeywords : "wszystkich miejscowości w pilotażu"}
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Kategorie:{" "}
                      {prefs.categories.length > 0
                        ? prefs.categories
                            .map((c) => categoryFilters.find((f) => f.value === c)?.label ?? c)
                            .join(", ")
                        : "wszystkie"}
                    </p>
                    <button
                      onClick={() => setShowSettingsPanel((v) => !v)}
                      aria-expanded={showSettingsPanel}
                      className="font-medium text-blue-600 dark:text-blue-400 hover:underline text-sm shrink-0"
                    >
                      Zmień ustawienia
                    </button>
                  </div>
                </div>
              ) : (
                // State 3 — preferences saved but currently viewing
                // "Wszystkie alerty", so the saved area is NOT filtering
                // anything right now. Says so explicitly instead of
                // reusing "Pokazujesz alerty dla" wording that would be
                // misleading in this mode.
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <span>
                    Zapisana okolica:{" "}
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {localitySet ? prefs.locationKeywords : "brak, tylko kategorie"}
                    </span>{" "}
                    — nieaktywna w widoku „Wszystkie alerty”.
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => handleSetMode("my")}
                      className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Włącz Moja okolica
                    </button>
                    <button
                      onClick={() => setShowSettingsPanel((v) => !v)}
                      aria-expanded={showSettingsPanel}
                      className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Zmień ustawienia
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── "Co sprawdzić teraz" status (Sprint 96, +freshness Sprint 97) ─ */}
          {!loading && (
            <div className={`flex flex-col gap-2 ${prefsReady ? "pt-2 border-t border-slate-200 dark:border-slate-800" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {liveAlertsForMe.length}
                  </span>{" "}
                  {liveAlertsForMe.length === 1 ? "aktywny lub nadchodzący alert" : "aktywnych lub nadchodzących alertów"}
                  {areaActive ? " w Twojej okolicy" : " w tej chwili"}.
                </p>
                <Link
                  href="/odpady"
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline shrink-0"
                >
                  Sprawdź najbliższy odbiór odpadów →
                </Link>
              </div>
              {recentlyTouched.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Nowe albo zmienione w tym tygodniu:{" "}
                  {recentlyTouched.slice(0, 2).map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && ", "}
                      <span className="font-medium text-slate-600 dark:text-slate-400">{a.title}</span>
                    </span>
                  ))}
                  {recentlyTouched.length > 2 && ` i ${recentlyTouched.length - 2} więcej`}.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Settings panel — single place to set/change "Moja okolica" ──── */}
      {prefsReady && showSettingsPanel && (
        <PreferencesSection
          savedPrefs={prefs}
          onSave={handleSavePrefs}
          onClear={handleClearPrefs}
          onClose={() => setShowSettingsPanel(false)}
        />
      )}

      {/* ── "No preferences set, in Moja okolica mode" hint ─────────────── */}
      {prefsReady && mode === "my" && !prefsSet && !loading && !showSettingsPanel && (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 mb-5">
          <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
            Ustaw okolicę powyżej, aby zobaczyć spersonalizowaną listę.
          </p>
        </div>
      )}

      {/* ── Search + category filters + alert list ───────────────────────── */}
      {/* Hidden in "Moje alerty" mode when no preferences are saved yet */}
      {(loading || mode === "all" || prefsSet) && (
        <>
          {/* Search input */}
          <div className="mb-2">
            <label htmlFor="alert-search" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Szukaj w aktualnym widoku
            </label>
            <div className="relative">
              <input
                id="alert-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Szukaj po tytule lub treści alertu…"
                className={`w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 transition-colors ${
                  hasQuery ? "pr-20" : ""
                }`}
              />
              {hasQuery && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Wyczyść wyszukiwanie"
                >
                  Wyczyść
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Przeszukuje tylko alerty pokazane obecnie na liście — nie zmienia zapisanej okolicy.
            </p>
          </div>

          {/* Category filters — Sprint 156B made these wrap on all screen
              sizes so nothing hid off-screen. Sprint 158A-2 (Userbrain +
              mobile-hierarchy follow-up) replaces the wrapped two-row chip
              set with one compact select on small screens, since the wrap
              was pushing the first alert card below the fold at 390×844.
              Desktop keeps the chip row unchanged. Both controls read and
              write the same `selected` state and the same `categoryFilters`
              list, so there is exactly one filtering model, never two. */}
          <div className="mb-2">
            <div className="hidden sm:flex flex-wrap gap-1.5">
              {categoryFilters.map((filter) => {
                const isActive = filter.value === selected;
                return (
                  <button
                    key={filter.value}
                    onClick={() => setSelected(filter.value)}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-600"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
            <div className="sm:hidden">
              <label htmlFor="category-select" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Kategoria
              </label>
              <select
                id="category-select"
                value={selected}
                onChange={(e) => setSelected(e.target.value as FilterValue)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 transition-colors"
              >
                {categoryFilters.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fetch error notice */}
          {fetchError && (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-100 rounded-lg px-3 py-2 mb-4">
              Nie udało się połączyć z serwerem. Spróbuj odświeżyć stronę za chwilę.
            </p>
          )}

          {/* Loading skeleton */}
          {loading ? (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 border-l-4 border-l-slate-200 p-4 sm:p-5 animate-pulse"
                >
                  <div className="flex gap-2 mb-3">
                    <div className="h-5 w-16 bg-slate-100 dark:bg-slate-800 rounded-full" />
                    <div className="h-5 w-12 bg-slate-100 dark:bg-slate-800 rounded-full" />
                  </div>
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Alert counter */}
              {alerts.length > 0 && !isEmpty && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                  {hasQuery ? (
                    <>
                      Znaleziono alertów:{" "}
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{filtered.length}</span>
                    </>
                  ) : filtered.length === alerts.length ? (
                    <>
                      Wszystkich alertów:{" "}
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{alerts.length}</span>
                    </>
                  ) : (
                    <>
                      Wyświetlane:{" "}
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{filtered.length}</span>{" "}
                      z {alerts.length}
                    </>
                  )}
                </p>
              )}

              {/* Alert cards */}
              <section className="flex flex-col gap-4">
                {/* Empty state: area set to somewhere outside the pilot (G2) */}
                {emptyStateKind === "unsupported-area" && (
                  <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
                      Nie obsługujemy jeszcze tej okolicy.
                    </p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">
                      Obecny pilotaż obejmuje: {pilotLocalitiesLabel()}.
                    </p>
                    <button
                      onClick={() => setShowSettingsPanel(true)}
                      className="mt-4 rounded-lg bg-blue-600 dark:bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors"
                    >
                      Wybierz obsługiwaną okolicę
                    </button>
                  </div>
                )}

                {/* Empty state: area active, no active alerts there (G1) */}
                {emptyStateKind === "area-empty" && (
                  <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
                      Dobra wiadomość — obecnie nie mamy aktywnych alertów dla{" "}
                      {localitySet ? prefs.locationKeywords : "wybranych kategorii"}.
                    </p>
                    {localityUnclear && (
                      <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">
                        Nie znaleźliśmy obecnie alertów dla tego ustawienia. Sprawdź, czy
                        wybrana okolica znajduje się w obszarze pilotażu ({pilotLocalitiesLabel()}).
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                      <button
                        onClick={() => setShowSettingsPanel(true)}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        Zmień okolicę
                      </button>
                      <button
                        onClick={() => handleSetMode("all")}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        Pokaż wszystkie alerty
                      </button>
                    </div>
                  </div>
                )}

                {/* Empty state: category filter active, no matches (G4) */}
                {emptyStateKind === "category-empty" && (
                  <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
                      Nie ma obecnie aktywnych alertów kategorii {selectedCategoryLabel} w tym widoku.
                    </p>
                    <button
                      onClick={() => setSelected("all")}
                      className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      Pokaż wszystkie kategorie
                    </button>
                  </div>
                )}

                {/* Empty state: search active, no matches (G3) */}
                {emptyStateKind === "search-empty" && (
                  <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
                      Nie znaleziono alertów pasujących do wpisanej frazy.
                    </p>
                    <button
                      onClick={() => setQuery("")}
                      className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      Wyczyść wyszukiwanie
                    </button>
                  </div>
                )}

                {/* Empty state: 2+ filters active at once (G5) — name each
                    active condition explicitly instead of one vague message */}
                {emptyStateKind === "combined" && (
                  <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
                      Brak alertów spełniających kilka aktywnych warunków naraz.
                    </p>
                    <ul className="text-sm text-slate-500 dark:text-slate-400 mt-3 flex flex-col gap-1.5 items-center">
                      {areaActive && (
                        <li>
                          Okolica: <span className="font-medium text-slate-700 dark:text-slate-300">{localitySet ? prefs.locationKeywords : "wybrane kategorie"}</span>{" "}
                          <button onClick={() => setShowSettingsPanel(true)} className="text-blue-600 dark:text-blue-400 hover:underline">
                            Zmień
                          </button>
                        </li>
                      )}
                      {categoryActive && (
                        <li>
                          Kategoria: <span className="font-medium text-slate-700 dark:text-slate-300">{selectedCategoryLabel}</span>{" "}
                          <button onClick={() => setSelected("all")} className="text-blue-600 dark:text-blue-400 hover:underline">
                            Wyczyść
                          </button>
                        </li>
                      )}
                      {hasQuery && (
                        <li>
                          Szukana fraza: <span className="font-medium text-slate-700 dark:text-slate-300">„{query}”</span>{" "}
                          <button onClick={() => setQuery("")} className="text-blue-600 dark:text-blue-400 hover:underline">
                            Wyczyść
                          </button>
                        </li>
                      )}
                    </ul>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
                      To nie błąd — liczba alertów i okolic w pilotażu jest jeszcze ograniczona.
                      {addAreaReason && (
                        <>
                          {" "}
                          <a href={addAreaReason.mailto} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                            Zgłoś swoją okolicę →
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                )}

                {/* Empty state: no filters at all, nothing to show */}
                {emptyStateKind === "none" && (
                  <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
                      Brak aktualnych alertów.
                    </p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">
                      Gdy pojawią się nowe komunikaty, zobaczysz je tutaj.
                    </p>
                  </div>
                )}

                {/* Notice: only ended alerts match — make this explicit instead of
                    silently showing stale content as if it were current */}
                {showAllEndedNotice && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Brak aktualnych alertów — poniżej mogą być widoczne zakończone
                      przykłady lub poprzednie komunikaty.
                    </p>
                  </div>
                )}

                {/* Current/upcoming alerts — full prominence */}
                {liveFiltered.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}

                {/* Ended alerts — de-emphasized and collapsed by default when
                    current alerts exist; expanded automatically when they are
                    the only thing matching (the notice above explains that) */}
                {endedFiltered.length > 0 && (
                  <div className="flex flex-col gap-4">
                    {liveFiltered.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Zakończone
                        </span>
                        <button
                          onClick={() => setShowEnded((prev) => !prev)}
                          aria-expanded={showEnded}
                          className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 underline underline-offset-2 transition-colors"
                        >
                          {showEnded
                            ? "Ukryj zakończone"
                            : `Pokaż zakończone (${endedFiltered.length})`}
                        </button>
                        <span className="text-xs text-slate-400 dark:text-slate-500">— pokazane pomocniczo</span>
                      </div>
                    )}
                    {(showEnded || liveFiltered.length === 0) &&
                      endedFiltered.map((alert) => (
                        <div key={alert.id} className="opacity-60">
                          <AlertCard alert={alert} />
                        </div>
                      ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
