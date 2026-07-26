"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { authFetch } from "@/lib/apiClientAuth";
import type { Session } from "@supabase/supabase-js";
import type {
  AlertSource,
  AlertSourceInput,
  AlertSourceType,
  SourceCheck,
  SourceCheckResult,
} from "@/types/alertSource";
import type { AlertCategory } from "@/types/alert";
import {
  getAlertSources,
  createAlertSource,
  updateAlertSource,
  deleteAlertSource,
  toggleAlertSourceActive,
  markAlertSourceChecked,
  getSourceChecks,
  createSourceCheck,
  getSourceCandidates,
} from "@/lib/supabaseSourceWrites";
import {
  getSourceCandidateNotices,
  createSourceCandidateNotice,
} from "@/lib/supabaseCandidateWrites";
import { getAdminSupabaseAlerts } from "@/lib/getAdminSupabaseAlerts";
import { findSimilarText, trimAtWord } from "@/lib/candidateWarnings";
import { OfficialSourceChecklist } from "@/components/OfficialSourceChecklist";
import { SourceHealthDashboard } from "@/components/SourceHealthDashboard";
import {
  buildSourceHealthRows,
  nextSessionCheckOutcome,
  type HealthCandidate,
  type SessionCheckOutcome,
} from "@/lib/sourceHealth";
import { ScheduledWriterMonitoring } from "@/components/ScheduledWriterMonitoring";
import { AutomationStatusPanel } from "@/components/AutomationStatusPanel";
import { LinkHealthPanel } from "@/components/LinkHealthPanel";
import { buildScheduledWriterActivity, type WriterActivityCandidateInput } from "@/lib/writerCandidateActivity";
import {
  detectParserStrategy,
  PARSER_STRATEGY_LABELS,
  getPdfManualInstructions,
} from "@/lib/sourceParsers";

// ── Constants ─────────────────────────────────────────────────────────────────

const PENDING_SOURCE_KEY      = "alertownik_pending_source_for_ai";
const AI_PENDING_KEY          = "alertownik_pending_ai_alert_json";
const AI_PENDING_SOURCE_ID_KEY = "alertownik_pending_alert_source_id";

// ── Labels ────────────────────────────────────────────────────────────────────

const categoryLabels: Record<AlertCategory, string> = {
  transport: "Transport",
  water:     "Woda",
  power:     "Prąd",
  waste:     "Odpady",
  roads:     "Drogi",
  municipal: "Komunikaty",
};

const sourceTypeLabels: Record<AlertSourceType, string> = {
  website: "Strona WWW",
  pdf:     "PDF",
  rss:     "RSS/Feed",
  other:   "Inne",
};

const CATEGORIES: AlertCategory[] = [
  "transport", "water", "power", "waste", "roads", "municipal",
];

const SOURCE_TYPES: AlertSourceType[] = ["website", "pdf", "rss", "other"];

// ── Pilot source suggestions ─────────────────────────────────────────────────
// Real, verified pilot targets for the WKD / Komorów / Pruszków area (Sprint 64).
// "Wypełnij formularz" only pre-fills the add-source form — admin still reviews
// and clicks "Dodaj źródło" themselves before anything is saved to Supabase.

interface PilotSourceSuggestion extends AlertSourceInput {
  id: string;
}

const PILOT_SOURCE_SUGGESTIONS: PilotSourceSuggestion[] = [
  {
    id: "wkd",
    name: "WKD — aktualności",
    url: "https://wkd.com.pl/aktualnosci",
    category: "transport",
    sourceType: "website",
    notes: "Komunikaty o zmianach rozkładu i utrudnieniach na liniach WKD.",
  },
  {
    id: "michalowice",
    name: "Gmina Michałowice — komunikaty",
    url: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty",
    category: "municipal",
    sourceType: "website",
    notes: "Komunikaty gminne dla Komorowa i okolic (gmina Michałowice).",
  },
  {
    id: "pruszkow",
    name: "Miasto Pruszków — aktualności dla mieszkańców",
    url: "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/",
    category: "municipal",
    sourceType: "other",
    notes:
      "Aktualności i ogłoszenia urzędu miasta Pruszków. Strona blokuje automatyczne pobieranie " +
      "(HTTP 403, potwierdzone dwukrotnie) — traktuj jako źródło manualne, sprawdzaj ręcznie w przeglądarce.",
  },
  {
    id: "pge",
    name: "PGE Dystrybucja — planowane wyłączenia",
    url: "https://pgedystrybucja.pl/wylaczenia",
    category: "power",
    sourceType: "website",
    notes:
      "Oficjalne źródło planowanych wyłączeń — gmina Michałowice sama odsyła tam mieszkańców. " +
      "Podstrona planowanych wyłączeń: pgedystrybucja.pl/wylaczenia/planowane-wylaczenia. Lista dla " +
      "konkretnego adresu wymaga wyboru rejonu w przeglądarce — sprawdzaj ręcznie (Komorów, Nowa Wieś, " +
      "Granica, Michałowice, Reguły, Pruszków), automatyczny podgląd zwykle nie pokaże aktualnych wyłączeń.",
  },
  {
    id: "wodociagi-michalowice",
    name: "Wodociągi Michałowice",
    url: "https://wodociagimichalowice.pl/",
    category: "water",
    sourceType: "website",
    notes: "Przerwy i awarie w dostawie wody w gminie Michałowice.",
  },
  {
    id: "mzo-pruszkow",
    name: "Pruszków — terminy odbioru odpadów",
    url: "https://www.pruszkow.pl/mieszkancy/terminy-odbioru-odpadow/",
    category: "waste",
    sourceType: "other",
    notes:
      "Harmonogram odbioru odpadów komunalnych w Pruszkowie (MZO Pruszków). Ta sama domena blokuje " +
      "automatyczne pobieranie (HTTP 403) — traktuj jako źródło manualne.",
  },
  {
    id: "eco-harmonogram-pruszkow",
    name: "Eco-Harmonogram (Pruszków)",
    url: "https://www.pruszkow.pl/aplikacja-eco-harmonogram/",
    category: "waste",
    sourceType: "other",
    notes:
      "Adresowa aplikacja gminna z harmonogramem odbioru odpadów. Ta sama domena co inne źródła " +
      "Pruszkowa blokujące automatyczne pobieranie — nie testowana osobno, traktuj jako manualne.",
  },
  {
    id: "michalowice-harmonogram-odpadow",
    name: "Gmina Michałowice — harmonogram odbioru odpadów",
    url: "https://www.michalowice.pl/ochrona-srodowiska/odbior-odpadow/nowy-harmonogram-odbioru-odpadow-komunalnych",
    category: "waste",
    sourceType: "pdf",
    notes:
      "Strona linkuje realne PDF-y harmonogramu na 2026 rok (znalezione Sprint 88) — strona sama się " +
      "ładuje, ale PDF-y są skanowane/skompresowane, więc wymagają ręcznego przepisania (zob. docs/OFFICIAL_DATA_NEEDED.md).",
  },
];

// ── Source preview types (fetch-preview result, ephemeral UI only) ─────────────

interface SourcePreviewCandidate {
  heading?: string;
  text: string;
  hasDate?: boolean;
}

interface SourcePreviewData {
  pageTitle: string;
  fetchedAt: string;
  candidates: SourcePreviewCandidate[];
  rawText: string;
  feedUrl?: string;
}

// ── Inline AI draft (generated in-card from preview content) ─────────────────

interface InlineDraftData {
  title: string;
  category: string;
  severity: string;
  startsAt: string | null;
  endsAt: string | null;
  place: string;
  change: string;
  action: string;
  sourceName: string;
  sourceUrl?: string | null;
}

type InlineDraftState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; draft: InlineDraftData; rawJson: string; warnings: string[]; mode: "mock" | "anthropic"; sourceText: string }
  | { status: "error"; error: string };

// ── Monitoring status ─────────────────────────────────────────────────────────

type MonitoringStatus =
  | "do_sprawdzenia"
  | "sprawdzone_dzis"
  | "ostatnio_sprawdzone"
  | "nieaktywne";

const monitoringConfig: Record<
  MonitoringStatus,
  { label: string; badge: string }
> = {
  do_sprawdzenia:      { label: "Do sprawdzenia",    badge: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200" },
  sprawdzone_dzis:     { label: "Sprawdzone dziś",   badge: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200" },
  ostatnio_sprawdzone: { label: "Ostatnio sprawdzone", badge: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-slate-200" },
  nieaktywne:          { label: "Nieaktywne",        badge: "bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 ring-1 ring-slate-200" },
};

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function getMonitoringStatus(source: AlertSource): MonitoringStatus {
  if (!source.isActive) return "nieaktywne";
  if (!source.lastCheckedAt) return "do_sprawdzenia";
  const checkedDate = source.lastCheckedAt.split("T")[0];
  return checkedDate === todayString() ? "sprawdzone_dzis" : "ostatnio_sprawdzone";
}

// "Ostatnio sprawdzone" used to be one flat label regardless of whether that
// was yesterday or a month ago — for real, growing monitoring this hides the
// exact thing an admin needs to notice (a source nobody has looked at in
// weeks). Computed per-source instead of via the static monitoringConfig
// lookup; the other 3 statuses stay static since "today"/"never"/"inactive"
// don't need relative-time granularity.
function getMonitoringBadge(source: AlertSource): { label: string; badge: string } {
  const status = getMonitoringStatus(source);
  if (status === "ostatnio_sprawdzone" && source.lastCheckedAt) {
    const days = daysSince(source.lastCheckedAt);
    const stale = days > 7;
    return {
      label: days === 1 ? "Sprawdzone wczoraj" : `Sprawdzone ${days} dni temu`,
      badge: stale
        ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200"
        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-slate-200",
    };
  }
  return monitoringConfig[status];
}

function needsChecking(source: AlertSource): boolean {
  if (!source.isActive) return false;
  if (!source.lastCheckedAt) return true;
  return source.lastCheckedAt.split("T")[0] !== todayString();
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500";
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyForm(): AlertSourceInput {
  return { name: "", url: "", category: "municipal", sourceType: "website", notes: "" };
}

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day:      "numeric",
    month:    "short",
    year:     "numeric",
    hour:     "2-digit",
    minute:   "2-digit",
    timeZone: "Europe/Warsaw",
  });
}

function matchesSearch(source: AlertSource, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return (
    source.name.toLowerCase().includes(q) ||
    (source.url ?? "").toLowerCase().includes(q) ||
    (source.notes ?? "").toLowerCase().includes(q) ||
    categoryLabels[source.category].toLowerCase().includes(q)
  );
}

// ── Status filter ─────────────────────────────────────────────────────────────

type StatusFilter = "all" | "active" | "inactive" | "do_sprawdzenia" | "sprawdzone_dzis";

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: "all",             label: "Wszystkie" },
  { value: "active",          label: "Aktywne" },
  { value: "inactive",        label: "Nieaktywne" },
  { value: "do_sprawdzenia",  label: "Do sprawdzenia" },
  { value: "sprawdzone_dzis", label: "Sprawdzone dziś" },
];

function matchesStatusFilter(source: AlertSource, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return source.isActive;
  if (filter === "inactive") return !source.isActive;
  if (filter === "do_sprawdzenia") return needsChecking(source);
  if (filter === "sprawdzone_dzis") {
    if (!source.lastCheckedAt) return false;
    return source.lastCheckedAt.split("T")[0] === todayString();
  }
  return true;
}

// ── Check result config ───────────────────────────────────────────────────────

const CHECK_RESULT_OPTIONS: { value: SourceCheckResult; label: string }[] = [
  { value: "no_changes",     label: "Brak zmian" },
  { value: "found_notice",   label: "Znaleziono komunikat" },
  { value: "alert_created",  label: "Przygotowano alert" },
  { value: "needs_followup", label: "Wymaga późniejszego sprawdzenia" },
];

const resultConfig: Record<SourceCheckResult, { label: string; color: string }> = {
  no_changes:     { label: "Brak zmian",                     color: "text-slate-600 dark:text-slate-400" },
  found_notice:   { label: "Znaleziono komunikat",           color: "text-blue-600 dark:text-blue-400" },
  alert_created:  { label: "Przygotowano alert",             color: "text-emerald-600" },
  needs_followup: { label: "Wymaga późniejszego sprawdzenia", color: "text-amber-600 dark:text-amber-300" },
};

const severityConfig: Record<string, { label: string; color: string }> = {
  info:    { label: "Info",  color: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30" },
  warning: { label: "Uwaga", color: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30" },
  urgent:  { label: "Pilne", color: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30" },
};

// Results that warrant showing the notice text field
const NOTICE_RESULTS: SourceCheckResult[] = ["found_notice", "alert_created", "needs_followup"];

// Results that show the "Przygotuj alert" shortcut in history
const ALERT_SHORTCUT_RESULTS: SourceCheckResult[] = ["found_notice", "needs_followup"];

// ── PilotSourceSuggestions component ──────────────────────────────────────────

interface PilotSourceSuggestionsProps {
  existingUrls: Set<string>;
  onFillForm: (suggestion: PilotSourceSuggestion) => void;
}

function PilotSourceSuggestions({ existingUrls, onFillForm }: PilotSourceSuggestionsProps) {
  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/40 dark:bg-blue-500/10 p-4 mb-5">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">
        Pilotażowe źródła — WKD / Komorów / Pruszków
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
        Sprawdzone real adresy dla pierwszego pilotu. „Wypełnij formularz" tylko
        przygotowuje formularz dodawania — źródło zapisuje się dopiero po Twojej
        weryfikacji i kliknięciu „Dodaj źródło".
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {PILOT_SOURCE_SUGGESTIONS.map((s) => {
          const added = existingUrls.has(s.url);
          return (
            <div
              key={s.id}
              className={`rounded-lg border p-3 ${added ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/15" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{s.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {categoryLabels[s.category]} · {sourceTypeLabels[s.sourceType]}
                  </p>
                </div>
                {added ? (
                  <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-300">Dodano ✓</span>
                ) : (
                  <button
                    onClick={() => onFillForm(s)}
                    className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                  >
                    Wypełnij formularz →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── SourceForm component ──────────────────────────────────────────────────────

interface SourceFormProps {
  form: AlertSourceInput;
  onChange: (updated: AlertSourceInput) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  saveError: string | null;
  submitLabel: string;
  onCancel: () => void;
}

function SourceForm({
  form, onChange, onSubmit, saving, saveError, submitLabel, onCancel,
}: SourceFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
    >
      {/* Sprint 104 — admin helper text: the one hard rule from Real Data
          Admin Checklist / Admin Source Seeding Checklist, restated where
          the mistake would actually happen. */}
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Zanim dodasz: otwórz link w przeglądarce i potwierdź, że strona
        faktycznie istnieje i pochodzi z oficjalnego źródła. Nie dodawaj
        źródła, którego nie da się zweryfikować.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Nazwa źródła</label>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="np. WKD"
            required
          />
        </div>
        <div>
          <label className={labelClass}>Link</label>
          <input
            className={inputClass}
            type="url"
            value={form.url}
            onChange={(e) => onChange({ ...form, url: e.target.value })}
            placeholder="https://..."
            required
          />
        </div>
        <div>
          <label className={labelClass}>Kategoria</label>
          <select
            className={inputClass}
            value={form.category}
            onChange={(e) => onChange({ ...form, category: e.target.value as AlertCategory })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{categoryLabels[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Typ źródła</label>
          <select
            className={inputClass}
            value={form.sourceType}
            onChange={(e) => onChange({ ...form, sourceType: e.target.value as AlertSourceType })}
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>{sourceTypeLabels[t]}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Jeśli źródło ma kanał RSS, oznacz „RSS/Feed" — ułatwi to przyszłą automatyzację.
            Jeśli strona blokuje automatyczne pobieranie (np. błąd 403 przy „Sprawdź stronę"),
            oznacz „Inne" — podgląd nadal spróbuje pobrać stronę, ale traktuj ją jako źródło manualne.
          </p>
        </div>
      </div>
      <div>
        <label className={labelClass}>Notatki</label>
        <textarea
          className={inputClass}
          rows={2}
          value={form.notes ?? ""}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
          placeholder="Opcjonalne uwagi o tym źródle..."
        />
      </div>

      {saveError && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
          {saveError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-700 dark:hover:bg-blue-400 disabled:opacity-50 transition-colors"
        >
          {saving ? "Zapisywanie…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}

// ── SourceCard component ──────────────────────────────────────────────────────

interface SourceCardProps {
  source: AlertSource;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onPrepareAlert: () => void;
  onMarkChecked: () => void;
  markingChecked: boolean;
  alertCount: number;
  pendingCandidateCount: number;
  checks: SourceCheck[];
  onCheckSaved: () => void;
  /** Titles/excerpts of already-pending persistent candidates + known alert
   *  titles — used only for the "possible duplicate" warning before saving
   *  a new candidate (Sprint 78). Not persisted, just a confirm() prompt. */
  existingCandidateTexts: string[];
  alertTitles: string[];
  onCandidateSaved: () => void;
}

function SourceCard({
  source, onEdit, onToggle, onDelete, onPrepareAlert, onMarkChecked,
  markingChecked, alertCount, pendingCandidateCount, checks, onCheckSaved,
  existingCandidateTexts, alertTitles, onCandidateSaved,
}: SourceCardProps) {
  const router    = useRouter();
  const inactive  = !source.isActive;
  const monStatus = getMonitoringStatus(source);
  const monCfg    = getMonitoringBadge(source);

  const [showPanel,        setShowPanel]        = useState(false);
  const [formResult,       setFormResult]       = useState<SourceCheckResult>("no_changes");
  const [formNotes,        setFormNotes]        = useState("");
  const [formNoticeText,   setFormNoticeText]   = useState("");
  const [savingCheck,      setSavingCheck]      = useState(false);
  const [checkMsg,         setCheckMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [savedCheckResult, setSavedCheckResult] = useState<SourceCheckResult | null>(null);
  const [savedCheckNotes,  setSavedCheckNotes]  = useState("");

  // Source preview (fetch-preview API — ephemeral, not stored in DB)
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "success" | "error" | "pdf_manual">("idle");
  const [previewData,   setPreviewData]   = useState<SourcePreviewData | null>(null);
  const [previewError,  setPreviewError]  = useState<string | null>(null);

  // Inline AI draft (generated directly from preview content without leaving the page)
  const [inlineDraft,     setInlineDraft]     = useState<InlineDraftState>({ status: "idle" });
  const [inlineDraftSent, setInlineDraftSent] = useState(false);

  // Persistent candidate saving (Sprint 78) — keyed per preview snippet so
  // multiple snippets on the same card can each show their own state.
  const [savingCandidateKey, setSavingCandidateKey] = useState<string | null>(null);
  const [savedCandidateKeys, setSavedCandidateKeys] = useState<Set<string>>(new Set());
  const [candidateSaveError, setCandidateSaveError] = useState<string | null>(null);

  const showNoticeField = NOTICE_RESULTS.includes(formResult);

  async function saveAsCandidate(key: string, text: string, heading?: string) {
    setCandidateSaveError(null);
    const trimmed = text.trim();
    if (!trimmed) return;
    const similar = findSimilarText(trimmed, existingCandidateTexts) ?? findSimilarText(trimmed, alertTitles);
    if (similar) {
      const proceed = confirm(
        `Możliwy duplikat — podobna treść już istnieje: „${similar.slice(0, 100)}". Zapisać mimo to jako nowego kandydata?`
      );
      if (!proceed) return;
    }
    setSavingCandidateKey(key);
    const result = await createSourceCandidateNotice({
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url || undefined,
      title: (heading || trimAtWord(trimmed, 80)).trim(),
      excerpt: trimmed.slice(0, 300),
      rawText: trimmed,
    });
    setSavingCandidateKey(null);
    if (!result.ok) {
      setCandidateSaveError(result.error ?? "Nie udało się zapisać kandydata.");
      return;
    }
    setSavedCandidateKeys((prev) => new Set(prev).add(key));
    onCandidateSaved();
  }

  function handleResultChange(newResult: SourceCheckResult) {
    setFormResult(newResult);
    setSavedCheckResult(null);
    setFormNoticeText("");
  }

  function handlePrepareAlertFromCheck(checkNotes?: string) {
    sessionStorage.setItem(PENDING_SOURCE_KEY, JSON.stringify({
      sourceId:          source.id,
      sourceName:        source.name,
      sourceUrl:         source.url,
      suggestedCategory: source.category,
      checkNotes:        checkNotes ?? "",
    }));
    router.push("/ai-helper");
  }

  async function handleSaveCheck() {
    setSavingCheck(true);
    setCheckMsg(null);
    setSavedCheckResult(null);

    const noticeText  = formNoticeText.trim();
    const generalNote = formNotes.trim();
    const combinedNotes = [noticeText, generalNote].filter(Boolean).join("\n---\n");

    const res = await createSourceCheck({
      sourceId: source.id,
      result:   formResult,
      notes:    combinedNotes || undefined,
    });
    setSavingCheck(false);
    if (!res.ok) {
      setCheckMsg({ ok: false, text: "Nie udało się zapisać wyniku sprawdzenia." });
      return;
    }
    setSavedCheckResult(formResult);
    setSavedCheckNotes(combinedNotes);
    setFormNoticeText("");
    setFormNotes("");
    setCheckMsg({ ok: true, text: "Wynik sprawdzenia zapisany." });
    onCheckSaved();
    setTimeout(() => setCheckMsg(null), 5000);
  }

  async function fetchPreview() {
    if (previewStatus === "loading") return;
    // Second click closes the panel
    if (previewStatus === "success" || previewStatus === "pdf_manual") {
      setPreviewStatus("idle");
      setPreviewData(null);
      setInlineDraft({ status: "idle" });
      setInlineDraftSent(false);
      return;
    }
    // PDF/manual sources aren't HTML pages — skip the fetch entirely and
    // show the manual-fallback instructions directly (see
    // src/lib/sourceParsers/pdfParser.ts).
    if (source.sourceType === "pdf") {
      setPreviewStatus("pdf_manual");
      return;
    }
    setPreviewStatus("loading");
    setPreviewError(null);
    setInlineDraft({ status: "idle" });
    setInlineDraftSent(false);
    try {
      const res = await authFetch("/api/sources/fetch-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: source.url }),
      });
      const data = await res.json();
      if (!data.ok) {
        setPreviewError(data.error ?? "Nie udało się pobrać podglądu.");
        setPreviewStatus("error");
      } else {
        setPreviewData(data as SourcePreviewData);
        setPreviewStatus("success");
      }
    } catch {
      setPreviewError("Błąd połączenia z serwerem. Spróbuj ponownie.");
      setPreviewStatus("error");
    }
  }

  async function generateInlineDraft(sourceText: string) {
    if (inlineDraft.status === "loading") return;
    setInlineDraft({ status: "loading" });
    setInlineDraftSent(false);
    try {
      const res = await authFetch("/api/ai/draft-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText,
          sourceName:        source.name,
          sourceUrl:         source.url || undefined,
          suggestedCategory: source.category,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setInlineDraft({ status: "error", error: data.error ?? "Nie udało się wygenerować draftu." });
      } else {
        setInlineDraft({
          status:     "success",
          draft:      data.draft as InlineDraftData,
          rawJson:    JSON.stringify(data.draft, null, 2),
          warnings:   Array.isArray(data.warnings) ? data.warnings : [],
          mode:       data.mode ?? "mock",
          sourceText,
        });
      }
    } catch {
      setInlineDraft({ status: "error", error: "Błąd połączenia z serwerem." });
    }
  }

  function sendInlineDraftToBuilder() {
    if (inlineDraft.status !== "success") return;
    sessionStorage.setItem(AI_PENDING_KEY, inlineDraft.rawJson);
    sessionStorage.setItem(AI_PENDING_SOURCE_ID_KEY, source.id);
    setInlineDraftSent(true);
    router.push("/builder");
  }

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        inactive
          ? "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 opacity-70"
          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm"
      }`}
    >
      {/* ── Top: info + management buttons ─────────────────────────── */}
      <div className="flex items-start gap-3">

        {/* Source info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className={`font-semibold text-sm ${inactive ? "text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-white"}`}>
              {source.name}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${monCfg.badge}`}>
              {monCfg.label}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full">
              {categoryLabels[source.category]}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full">
              {sourceTypeLabels[source.sourceType]}
            </span>
            <span className="text-xs text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-100 dark:border-indigo-500/20 px-2 py-0.5 rounded-full">
              {PARSER_STRATEGY_LABELS[detectParserStrategy(source.sourceType)]}
            </span>
            {!source.url && (
              <span className="text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-2 py-0.5 rounded-full">
                ⚠ Brak adresu URL
              </span>
            )}
          </div>

          <a
            href={source.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline truncate block"
          >
            {source.url}
          </a>

          {source.notes && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{source.notes}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {source.lastCheckedAt
                ? `Ostatnio sprawdzono: ${formatCheckedAt(source.lastCheckedAt)}`
                : "Jeszcze nie sprawdzano"}
            </p>
            {checks[0] && (
              <span className={`text-xs font-medium ${resultConfig[checks[0].result].color}`}>
                · {resultConfig[checks[0].result].label}
              </span>
            )}
          </div>
        </div>

        {/* Management buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Edytuj
          </button>
          <button
            onClick={onToggle}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              source.isActive
                ? "text-amber-600 dark:text-amber-300 hover:text-amber-800 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                : "text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50"
            }`}
          >
            {source.isActive ? "Wyłącz" : "Włącz"}
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
          >
            Usuń
          </button>
        </div>
      </div>

      {/* ── Footer: workflow actions ────────────────────────────────── */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onPrepareAlert}
            className="px-3 py-1.5 bg-blue-600 dark:bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors"
          >
            Przygotuj alert
          </button>
          <button
            onClick={fetchPreview}
            disabled={previewStatus === "loading"}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
              previewStatus === "success" || previewStatus === "pdf_manual"
                ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {previewStatus === "loading"
              ? "Pobieranie…"
              : previewStatus === "success" || previewStatus === "pdf_manual"
                ? "Podgląd ↑"
                : source.sourceType === "pdf"
                  ? "Instrukcja PDF"
                  : "Sprawdź stronę"}
          </button>
          <a
            href={source.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Otwórz źródło ↗
          </a>
          <Link
            href="/builder"
            className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Otwórz Kreator →
          </Link>
          <button
            onClick={onMarkChecked}
            disabled={markingChecked}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
              monStatus === "sprawdzone_dzis"
                ? "text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {markingChecked ? "Oznaczanie…" : "Oznacz jako sprawdzone"}
          </button>
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Historia{checks.length > 0 ? ` (${checks.length})` : ""} {showPanel ? "↑" : "↓"}
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400 dark:text-slate-500">Alerty: {alertCount}</span>
          <Link
            href={`/admin/queue?source=${source.id}`}
            className={`text-xs font-medium ${
              pendingCandidateCount > 0 ? "text-purple-600 dark:text-purple-400 hover:text-purple-800" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
            } hover:underline`}
          >
            Kandydaci: {pendingCandidateCount} →
          </Link>
        </div>
      </div>

      {/* ── Source preview panel ─────────────────────────────────────── */}
      {(previewStatus === "success" || previewStatus === "error" || previewStatus === "pdf_manual") && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {previewStatus === "error" && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span className="font-medium shrink-0">Nie udało się pobrać:</span>
                <span className="flex-1">{previewError}</span>
                <button
                  onClick={() => setPreviewStatus("idle")}
                  className="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-400 font-bold leading-none"
                  aria-label="Zamknij"
                >
                  ×
                </button>
              </div>
              {/* Sprint 90: automated fetch failing (bot-block, timeout,
                  4xx/5xx) doesn't mean the source is unusable — it just
                  means a human has to read it instead. Without these, the
                  admin saw the error text but no actionable next step. */}
              <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-red-100">
                <a
                  href={source.url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-red-700 dark:text-red-400 hover:text-red-900 hover:underline"
                >
                  Otwórz źródło ręcznie →
                </a>
                <button
                  onClick={() => handlePrepareAlertFromCheck()}
                  className="font-medium text-red-700 dark:text-red-400 hover:text-red-900 hover:underline"
                >
                  Wyślij źródło do AI Helpera →
                </button>
              </div>
            </div>
          )}

          {previewStatus === "pdf_manual" && (
            <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5">
              <span className="flex-1">{getPdfManualInstructions(source.url).instructions}</span>
              <button
                onClick={() => setPreviewStatus("idle")}
                className="shrink-0 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 font-bold leading-none"
                aria-label="Zamknij"
              >
                ×
              </button>
            </div>
          )}

          {previewStatus === "success" && previewData && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Podgląd strony
                </p>
                <button
                  onClick={() => {
                    setPreviewStatus("idle");
                    setPreviewData(null);
                    setInlineDraft({ status: "idle" });
                    setInlineDraftSent(false);
                  }}
                  className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 px-1 py-0.5"
                  aria-label="Zamknij podgląd"
                >
                  Zamknij ×
                </button>
              </div>

              {previewData.pageTitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 truncate">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{previewData.pageTitle}</span>
                  {" — "}pobrano {formatCheckedAt(previewData.fetchedAt)}
                </p>
              )}

              {previewData.feedUrl && (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-3 py-2 mb-3">
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">
                    Wykryto możliwy kanał RSS:{" "}
                    <a
                      href={previewData.feedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline hover:text-emerald-900"
                    >
                      {previewData.feedUrl}
                    </a>
                    . Rozważ ustawienie „Typ źródła" na „RSS/Feed" dla tego źródła.
                  </p>
                </div>
              )}

              {previewData.candidates.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
                  Nie znaleziono czytelnych fragmentów tekstu. Otwórz stronę i skopiuj treść ręcznie do AI Helpera.
                </p>
              ) : (
                <div className="space-y-2 mb-3">
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">
                    Znalezione fragmenty ({previewData.candidates.length}) — wybierz fragment do przetworzenia:
                  </p>
                  {previewData.candidates.map((c, i) => {
                    const candidateText = (c.heading ? c.heading + "\n\n" : "") + c.text;
                    return (
                      <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                        {c.heading && (
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1 truncate">{c.heading}</p>
                        )}
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">{c.text}</p>
                        <div className="flex flex-wrap gap-3 mt-1">
                          {c.hasDate && (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                              📅 wykryto datę
                            </span>
                          )}
                          {!c.heading && !c.hasDate && c.text.length < 150 && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-300">
                              ⚠ mało konkretnej treści — sprawdź ręcznie
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3">
                          <button
                            onClick={() => generateInlineDraft(candidateText)}
                            disabled={inlineDraft.status === "loading"}
                            className="text-xs font-medium text-emerald-600 hover:text-emerald-800 hover:underline disabled:opacity-50"
                          >
                            {inlineDraft.status === "loading" ? "Generowanie…" : "Generuj draft AI →"}
                          </button>
                          <button
                            onClick={() => handlePrepareAlertFromCheck(candidateText)}
                            className="text-xs font-medium text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
                          >
                            Wyślij do AI Helpera →
                          </button>
                          <button
                            onClick={() => saveAsCandidate(`c${i}`, candidateText, c.heading)}
                            disabled={savingCandidateKey === `c${i}` || savedCandidateKeys.has(`c${i}`)}
                            className="text-xs font-medium text-amber-600 dark:text-amber-300 hover:text-amber-800 hover:underline disabled:opacity-50"
                          >
                            {savedCandidateKeys.has(`c${i}`)
                              ? "Zapisano jako kandydat ✓"
                              : savingCandidateKey === `c${i}`
                                ? "Zapisywanie…"
                                : "Zapisz jako kandydata →"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {previewData.rawText && (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      const text = previewData?.rawText;
                      if (text) generateInlineDraft(text.slice(0, 3000));
                    }}
                    disabled={inlineDraft.status === "loading"}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:underline font-medium disabled:opacity-50"
                  >
                    {inlineDraft.status === "loading" ? "Generowanie…" : "Generuj draft AI z całej treści →"}
                  </button>
                  <button
                    onClick={() => {
                      const text = previewData?.rawText;
                      if (text) handlePrepareAlertFromCheck(text.slice(0, 3000));
                    }}
                    className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 hover:underline"
                  >
                    Wyślij do AI Helpera →
                  </button>
                  <button
                    onClick={() => {
                      const text = previewData?.rawText;
                      if (text) saveAsCandidate("full", text.slice(0, 3000));
                    }}
                    disabled={savingCandidateKey === "full" || savedCandidateKeys.has("full")}
                    className="text-xs text-amber-600 dark:text-amber-300 hover:text-amber-800 hover:underline font-medium disabled:opacity-50"
                  >
                    {savedCandidateKeys.has("full")
                      ? "Zapisano jako kandydat ✓"
                      : savingCandidateKey === "full"
                        ? "Zapisywanie…"
                        : "Zapisz jako kandydata →"}
                  </button>
                </div>
              )}

              {candidateSaveError && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
                  {candidateSaveError}
                </p>
              )}

              {/* Sprint 133: with the candidate table live, a successful save
                  should lead somewhere — straight to the queue where the new
                  candidate now sits as "Oczekujące". */}
              {savedCandidateKeys.size > 0 && (
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-lg px-3 py-2">
                  Kandydat zapisany w kolejce (status „Oczekujące”).{" "}
                  <Link
                    href={`/admin/queue?source=${source.id}`}
                    className="font-medium text-emerald-800 dark:text-emerald-300 underline hover:text-emerald-900"
                  >
                    Zobacz w kolejce →
                  </Link>{" "}
                  Publikacja nadal wyłącznie ręczna — z Kreatora.
                </p>
              )}

              {/* Inline AI draft result */}
              {inlineDraft.status === "error" && (
                <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                  {inlineDraft.error}
                </div>
              )}

              {inlineDraft.status === "success" && (
                <div className="mt-3 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/15 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Draft AI</span>
                    <div className="flex items-center gap-2">
                      {inlineDraft.mode === "anthropic" ? (
                        <span className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-full px-2 py-0.5">
                          Claude API
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-full px-2 py-0.5">
                          Tryb testowy
                        </span>
                      )}
                      <button
                        onClick={() => { setInlineDraft({ status: "idle" }); setInlineDraftSent(false); }}
                        className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 font-bold leading-none"
                        aria-label="Usuń draft"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">{inlineDraft.draft.title}</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className="text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full">
                      {categoryLabels[inlineDraft.draft.category as AlertCategory] ?? inlineDraft.draft.category}
                    </span>
                    {inlineDraft.draft.severity && severityConfig[inlineDraft.draft.severity] && (
                      <span className={`text-xs font-medium border rounded-full px-2 py-0.5 ${severityConfig[inlineDraft.draft.severity].color}`}>
                        {severityConfig[inlineDraft.draft.severity].label}
                      </span>
                    )}
                    {inlineDraft.draft.startsAt ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">{inlineDraft.draft.startsAt}</span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-300 font-medium">Nieznana data</span>
                    )}
                    {inlineDraft.draft.place ? (
                      <span className="text-xs text-slate-600 dark:text-slate-400">{inlineDraft.draft.place}</span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-300 font-medium">Nieznana lokalizacja</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-2.5">{inlineDraft.draft.change}</p>
                  <p className="text-xs mb-2.5">
                    {inlineDraft.draft.sourceUrl ? (
                      <a
                        href={inlineDraft.draft.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                      >
                        Sprawdź link źródła →
                      </a>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-300 font-medium">Brak linku źródła</span>
                    )}
                  </p>
                  {inlineDraft.warnings.length > 0 && (
                    <div className="mb-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-3 py-2">
                      <ul className="space-y-0.5">
                        {inlineDraft.warnings.map((w, wi) => (
                          <li key={wi} className="text-xs text-amber-700 dark:text-amber-300">⚠ {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={sendInlineDraftToBuilder}
                      disabled={inlineDraftSent}
                      className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {inlineDraftSent ? "Wysłano do Kreatora ✓" : "Wczytaj do Kreatora →"}
                    </button>
                    <button
                      onClick={() => {
                        if (inlineDraft.status === "success") {
                          handlePrepareAlertFromCheck(inlineDraft.sourceText);
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      Otwórz w AI Helperze →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Check history panel ─────────────────────────────────────── */}
      {showPanel && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Historia sprawdzeń
          </p>

          {/* Check form */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 mb-4 space-y-2.5">
            <select
              value={formResult}
              onChange={(e) => handleResultChange(e.target.value as SourceCheckResult)}
              className="w-full sm:w-auto text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            >
              {CHECK_RESULT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* Notice text — shown when admin found something */}
            {showNoticeField && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Treść komunikatu lub link do komunikatu
                </label>
                <textarea
                  value={formNoticeText}
                  onChange={(e) => setFormNoticeText(e.target.value)}
                  rows={3}
                  placeholder="Wklej fragment komunikatu, link do strony albo krótką notatkę, którą chcesz potem przerobić na alert..."
                  className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
                />
              </div>
            )}

            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              placeholder="Notatka ze sprawdzenia (opcjonalna)..."
              className="w-full text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSaveCheck}
                disabled={savingCheck}
                className="px-3 py-1.5 bg-blue-600 dark:bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-700 dark:hover:bg-blue-400 disabled:opacity-50 transition-colors"
              >
                {savingCheck ? "Zapisywanie…" : "Zapisz wynik sprawdzenia"}
              </button>
              {checkMsg && (
                <p className={`text-xs font-medium ${checkMsg.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>
                  {checkMsg.text}
                </p>
              )}
            </div>

            {/* Post-save shortcut to AI Helper */}
            {savedCheckResult === "found_notice" && (
              <button
                onClick={() => handlePrepareAlertFromCheck(savedCheckNotes)}
                className="w-full sm:w-auto px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
              >
                Przygotuj alert w AI Helperze →
              </button>
            )}
          </div>

          {/* History list */}
          {checks.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">Brak historii sprawdzeń.</p>
          ) : (
            <div className="space-y-3">
              {checks.map((check) => (
                <div key={check.id} className="text-xs border-b border-slate-100 dark:border-slate-800 pb-2.5 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={`font-medium shrink-0 ${resultConfig[check.result].color}`}>
                      {resultConfig[check.result].label}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 shrink-0">{formatCheckedAt(check.checkedAt)}</span>
                  </div>
                  {check.notes && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">{check.notes}</p>
                  )}
                  {ALERT_SHORTCUT_RESULTS.includes(check.result) && (
                    <button
                      onClick={() => handlePrepareAlertFromCheck(check.notes)}
                      className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                    >
                      Przygotuj alert →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SourcesPage() {
  const router = useRouter();

  const [session, setSession]         = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [sources, setSources]     = useState<AlertSource[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  // Filters
  const [filter, setFilter]               = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | "all">("all");
  const [searchQuery, setSearchQuery]     = useState("");

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm]         = useState<AlertSourceInput>(emptyForm());

  // Pilot source suggestions
  const [showPilotSuggestions, setShowPilotSuggestions] = useState(false);

  // Edit form
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState<AlertSourceInput>(emptyForm());

  // Action state
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [markingCheckedId, setMarkingCheckedId]   = useState<string | null>(null);
  const [checkSuccess, setCheckSuccess]           = useState<string | null>(null);
  const [checkError, setCheckError]               = useState<string | null>(null);
  const [alertCounts, setAlertCounts]             = useState<Record<string, number>>({});
  const [candidateCounts, setCandidateCounts]     = useState<Record<string, number>>({});
  const [sourceChecks, setSourceChecks]           = useState<Record<string, SourceCheck[]>>({});

  // Sprint 78: duplicate-check inputs for "Zapisz jako kandydata" — titles/
  // excerpts of already-pending persistent candidates + known alert titles.
  const [existingCandidateTexts, setExistingCandidateTexts] = useState<string[]>([]);
  const [alertTitles, setAlertTitles]                       = useState<string[]>([]);

  // Sprint 137: persistent candidates projected down to what the health
  // dashboard needs (source attribution + detection time) — filled from the
  // same fetch as candidateCounts, no extra query.
  const [healthCandidates, setHealthCandidates] = useState<HealthCandidate[]>([]);

  // Sprint 171: this session's own manual-check outcomes (success/failure +
  // consecutive-failure streak), keyed by checklist id — mirrored onto the
  // matching Source Health row. Never persisted; resets on reload. See
  // sourceHealth.ts's SessionCheckOutcome for the full rationale.
  const [sessionCheckOutcomes, setSessionCheckOutcomes] = useState<Record<string, SessionCheckOutcome>>({});

  function handleCheckOutcome(checklistId: string, outcome: { ok: boolean; message?: string; at: string }) {
    setSessionCheckOutcomes((prev) => ({
      ...prev,
      [checklistId]: nextSessionCheckOutcome(prev[checklistId], outcome),
    }));
  }

  // Sprint 149: same persistent-candidate fetch as healthCandidates above,
  // projected down to what the Scheduled Writer monitoring panel needs
  // (source_key + status) — no extra query.
  const [writerActivityCandidates, setWriterActivityCandidates] = useState<WriterActivityCandidateInput[]>([]);

  // ── Auth ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => setSession(newSession)
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Load sources ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!session) return;
    loadSources();
    loadAlertCounts();
    loadChecks();
    loadCandidateCounts();
    loadAlertTitles();
  }, [session]);

  async function loadAlertCounts() {
    if (!supabase) return;
    const { data } = await supabase
      .from("alerts")
      .select("source_id")
      .not("source_id", "is", null);
    if (!data) return;
    const counts: Record<string, number> = {};
    for (const row of data as { source_id: string }[]) {
      counts[row.source_id] = (counts[row.source_id] ?? 0) + 1;
    }
    setAlertCounts(counts);
  }

  async function loadAlertTitles() {
    const { alerts } = await getAdminSupabaseAlerts();
    setAlertTitles(alerts.map((a) => a.title).filter(Boolean));
  }

  // Counts BOTH the legacy source_checks-derived view and the new
  // persistent table (Sprint 78) — admin sees one combined "needs action"
  // number per source regardless of which system a candidate came from.
  // Missing-table errors from the new table are ignored here (falls back
  // to legacy-only counts), consistent with how the rest of this page
  // degrades gracefully before the migration is run.
  async function loadCandidateCounts() {
    const [legacy, persistent] = await Promise.all([
      getSourceCandidates(100),
      getSourceCandidateNotices(),
    ]);

    const counts: Record<string, number> = {};
    // Dedup-check pool for "Zapisz jako kandydata" (Sprint 78) — combines
    // both systems' pending text, since a notice logged as a legacy
    // source_checks "found_notice" is just as real a duplicate as one
    // already saved as a persistent candidate.
    const dedupTexts: string[] = [];
    if (!legacy.error) {
      for (const c of legacy.candidates) {
        if (c.relatedAlertId) continue; // only count still-pending candidates
        counts[c.sourceId] = (counts[c.sourceId] ?? 0) + 1;
        if (c.notes) dedupTexts.push(c.notes);
      }
    }
    if (!persistent.error) {
      const pending = persistent.candidates.filter((c) => c.status === "pending");
      for (const c of pending) {
        if (!c.sourceId) continue;
        counts[c.sourceId] = (counts[c.sourceId] ?? 0) + 1;
      }
      dedupTexts.push(...pending.map((c) => c.title));
      // Health dashboard counts ALL recent persistent candidates (any
      // status) — it answers "does this source produce anything?", not
      // "what still needs action?" (that's candidateCounts above).
      setHealthCandidates(
        persistent.candidates.map((c) => ({ sourceId: c.sourceId, detectedAt: c.detectedAt }))
      );
      // Sprint 149: sourceKey is set ONLY by the scheduled writer's own
      // insert path (never by this page's own "Zapisz jako kandydata"
      // save) — the unambiguous signal the monitoring panel uses to
      // attribute a candidate to automation rather than to an admin.
      setWriterActivityCandidates(
        persistent.candidates.map((c) => ({
          sourceKey: c.sourceKey,
          status: c.status,
          detectedAt: c.detectedAt,
        }))
      );
    }
    setExistingCandidateTexts(dedupTexts);
    setCandidateCounts(counts);
  }

  async function loadSources() {
    setLoadState("loading");
    const result = await getAlertSources();
    if (result.error) { setLoadState("error"); return; }
    setSources(result.sources);
    setLoadState("ready");
  }

  async function loadChecks() {
    const result = await getSourceChecks();
    if (result.error) return;
    // Group by sourceId, keep the 3 most recent per source
    // getSourceChecks returns rows ordered by checked_at DESC, so first 3 per source = most recent
    const grouped: Record<string, SourceCheck[]> = {};
    for (const check of result.checks) {
      if (!grouped[check.sourceId]) grouped[check.sourceId] = [];
      if (grouped[check.sourceId].length < 3) grouped[check.sourceId].push(check);
    }
    setSourceChecks(grouped);
  }

  async function handleCheckSaved() {
    await Promise.all([loadSources(), loadChecks(), loadCandidateCounts()]);
  }

  // ── Add form ────────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError(null);
    const result = await createAlertSource(addForm);
    setSaving(false);
    if (!result.ok) { setSaveError(result.error || "Nie udało się zapisać źródła."); return; }
    setAddForm(emptyForm()); setShowAddForm(false);
    await loadSources();
  }

  function handleFillFromSuggestion(suggestion: PilotSourceSuggestion) {
    setAddForm({
      name: suggestion.name,
      url: suggestion.url,
      category: suggestion.category,
      sourceType: suggestion.sourceType,
      notes: suggestion.notes,
    });
    setShowAddForm(true);
    setSaveError(null);
  }

  // ── Edit form ───────────────────────────────────────────────────────────────

  function startEdit(source: AlertSource) {
    setEditingId(source.id);
    setEditForm({ name: source.name, url: source.url ?? "", category: source.category, sourceType: source.sourceType, notes: source.notes ?? "" });
    setSaveError(null);
  }

  function cancelEdit() { setEditingId(null); setSaveError(null); }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true); setSaveError(null);
    const result = await updateAlertSource(editingId, editForm);
    setSaving(false);
    if (!result.ok) { setSaveError(result.error || "Nie udało się zapisać źródła."); return; }
    setEditingId(null);
    await loadSources();
  }

  // ── Toggle / Delete ─────────────────────────────────────────────────────────

  async function handleToggle(id: string, currentlyActive: boolean) {
    const result = await toggleAlertSourceActive(id, !currentlyActive);
    if (!result.ok) { setSaveError(result.error || "Nie udało się zmienić statusu źródła."); return; }
    await loadSources();
  }

  async function handleDelete(id: string) {
    if (!confirm("Czy na pewno chcesz usunąć to źródło? Tej operacji nie można cofnąć.")) return;
    setDeleteError(null);
    const result = await deleteAlertSource(id);
    if (!result.ok) { setDeleteError(result.error || "Nie udało się usunąć źródła."); return; }
    await loadSources();
  }

  // ── Prepare alert ───────────────────────────────────────────────────────────

  function handlePrepareAlert(source: AlertSource) {
    sessionStorage.setItem(PENDING_SOURCE_KEY, JSON.stringify({
      sourceName:        source.name,
      sourceUrl:         source.url,
      suggestedCategory: source.category,
      sourceId:          source.id,
    }));
    router.push("/ai-helper");
  }

  // ── Mark checked ────────────────────────────────────────────────────────────

  async function handleMarkChecked(id: string) {
    setMarkingCheckedId(id); setCheckSuccess(null); setCheckError(null);
    const result = await markAlertSourceChecked(id);
    setMarkingCheckedId(null);
    if (!result.ok) {
      setCheckError(result.error || "Nie udało się oznaczyć źródła jako sprawdzone.");
      return;
    }
    setCheckSuccess("Źródło oznaczone jako sprawdzone.");
    await Promise.all([loadSources(), loadChecks()]);
    setTimeout(() => setCheckSuccess(null), 4000);
  }

  // ── Filtered list ───────────────────────────────────────────────────────────

  const filtered = sources.filter((s) => {
    if (!matchesStatusFilter(s, filter)) return false;
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    if (!matchesSearch(s, searchQuery)) return false;
    return true;
  });

  // ── Auth states ─────────────────────────────────────────────────────────────

  if (authLoading) {
    return <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10" />;
  }

  if (!session) {
    return (
      <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Ta sekcja jest dostępna po zalogowaniu.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 dark:bg-blue-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors"
          >
            Przejdź do logowania →
          </Link>
        </div>
      </main>
    );
  }

  // ── Main view ───────────────────────────────────────────────────────────────

  const toCheckCount = sources.filter(needsChecking).length;

  return (
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">

      {/* Page header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Źródła</h1>
          <span className="inline-flex items-center text-xs font-medium text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-full px-2.5 py-0.5">
            Admin
          </span>
          {toCheckCount > 0 && (
            <span className="inline-flex items-center text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-300 rounded-full px-2.5 py-0.5">
              {toCheckCount} do sprawdzenia
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Miejsca, w których mogą pojawiać się komunikaty do przetworzenia na alerty.
          Sprawdzanie odbywa się ręcznie — kliknij „Sprawdź" przy wybranym źródle, aby zapisać wynik.
        </p>
      </div>

      {/* Source Health Dashboard v1 (Sprint 137) — read-only overview of
          official-source health built from data this page already loads.
          Rendered once the registry is in (avoids a flash of "brak w
          rejestrze" for registered sources); checks/candidates may still
          stream in and simply re-render. sourceChecks keeps the 3 most
          recent per source, so flattening it still contains each source's
          latest check — exactly what the health rows need. */}
      {loadState === "ready" && (
        <SourceHealthDashboard
          rows={buildSourceHealthRows({
            registrySources: sources,
            checks: Object.values(sourceChecks).flat(),
            candidates: healthCandidates,
          })}
          sessionCheckOutcomes={sessionCheckOutcomes}
        />
      )}

      {/* Scheduled Writer Monitoring v1 (Sprint 149) — read-only, admin-only
          overview of what the scheduled writer itself has produced, built
          entirely from the same persistent-candidate fetch as the Source
          Health Dashboard above (no new query, no schema change). Honestly
          labeled where the underlying schema cannot show more (per-run
          counters, who authored a check-only run) — see
          src/lib/writerCandidateActivity.ts for the full reasoning. */}
      {loadState === "ready" && (
        <ScheduledWriterMonitoring
          rows={buildScheduledWriterActivity(writerActivityCandidates)}
        />
      )}

      {/* Automation Status Panel (Sprint 164B) — admin-only, read-only
          summary of the two independent write kill switches, the canary
          source allowlist, and the per-run insert cap. No button here
          activates anything — it only reports the current server-side
          configuration (booleans/counts only, never secret values). See
          src/lib/automationStatus.ts for the full reasoning. */}
      {loadState === "ready" && (
        <AutomationStatusPanel activityRows={buildScheduledWriterActivity(writerActivityCandidates)} />
      )}

      {/* Link Health Panel (Sprint 164A) — on-demand, admin-triggered live
          HTTP reachability check of each active source's own URL. Distinct
          from the Source Health Dashboard above (which only reads past
          manual check history): this one actually contacts each source
          right now, through the SSRF-guarded fetch (src/lib/ssrfGuard.ts),
          and nothing here is persisted. */}
      {loadState === "ready" && (
        <LinkHealthPanel
          targets={sources
            .filter((s) => s.isActive && s.url)
            .map((s) => ({ id: s.id, name: s.name, url: s.url as string }))}
        />
      )}

      {/* Source Checker Dashboard v1 (Sprint 129) — static, code-defined
          checklist of official sources to check by hand. Sprint 134: the
          allowlisted safe source additionally gets a manual in-app check
          (registry rows + dedup pool passed for source_id matching,
          check-history logging and duplicate warnings). */}
      <OfficialSourceChecklist
        registrySources={sources}
        dedupTexts={[...existingCandidateTexts, ...alertTitles]}
        onCheckOutcome={handleCheckOutcome}
      />

      {/* Add button + pilot suggestions toggle */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setShowAddForm(!showAddForm); setSaveError(null); setAddForm(emptyForm()); }}
          className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors"
        >
          {showAddForm ? "Anuluj dodawanie" : "+ Dodaj źródło"}
        </button>
        <button
          onClick={() => setShowPilotSuggestions(!showPilotSuggestions)}
          className="px-4 py-2 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-900 text-sm font-medium rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
        >
          {showPilotSuggestions ? "Ukryj pilotażowe źródła" : "Pilotażowe źródła →"}
        </button>
      </div>

      {/* Pilot source suggestions */}
      {showPilotSuggestions && (
        <PilotSourceSuggestions
          existingUrls={new Set(sources.map((s) => s.url).filter((u): u is string => u !== null))}
          onFillForm={handleFillFromSuggestion}
        />
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="mb-6">
          <SourceForm
            form={addForm}
            onChange={setAddForm}
            onSubmit={handleAdd}
            saving={saving}
            saveError={saveError}
            submitLabel="Dodaj źródło"
            onCancel={() => { setShowAddForm(false); setAddForm(emptyForm()); setSaveError(null); }}
          />
        </div>
      )}

      {/* ── Search input ─────────────────────────────────────────────── */}
      <div className="relative mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Szukaj po nazwie, linku albo notatkach..."
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 pr-20 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Wyczyść wyszukiwanie"
          >
            Wyczyść
          </button>
        )}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {statusFilterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 text-sm rounded-full font-medium transition-colors ${
              filter === opt.value
                ? "bg-slate-800 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="hidden sm:block w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as AlertCategory | "all")}
          className="text-sm border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        >
          <option value="all">Wszystkie kategorie</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{categoryLabels[c]}</option>
          ))}
        </select>
      </div>

      {/* ── Result counter ───────────────────────────────────────────── */}
      {loadState === "ready" && sources.length > 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          Wyświetlane źródła:{" "}
          <span className="font-semibold text-slate-600 dark:text-slate-400">{filtered.length}</span>{" "}
          z {sources.length}
        </p>
      )}

      {/* ── Feedback messages ─────────────────────────────────────────── */}
      {checkSuccess && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-sm px-4 py-3 mb-4">
          {checkSuccess}
        </div>
      )}
      {checkError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-sm px-4 py-3 mb-4">
          {checkError}
        </div>
      )}
      {loadState === "error" && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-sm px-4 py-3 mb-4">
          Nie udało się pobrać źródeł.
        </div>
      )}
      {deleteError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-sm px-4 py-3 mb-4">
          {deleteError}
        </div>
      )}

      {/* ── Loading skeleton ──────────────────────────────────────────── */}
      {loadState === "loading" && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {loadState === "ready" && sources.length === 0 && (
        <div className="py-12">
          <p className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-1">Nie dodano jeszcze żadnych źródeł.</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm mb-6">
            Kliknij „+ Dodaj źródło" powyżej, aby dodać własne źródło, albo otwórz{" "}
            <button
              onClick={() => setShowPilotSuggestions(true)}
              className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
            >
              „Pilotażowe źródła"
            </button>{" "}
            i wypełnij formularz jednym z gotowych, sprawdzonych adresów dla WKD / Komorowa / Pruszkowa.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 max-w-lg border-t border-slate-200 dark:border-slate-800 pt-4">
            Po dodaniu źródła użyj „Sprawdź stronę", aby pobrać treść i wygenerować draft alertu.
            Wynik sprawdzenia możesz zapisać w historii — zostanie powiązany ze źródłem.
          </p>
        </div>
      )}

      {/* ── No results after filter ───────────────────────────────────── */}
      {loadState === "ready" && sources.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
          Brak źródeł pasujących do wybranych filtrów.
        </div>
      )}

      {/* ── Sources list ──────────────────────────────────────────────── */}
      {loadState === "ready" && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((source) =>
            editingId === source.id ? (
              <div
                key={source.id}
                className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/40 dark:bg-blue-500/10 p-4"
              >
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-3">
                  Edytujesz: {source.name}
                </p>
                <SourceForm
                  form={editForm}
                  onChange={setEditForm}
                  onSubmit={handleEdit}
                  saving={saving}
                  saveError={saveError}
                  submitLabel="Zapisz zmiany"
                  onCancel={cancelEdit}
                />
              </div>
            ) : (
              <SourceCard
                key={source.id}
                source={source}
                onEdit={() => startEdit(source)}
                onToggle={() => handleToggle(source.id, source.isActive)}
                onDelete={() => handleDelete(source.id)}
                onPrepareAlert={() => handlePrepareAlert(source)}
                onMarkChecked={() => handleMarkChecked(source.id)}
                markingChecked={markingCheckedId === source.id}
                alertCount={alertCounts[source.id] ?? 0}
                pendingCandidateCount={candidateCounts[source.id] ?? 0}
                checks={sourceChecks[source.id] ?? []}
                onCheckSaved={handleCheckSaved}
                existingCandidateTexts={existingCandidateTexts}
                alertTitles={alertTitles}
                onCandidateSaved={loadCandidateCounts}
              />
            )
          )}
        </div>
      )}

      {/* Source count summary */}
      {loadState === "ready" && sources.length > 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-right mt-5">
          {sources.length === 1 ? "1 źródło łącznie" : `${sources.length} źródeł łącznie`}
          {filtered.length !== sources.length && ` · ${filtered.length} po filtrowaniu`}
        </p>
      )}

    </main>
  );
}
