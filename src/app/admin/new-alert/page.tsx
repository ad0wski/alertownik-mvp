"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { AlertCard } from "@/components/AlertCard";
import { getPrePublishWarnings } from "@/lib/alertQuality";
import {
  assessDraft,
  dateCameFromSource,
  suggestSourceNameFromUrl,
  RISK_LABELS_PL,
  RECOMMENDATION_LABELS_PL,
  type DraftAssessment,
} from "@/lib/draftFromSource";
import { saveAlertDraftToSupabase } from "@/lib/supabaseAlertWrites";
import type { Alert, AlertCategory, AlertSeverity } from "@/types/alert";

// Same handoff keys AI Helper and /admin/sources already use — Builder
// picks the draft up on load and clears them (builder/page.tsx).
const AI_PENDING_KEY = "alertownik_pending_ai_alert_json";
const AI_PENDING_SOURCE_ID_KEY = "alertownik_pending_alert_source_id";

// Shape returned by /api/ai/draft-alert (route.ts — AlertDraft)
interface GeneratedDraft {
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  slug: string;
  place: string;
  startsAt: string;
  endsAt: string | null;
  change: string;
  action: string;
  sourceName: string;
  sourceUrl: string | null;
}

const CATEGORY_OPTIONS: { value: AlertCategory | "auto"; label: string }[] = [
  { value: "auto",      label: "Wykryj automatycznie" },
  { value: "transport", label: "Transport" },
  { value: "water",     label: "Woda" },
  { value: "power",     label: "Prąd" },
  { value: "waste",     label: "Odpady" },
  { value: "roads",     label: "Drogi" },
  { value: "municipal", label: "Komunikaty" },
];

const CATEGORY_LABELS: Record<AlertCategory, string> = {
  transport: "Transport", water: "Woda", power: "Prąd",
  waste: "Odpady", roads: "Drogi", municipal: "Komunikaty",
};

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  info: "Informacja", warning: "Uwaga", urgent: "Pilne",
};

const RISK_STYLES = {
  low:    "border-emerald-200 bg-emerald-50 text-emerald-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  high:   "border-red-200 bg-red-50 text-red-800",
} as const;

interface DraftResult {
  draft: GeneratedDraft;
  mode: "mock" | "anthropic";
  apiWarnings: string[];
  qualityWarnings: string[];
  assessment: DraftAssessment;
  placeFilledFromArea: boolean;
}

function ChecklistRow({ ok, manual, label, note }: {
  ok?: boolean; manual?: boolean; label: string; note?: string;
}) {
  const icon = manual ? "○" : ok ? "✓" : "✗";
  const iconColor = manual ? "text-slate-400" : ok ? "text-emerald-600" : "text-red-500";
  return (
    <li className="flex items-start gap-2 text-sm text-slate-700">
      <span className={`font-semibold ${iconColor} shrink-0`} aria-hidden="true">{icon}</span>
      <span>
        {label}
        {note && <span className="text-xs text-slate-400"> — {note}</span>}
      </span>
    </li>
  );
}

function NewAlertPageInner() {
  const router = useRouter();

  // Form
  const [sourceUrl, setSourceUrl]     = useState("");
  const [sourceText, setSourceText]   = useState("");
  const [area, setArea]               = useState("");
  const [category, setCategory]       = useState<AlertCategory | "auto">("auto");
  const [publishedDate, setPublishedDate] = useState("");

  // Result
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<DraftResult | null>(null);

  // Save-draft state
  const [saving, setSaving]         = useState(false);
  const [savedSlug, setSavedSlug]   = useState<string | null>(null);
  const [saveError, setSaveError]   = useState<string | null>(null);

  async function handleGenerate() {
    if (!sourceText.trim()) {
      setError("Wklej treść komunikatu — to jedyne wymagane pole.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setSavedSlug(null);
    setSaveError(null);

    // Extra operator context travels inside sourceText — the API's schema
    // takes free text and the prompt already says "use only facts given".
    const parts = [sourceText.trim()];
    if (area.trim()) parts.push(`Obszar/lokalizacja podana przez admina: ${area.trim()}`);
    if (publishedDate) parts.push(`Data publikacji komunikatu źródłowego: ${publishedDate}`);

    try {
      const res = await fetch("/api/ai/draft-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: parts.join("\n\n"),
          sourceUrl: sourceUrl.trim() || undefined,
          sourceName: suggestSourceNameFromUrl(sourceUrl) || undefined,
          suggestedCategory: category !== "auto" ? category : undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Nie udało się przygotować szkicu.");
        return;
      }

      const draft: GeneratedDraft = data.draft;

      // The admin's area field wins over an empty AI place — the operator
      // knows the area better than a notice that didn't state it.
      let placeFilledFromArea = false;
      if (!draft.place.trim() && area.trim()) {
        draft.place = area.trim();
        placeFilledFromArea = true;
      }

      const apiWarnings: string[] = Array.isArray(data.warnings) ? data.warnings : [];
      const qualityWarnings = getPrePublishWarnings({
        title: draft.title,
        place: draft.place,
        change: draft.change,
        action: draft.action,
        sourceName: draft.sourceName,
        sourceUrl: draft.sourceUrl ?? undefined,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt ?? undefined,
      });
      const assessment = assessDraft(
        { severity: draft.severity, sourceUrl: draft.sourceUrl, place: draft.place },
        [...apiWarnings, ...qualityWarnings]
      );

      setResult({ draft, mode: data.mode, apiWarnings, qualityWarnings, assessment, placeFilledFromArea });
    } catch {
      setError("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveDraft() {
    if (!result) return;
    setSaving(true);
    setSaveError(null);
    const d = result.draft;
    const saved = await saveAlertDraftToSupabase({
      slug: d.slug,
      category: d.category,
      severity: d.severity,
      title: d.title,
      place: d.place,
      startsAt: d.startsAt,
      endsAt: d.endsAt ?? undefined,
      change: d.change,
      action: d.action,
      sourceName: d.sourceName,
      sourceUrl: d.sourceUrl ?? undefined,
    });
    setSaving(false);
    if (saved.ok) {
      setSavedSlug(d.slug);
    } else {
      setSaveError(saved.error || "Nie udało się zapisać draftu.");
    }
  }

  function handleOpenInBuilder() {
    if (!result) return;
    try {
      sessionStorage.setItem(AI_PENDING_KEY, JSON.stringify(result.draft));
      sessionStorage.removeItem(AI_PENDING_SOURCE_ID_KEY);
    } catch {
      // sessionStorage unavailable — Builder simply opens empty
    }
    router.push("/builder");
  }

  function handleReject() {
    setResult(null);
    setSavedSlug(null);
    setSaveError(null);
  }

  const previewAlert: Alert | null = result
    ? {
        id: "preview",
        slug: result.draft.slug,
        category: result.draft.category,
        severity: result.draft.severity,
        title: result.draft.title,
        place: result.draft.place,
        startsAt: result.draft.startsAt,
        endsAt: result.draft.endsAt ?? undefined,
        change: result.draft.change,
        action: result.draft.action,
        sourceName: result.draft.sourceName,
        sourceUrl: result.draft.sourceUrl ?? undefined,
      }
    : null;

  const dateOk = result ? dateCameFromSource(result.apiWarnings) : false;
  const allWarnings = result
    ? [...new Set([...result.apiWarnings, ...result.qualityWarnings])]
    : [];

  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Nowy alert ze źródła
          </h1>
          <span className="inline-flex items-center text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
            Admin
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500 leading-relaxed">
          Trzy kroki: <span className="font-medium text-slate-600">wklej komunikat</span>{" "}
          → <span className="font-medium text-slate-600">sprawdź szkic</span>{" "}
          → <span className="font-medium text-slate-600">opublikuj ręcznie w Kreatorze</span>.
          Ta strona niczego nie publikuje — szkic zawsze czeka na Twoją weryfikację.
        </p>
      </div>

      {/* ── Step 1: input ─────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">
          1. Skąd pochodzi komunikat?
        </h2>

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="source-url" className="block text-sm font-medium text-slate-700 mb-1">
              Link do komunikatu
            </label>
            <input
              id="source-url"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://wkd.com.pl/aktualnosci/..."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Link do konkretnego komunikatu, nie do strony głównej. Bez linku
              do źródła alert nie nadaje się do publikacji.
            </p>
          </div>

          <div>
            <label htmlFor="source-text" className="block text-sm font-medium text-slate-700 mb-1">
              Treść komunikatu <span className="text-red-500">*</span>
            </label>
            <textarea
              id="source-text"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={7}
              placeholder="Skopiuj i wklej treść komunikatu ze strony źródła..."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="area" className="block text-sm font-medium text-slate-700 mb-1">
                Obszar / okolica
              </label>
              <input
                id="area"
                type="text"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="np. Komorów, linia WKD"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">
                Kategoria
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as AlertCategory | "auto")}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="published-date" className="block text-sm font-medium text-slate-700 mb-1">
                Data komunikatu <span className="text-slate-400 font-normal">(opcjonalnie)</span>
              </label>
              <input
                id="published-date"
                type="date"
                value={publishedDate}
                onChange={(e) => setPublishedDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Przygotowuję szkic…" : "Przygotuj szkic"}
            </button>
          </div>
        </div>
      </section>

      {/* ── Step 2: preview + decision ────────────────────────────────── */}
      {result && previewAlert && (
        <section className="flex flex-col gap-5">
          <div>
            <h2 className="text-base font-semibold text-slate-800 mb-1">
              2. Tak zobaczy to mieszkaniec
            </h2>
            <p className="text-xs text-slate-400 mb-3">
              Szkic przygotował: {result.mode === "anthropic" ? "AI (Claude)" : "tryb lokalny bez AI"}
              {" · "}kategoria: {CATEGORY_LABELS[result.draft.category]}
              {" · "}ważność: {SEVERITY_LABELS[result.draft.severity]}
              {" · "}adres: <span className="font-mono">{result.draft.slug}</span>
              {result.placeFilledFromArea && " · lokalizację uzupełniono z pola „Obszar”"}
            </p>
            <AlertCard alert={previewAlert} isPreview />
          </div>

          {/* Risk + recommendation */}
          <div className={`rounded-xl border px-4 py-3.5 ${RISK_STYLES[result.assessment.risk]}`}>
            <p className="text-sm font-semibold mb-1">
              Ryzyko publikacji: {RISK_LABELS_PL[result.assessment.risk]} ·{" "}
              {RECOMMENDATION_LABELS_PL[result.assessment.recommendation]}
            </p>
            <ul className="text-xs space-y-0.5 list-disc list-inside opacity-90">
              {result.assessment.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>

          {/* Warnings */}
          {allWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
              <p className="text-sm font-semibold text-amber-800 mb-1">
                Do sprawdzenia przed publikacją
              </p>
              <ul className="text-xs text-amber-800 space-y-0.5 list-disc list-inside">
                {allWarnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Compact checklist */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              Szybki przegląd
            </h3>
            <ul className="flex flex-col gap-2">
              <ChecklistRow
                ok={Boolean(result.draft.sourceUrl?.trim())}
                label="Link do źródła"
                note={result.draft.sourceUrl?.trim() ? result.draft.sourceUrl : "brak — uzupełnij przed publikacją"}
              />
              <ChecklistRow
                ok={dateOk}
                label="Data z komunikatu"
                note={dateOk ? `od ${result.draft.startsAt}` : "źródło nie podało daty — sprawdź ręcznie"}
              />
              <ChecklistRow
                ok={Boolean(result.draft.place.trim())}
                label="Obszar/lokalizacja"
                note={result.draft.place.trim() || "brak"}
              />
              <ChecklistRow manual label="Bez dokładnych adresów mieszkańców" note="obszar lub ulica, nigdy czyjś adres" />
              <ChecklistRow manual label="Tylko fakty ze źródła" note="żadnych domysłów ani obietnic" />
              <ChecklistRow manual label="Ręczna weryfikacja przed publikacją" note="zawsze — AI nie publikuje" />
            </ul>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              3. Co dalej?
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Draft nie jest widoczny publicznie. Publikacja jest możliwa
              wyłącznie z Kreatora, po ręcznym sprawdzeniu źródła.
            </p>

            {savedSlug ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
                <p className="text-sm font-semibold text-emerald-800 mb-1">
                  Zapisano draft w Supabase ✓
                </p>
                <p className="text-xs text-emerald-700 mb-2">
                  Slug: <span className="font-mono">{savedSlug}</span> · status: draft
                  (niewidoczny publicznie).
                </p>
                <Link
                  href={`/builder?edit=${savedSlug}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                  Sprawdź i opublikuj w Kreatorze →
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Zapisuję…" : "Zapisz jako draft"}
                </button>
                <button
                  onClick={handleOpenInBuilder}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  Otwórz w Kreatorze
                </button>
                <button
                  onClick={handleReject}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Odrzuć szkic
                </button>
              </div>
            )}

            {saveError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
                {saveError}
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

export default function NewAlertPage() {
  return (
    <AuthGate>
      <NewAlertPageInner />
    </AuthGate>
  );
}
