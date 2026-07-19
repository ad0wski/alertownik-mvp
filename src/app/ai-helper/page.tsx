"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { authFetch } from "@/lib/apiClientAuth";
import type { AlertCategory } from "@/types/alert";
import { normalizeAlertSeverity } from "@/lib/normalizeAlert";

const categoryOptions: { value: AlertCategory | ""; label: string }[] = [
  { value: "", label: "AI dobierze automatycznie" },
  { value: "transport", label: "Transport" },
  { value: "water", label: "Woda" },
  { value: "power", label: "Prąd" },
  { value: "waste", label: "Odpady" },
  { value: "roads", label: "Drogi" },
  { value: "municipal", label: "Komunikaty" },
];

const CATEGORY_LABELS: Record<string, string> = {
  transport: "Transport",
  water: "Woda",
  power: "Prąd",
  waste: "Odpady",
  roads: "Drogi",
  municipal: "Komunikaty",
};

const SEVERITY_META: Record<string, { label: string; color: string }> = {
  info:    { label: "Info",  color: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30" },
  warning: { label: "Uwaga", color: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30" },
  urgent:  { label: "Pilne", color: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30" },
};

const inputClass =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500";

const labelClass = "text-sm font-medium text-slate-700 dark:text-slate-300";

function buildPrompt(
  rawText: string,
  sourceName: string,
  sourceUrl: string,
  suggestedCategory: string
): string {
  const categoryLine = suggestedCategory
    ? `Sugerowana kategoria: ${categoryOptions.find((o) => o.value === suggestedCategory)?.label ?? suggestedCategory}`
    : 'Kategoria: wybierz najlepiej pasującą spośród: "transport", "water", "power", "waste", "roads", "municipal"';

  const sourceLines = [
    sourceName ? `Nazwa źródła: ${sourceName}` : null,
    sourceUrl ? `URL źródła: ${sourceUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const rawSection = rawText.trim() || "(wklej komunikat źródłowy w polu powyżej)";

  return `Jesteś asystentem aplikacji Alertownik — lokalnego serwisu z alertami dla mieszkańców.

Twoim zadaniem jest przekształcić poniższy komunikat źródłowy w alert zgodny ze strukturą danych Alertownik.

## Wymagany format wyjściowy (JSON)

Zwróć obiekt JSON z dokładnie tymi polami:

{
  "id": "wpisz-sam",
  "slug": "<unikalny-identyfikator-url-bez-polskich-liter>",
  "category": "transport" | "water" | "power" | "waste" | "roads" | "municipal",
  "severity": "info" | "warning" | "urgent",
  "title": "<krótki tytuł, max 60 znaków>",
  "location": "<ogólna lokalizacja lub rejon, np. Komorów / Pruszków>",
  "place": "<dokładna lokalizacja z ulicą lub adresem>",
  "startsAt": "<YYYY-MM-DD lub YYYY-MM-DDTHH:MM>",
  "endsAt": "<YYYY-MM-DD lub YYYY-MM-DDTHH:MM — jeśli brak w komunikacie: null>",
  "change": "<co dokładnie się zmienia — 1–3 zdania>",
  "action": "<co mieszkaniec powinien zrobić — 1–2 zdania>",
  "sourceName": "<nazwa instytucji>",
  "sourceUrl": "<URL lub null>"
}

## Zasady tworzenia alertu

1. Pisz prostym, zrozumiałym językiem. Unikaj urzędowego stylu i skomplikowanych zdań.
2. Alert musi być krótki i czytelny na ekranie telefonu.
3. Skup się na tym, co mieszkaniec musi wiedzieć i co powinien zrobić — nie przepisuj całego komunikatu.
4. Jeśli jakaś informacja nie wynika jasno z komunikatu, wpisz null — nie zgaduj i nie uzupełniaj luk.
5. Pole "change": opisuje co konkretnie się zmienia lub dzieje (fakty).
6. Pole "action": opisuje co mieszkaniec powinien zrobić w odpowiedzi na ten alert (zalecenie).
7. Dobór severity:
   - "urgent" = pilna awaria lub zagrożenie zdrowia albo bezpieczeństwa
   - "warning" = planowane utrudnienie lub zmiana wymagająca przygotowania
   - "info" = informacja bez pilności
8. Slug: małe litery, myślniki zamiast spacji i polskich liter, np. "przerwa-w-dostawie-wody-komorow".
9. Zwróć sam obiekt JSON — bez owijania w blok kodu markdown (bez \`\`\`json). Sam obiekt, nic więcej.

## Komunikat źródłowy

${rawSection}

## Dodatkowe dane

${categoryLine}
${sourceLines || "Źródło: nieznane"}`;
}

const AI_PENDING_KEY = "alertownik_pending_ai_alert_json";
const AI_PENDING_SOURCE_ID_KEY = "alertownik_pending_alert_source_id";
const PENDING_SOURCE_KEY = "alertownik_pending_source_for_ai";
// Same contract Builder reads (Sprint 78) — set here only when this session
// came from a persistent source candidate, so Builder can mark it converted
// once an alert is actually saved.
const PENDING_CANDIDATE_ID_KEY = "alertownik_pending_candidate_notice_id";

interface PendingSourceData {
  sourceName: string;
  sourceUrl: string;
  suggestedCategory: string;
  sourceId: string;
  checkNotes?: string;
  candidateNoticeId?: string;
}

// Minimal shape for displaying the AI draft preview
interface DraftPreview {
  title?: string;
  category?: string;
  severity?: string;
  startsAt?: string;
  endsAt?: string | null;
  place?: string;
  change?: string;
  action?: string;
  sourceName?: string;
  sourceUrl?: string | null;
}

const REQUIRED_FIELDS = [
  "category", "severity", "title", "startsAt", "change", "action", "sourceName",
] as const;

function validateAiJson(text: string): boolean {
  try {
    const data = JSON.parse(text.trim());
    if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
    const hasPlace =
      (typeof data.location === "string" && data.location.trim()) ||
      (typeof data.place === "string" && data.place.trim());
    if (!hasPlace) return false;
    if (!normalizeAlertSeverity(data.severity)) return false;
    return REQUIRED_FIELDS.every(
      (f) => typeof data[f] === "string" && data[f].trim()
    );
  } catch {
    return false;
  }
}

// ── AI draft generator state types ───────────────────────────────────────────

type AiDraftStatus = "idle" | "loading" | "success" | "error";

export default function AiHelperPage() {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [suggestedCategory, setSuggestedCategory] = useState("");
  const [copied, setCopied] = useState(false);
  const [aiJsonInput, setAiJsonInput] = useState("");
  const [aiJsonStatus, setAiJsonStatus] = useState<"idle" | "valid" | "error">("idle");
  const [loadedFrom, setLoadedFrom] = useState<"source" | "check" | null>(null);
  const [pendingSourceId, setPendingSourceId] = useState("");
  const [pendingCandidateId, setPendingCandidateId] = useState("");

  // AI draft generator
  const [aiDraftStatus, setAiDraftStatus] = useState<AiDraftStatus>("idle");
  const [aiDraftResult, setAiDraftResult] = useState<string | null>(null);
  const [aiDraftError, setAiDraftError] = useState<string | null>(null);
  const [aiDraftSent, setAiDraftSent] = useState(false);
  const [aiDraftMode, setAiDraftMode] = useState<"mock" | "anthropic" | null>(null);
  const [aiDraftWarnings, setAiDraftWarnings] = useState<string[]>([]);
  const [jsonCopied, setJsonCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_SOURCE_KEY);
      if (!raw) return;
      const data: PendingSourceData = JSON.parse(raw);
      if (data.sourceName)        setSourceName(data.sourceName);
      if (data.sourceUrl)         setSourceUrl(data.sourceUrl);
      if (data.suggestedCategory) setSuggestedCategory(data.suggestedCategory);
      if (data.sourceId)          setPendingSourceId(data.sourceId);
      if (data.candidateNoticeId) setPendingCandidateId(data.candidateNoticeId);
      sessionStorage.removeItem(PENDING_SOURCE_KEY);
      if (data.checkNotes) {
        setRawText(data.checkNotes);
        setLoadedFrom("check");
      } else {
        setLoadedFrom("source");
      }
    } catch {
      // ignore malformed data
    }
  }, []);

  const prompt = buildPrompt(rawText, sourceName, sourceUrl, suggestedCategory);

  // Parse the JSON string for the human preview card
  const aiDraftParsed: DraftPreview | null = (() => {
    if (!aiDraftResult) return null;
    try { return JSON.parse(aiDraftResult) as DraftPreview; } catch { return null; }
  })();

  function copyPrompt() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyDraftJson() {
    if (!aiDraftResult) return;
    navigator.clipboard.writeText(aiDraftResult).then(() => {
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
    });
  }

  function handleAiJsonChange(text: string) {
    setAiJsonInput(text);
    if (!text.trim()) {
      setAiJsonStatus("idle");
      return;
    }
    setAiJsonStatus(validateAiJson(text) ? "valid" : "error");
  }

  function sendToBuilder() {
    if (!validateAiJson(aiJsonInput)) {
      setAiJsonStatus("error");
      return;
    }
    sessionStorage.setItem(AI_PENDING_KEY, aiJsonInput.trim());
    if (pendingSourceId) {
      sessionStorage.setItem(AI_PENDING_SOURCE_ID_KEY, pendingSourceId);
    }
    if (pendingCandidateId) {
      sessionStorage.setItem(PENDING_CANDIDATE_ID_KEY, pendingCandidateId);
    }
    router.push("/builder");
  }

  async function generateDraft() {
    if (!rawText.trim()) {
      setAiDraftError("Wklej komunikat źródłowy, zanim wygenerujesz draft.");
      setAiDraftStatus("error");
      return;
    }
    setAiDraftStatus("loading");
    setAiDraftResult(null);
    setAiDraftError(null);
    setAiDraftSent(false);
    setAiDraftMode(null);
    setAiDraftWarnings([]);
    setJsonCopied(false);
    try {
      const res = await authFetch("/api/ai/draft-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: rawText,
          sourceName:        sourceName || undefined,
          sourceUrl:         sourceUrl  || undefined,
          suggestedCategory: suggestedCategory || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAiDraftError(data.error ?? "Nie udało się wygenerować draftu.");
        setAiDraftStatus("error");
      } else {
        setAiDraftResult(JSON.stringify(data.draft, null, 2));
        setAiDraftMode(data.mode ?? "mock");
        setAiDraftWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        setAiDraftStatus("success");
      }
    } catch {
      setAiDraftError("Błąd połączenia z serwerem. Spróbuj ponownie.");
      setAiDraftStatus("error");
    }
  }

  function sendDraftToBuilder() {
    if (!aiDraftResult) return;
    sessionStorage.setItem(AI_PENDING_KEY, aiDraftResult);
    if (pendingSourceId) {
      sessionStorage.setItem(AI_PENDING_SOURCE_ID_KEY, pendingSourceId);
    }
    if (pendingCandidateId) {
      sessionStorage.setItem(PENDING_CANDIDATE_ID_KEY, pendingCandidateId);
    }
    setAiDraftSent(true);
    router.push("/builder");
  }

  return (
    <AuthGate>
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">

      {/* Page title */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            AI Helper
          </h1>
          <span className="inline-flex items-center text-xs font-medium text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-full px-2.5 py-0.5">
            Admin
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Wygeneruj szkic alertu przez AI lub przygotuj prompt do ChatGPT / Claude.
          AI tworzy tylko wstępny draft — przed publikacją zawsze sprawdź daty, lokalizację i treść w źródle.
        </p>
      </div>

      {/* Source loaded banner */}
      {loadedFrom === "source" && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-5 py-4 mb-6">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
            Źródło zostało wczytane do AI Helpera.
          </p>
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Teraz wklej komunikat z tego źródła, a potem skopiuj prompt do ChatGPT lub Claude.
          </p>
        </div>
      )}
      {loadedFrom === "check" && (
        <div className="rounded-xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 px-5 py-4 mb-6">
          <p className="text-sm font-semibold text-blue-800 mb-1">
            Komunikat ze sprawdzenia źródła został wczytany do AI Helpera.
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Treść komunikatu jest już wklejona w polu poniżej. Sprawdź, uzupełnij jeśli potrzeba, i skopiuj prompt do ChatGPT lub Claude.
          </p>
        </div>
      )}

      {/* Input form */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col gap-5 mb-6">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Dane wejściowe
        </h2>

        {/* Raw text */}
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Wklej komunikat źródłowy</label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={6}
            placeholder="Wklej tutaj komunikat z WKD, gminy, PGE albo innego oficjalnego źródła..."
            className={inputClass + " resize-y"}
          />
        </div>

        {/* Source name + URL */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className={labelClass}>
              Nazwa źródła{" "}
              <span className="font-normal text-slate-400 dark:text-slate-500">(opcjonalnie)</span>
            </label>
            <input
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="np. WKD, Urząd Gminy Michałowice"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className={labelClass}>
              Link do źródła{" "}
              <span className="font-normal text-slate-400 dark:text-slate-500">(opcjonalnie)</span>
            </label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
        </div>

        {/* Suggested category */}
        <div className="flex flex-col gap-2">
          <label className={labelClass}>
            Sugerowana kategoria{" "}
            <span className="font-normal text-slate-400 dark:text-slate-500">(opcjonalnie)</span>
          </label>
          <select
            value={suggestedCategory}
            onChange={(e) => setSuggestedCategory(e.target.value)}
            className={inputClass}
          >
            {categoryOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* ── AI draft generator ────────────────────────────────────────── */}
      <section className="bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-6 flex flex-col gap-4 mb-6">
        <div>
          <h2 className="text-base font-semibold text-blue-900">
            Generator draftu AI
          </h2>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
            Kliknij poniżej, aby automatycznie wygenerować szkic alertu z wklejonego komunikatu.
          </p>
          <ul className="mt-2 text-xs text-blue-600 dark:text-blue-400 space-y-1 list-none">
            <li>· AI tworzy tylko wstępny draft — nie publikuje alertu automatycznie.</li>
            <li>· Przed wysłaniem do Kreatora zawsze zweryfikuj daty, trasę i lokalizację w oryginalnym źródle.</li>
            <li>· Pola oznaczone ostrzeżeniem wymagają ręcznego uzupełnienia przez admina.</li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={generateDraft}
            disabled={aiDraftStatus === "loading"}
            className="rounded-lg bg-blue-600 dark:bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {aiDraftStatus === "loading" ? "Generuję draft…" : "Wygeneruj draft AI"}
          </button>

          {aiDraftStatus === "error" && (
            <span className="text-sm font-medium text-red-600 dark:text-red-400">
              {aiDraftError}
            </span>
          )}
        </div>

        {aiDraftStatus === "success" && aiDraftResult && (
          <div className="flex flex-col gap-4">

            {/* Header: label + mode badge + copy JSON */}
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide flex-1">
                Wygenerowany szkic alertu
              </p>
              {aiDraftMode === "anthropic" ? (
                <span className="inline-flex items-center text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-full px-2 py-0.5">
                  Tryb: Claude API
                </span>
              ) : (
                <span className="inline-flex items-center text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-full px-2 py-0.5">
                  Tryb: testowy
                </span>
              )}
              <button
                onClick={copyDraftJson}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  jsonCopied
                    ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "border-blue-200 dark:border-blue-500/30 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 hover:bg-blue-100"
                }`}
              >
                {jsonCopied ? "Skopiowano ✓" : "Kopiuj JSON"}
              </button>
            </div>

            {/* Raw JSON */}
            <pre className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-500/30 text-slate-700 dark:text-slate-300 rounded-xl p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
              {aiDraftResult}
            </pre>

            {/* Human preview card */}
            {aiDraftParsed && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-blue-100 p-4">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">
                  Podgląd alertu
                </p>
                <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="font-medium text-slate-500 dark:text-slate-400 pt-0.5">Tytuł</dt>
                  <dd className="text-slate-900 dark:text-white font-medium pt-0.5">{aiDraftParsed.title || "—"}</dd>

                  <dt className="font-medium text-slate-500 dark:text-slate-400 pt-0.5">Kategoria</dt>
                  <dd className="text-slate-800 dark:text-slate-100 pt-0.5">
                    {aiDraftParsed.category ? (CATEGORY_LABELS[aiDraftParsed.category] ?? aiDraftParsed.category) : "—"}
                  </dd>

                  <dt className="font-medium text-slate-500 dark:text-slate-400 pt-0.5">Ważność</dt>
                  <dd className="pt-0.5">
                    {aiDraftParsed.severity && SEVERITY_META[aiDraftParsed.severity] ? (
                      <span className={`inline-flex items-center text-xs font-medium border rounded-full px-2 py-0.5 ${SEVERITY_META[aiDraftParsed.severity].color}`}>
                        {SEVERITY_META[aiDraftParsed.severity].label}
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </dd>

                  <dt className="font-medium text-slate-500 dark:text-slate-400 pt-0.5">Kiedy</dt>
                  <dd className="text-slate-800 dark:text-slate-100 pt-0.5">
                    {aiDraftParsed.startsAt
                      ? aiDraftParsed.endsAt
                        ? `${aiDraftParsed.startsAt} – ${aiDraftParsed.endsAt}`
                        : aiDraftParsed.startsAt
                      : <span className="text-amber-600 dark:text-amber-300 font-medium">Nieznana data</span>}
                  </dd>

                  <dt className="font-medium text-slate-500 dark:text-slate-400 pt-0.5">Gdzie</dt>
                  <dd className="text-slate-800 dark:text-slate-100 pt-0.5">
                    {aiDraftParsed.place && aiDraftParsed.place.trim()
                      ? aiDraftParsed.place
                      : <span className="text-amber-600 dark:text-amber-300 font-medium">Nieznana lokalizacja</span>}
                  </dd>

                  <dt className="font-medium text-slate-500 dark:text-slate-400 pt-1">Co się zmienia</dt>
                  <dd className="text-slate-800 dark:text-slate-100 pt-1 leading-relaxed">{aiDraftParsed.change || "—"}</dd>

                  <dt className="font-medium text-slate-500 dark:text-slate-400 pt-1">Co zrobić</dt>
                  <dd className="text-slate-800 dark:text-slate-100 pt-1 leading-relaxed">{aiDraftParsed.action || "—"}</dd>

                  <dt className="font-medium text-slate-500 dark:text-slate-400 pt-0.5">Źródło</dt>
                  <dd className="text-slate-800 dark:text-slate-100 pt-0.5 flex flex-wrap items-center gap-3">
                    <span>
                      {aiDraftParsed.sourceName || <span className="text-amber-600 dark:text-amber-300 font-medium">Brak nazwy źródła</span>}
                    </span>
                    {aiDraftParsed.sourceUrl ? (
                      <a
                        href={aiDraftParsed.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                      >
                        Sprawdź link →
                      </a>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-300 font-medium">Brak linku źródła</span>
                    )}
                  </dd>
                </dl>
              </div>
            )}

            {/* Warnings */}
            {aiDraftWarnings.length > 0 && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-4 py-3">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
                  Do sprawdzenia przed publikacją
                </p>
                <ul className="space-y-1">
                  {aiDraftWarnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                      <span className="mt-0.5 shrink-0">⚠</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={sendDraftToBuilder}
                disabled={aiDraftSent}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {aiDraftSent ? "Wysłano do Kreatora ✓" : "Wczytaj draft do Kreatora →"}
              </button>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                Admin musi zweryfikować i zatwierdzić przed publikacją.
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Prompt preview */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Ręczny workflow: prompt do ChatGPT / Claude
          </h2>
          <button
            onClick={copyPrompt}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              copied
                ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300"
            }`}
          >
            {copied ? "Skopiowano ✓" : "Kopiuj prompt"}
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          Skopiuj ten tekst i wklej do{" "}
          <a
            href="https://chat.openai.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
          >
            ChatGPT
          </a>{" "}
          albo{" "}
          <a
            href="https://claude.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
          >
            Claude
          </a>
          . Wynik wklej w sekcji poniżej.
        </p>
        <pre className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl p-5 text-sm font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
          {prompt}
        </pre>
      </section>

      {/* AI response — paste JSON and send to Builder */}
      <section className="mt-8">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Odpowiedź AI</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Wklej tutaj JSON zwrócony przez ChatGPT lub Claude.
            Sprawdź dane i kliknij „Wczytaj do Kreatora" — nie publikuj bez weryfikacji źródła.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col gap-4">
          <textarea
            value={aiJsonInput}
            onChange={(e) => handleAiJsonChange(e.target.value)}
            rows={8}
            placeholder="Wklej gotowy JSON alertu..."
            className={inputClass + " resize-y font-mono text-xs"}
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={sendToBuilder}
              className="rounded-lg bg-blue-600 dark:bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors"
            >
              Wczytaj do Kreatora
            </button>

            {aiJsonStatus === "valid" && (
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                JSON wygląda poprawnie.
              </span>
            )}
            {aiJsonStatus === "error" && (
              <span className="text-sm font-medium text-red-600 dark:text-red-400">
                Nie udało się odczytać JSON. Sprawdź, czy wkleiłeś sam obiekt JSON bez dodatkowego tekstu.
              </span>
            )}
          </div>
        </div>
      </section>
    </main>
    </AuthGate>
  );
}
