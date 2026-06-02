"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import type { AlertSource, AlertSourceInput, AlertSourceType } from "@/types/alertSource";
import type { AlertCategory } from "@/types/alert";
import {
  getAlertSources,
  createAlertSource,
  updateAlertSource,
  deleteAlertSource,
  toggleAlertSourceActive,
  markAlertSourceChecked,
} from "@/lib/supabaseSourceWrites";

// ── Constants ─────────────────────────────────────────────────────────────────

const PENDING_SOURCE_KEY = "alertownik_pending_source_for_ai";

// ── Labels ────────────────────────────────────────────────────────────────────

const categoryLabels: Record<AlertCategory, string> = {
  transport: "Transport",
  water: "Woda",
  power: "Prąd",
  waste: "Odpady",
  roads: "Drogi",
  municipal: "Komunikaty",
};

const sourceTypeLabels: Record<AlertSourceType, string> = {
  website: "Strona WWW",
  pdf: "PDF",
  rss: "RSS/Feed",
  other: "Inne",
};

const CATEGORIES: AlertCategory[] = [
  "transport",
  "water",
  "power",
  "waste",
  "roads",
  "municipal",
];

const SOURCE_TYPES: AlertSourceType[] = ["website", "pdf", "rss", "other"];

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
const labelClass = "block text-sm font-medium text-slate-700 mb-1";

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyForm(): AlertSourceInput {
  return { name: "", url: "", category: "municipal", sourceType: "website", notes: "" };
}

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });
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
  form,
  onChange,
  onSubmit,
  saving,
  saveError,
  submitLabel,
  onCancel,
}: SourceFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
    >
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
            onChange={(e) =>
              onChange({ ...form, category: e.target.value as AlertCategory })
            }
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Typ źródła</label>
          <select
            className={inputClass}
            value={form.sourceType}
            onChange={(e) =>
              onChange({ ...form, sourceType: e.target.value as AlertSourceType })
            }
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {sourceTypeLabels[t]}
              </option>
            ))}
          </select>
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
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {saveError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Zapisywanie…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors"
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
}

function SourceCard({
  source,
  onEdit,
  onToggle,
  onDelete,
  onPrepareAlert,
  onMarkChecked,
  markingChecked,
  alertCount,
}: SourceCardProps) {
  const inactive = !source.isActive;

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        inactive
          ? "bg-slate-50 border-slate-200 opacity-60"
          : "bg-white border-slate-200 shadow-sm"
      }`}
    >
      {/* Top section: info + management buttons */}
      <div className="flex items-start gap-3">
        {/* Source info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`font-semibold ${inactive ? "text-slate-500" : "text-slate-900"}`}>
              {source.name}
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                source.isActive
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-slate-100 text-slate-400 ring-1 ring-slate-200"
              }`}
            >
              {source.isActive ? "Aktywne" : "Nieaktywne"}
            </span>
            <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
              {categoryLabels[source.category]}
            </span>
            <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
              {sourceTypeLabels[source.sourceType]}
            </span>
          </div>
          <span className="text-sm text-blue-600 truncate block">
            {source.url}
          </span>
          {source.notes && (
            <p className="text-sm text-slate-500 mt-1">{source.notes}</p>
          )}
        </div>

        {/* Management buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Edytuj
          </button>
          <button
            onClick={onToggle}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              source.isActive
                ? "text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                : "text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50"
            }`}
          >
            {source.isActive ? "Wyłącz" : "Włącz"}
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            Usuń
          </button>
        </div>
      </div>

      {/* Footer section: workflow actions + last checked */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        {/* Primary workflow */}
        <div className="flex items-center gap-2">
          <button
            onClick={onPrepareAlert}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Przygotuj alert
          </button>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Otwórz źródło ↗
          </a>
        </div>

        {/* Last checked + mark button */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>
            Alerty: {alertCount}
          </span>
          <span>·</span>
          <span>
            {source.lastCheckedAt
              ? `Ostatnio sprawdzono: ${formatCheckedAt(source.lastCheckedAt)}`
              : "Jeszcze nie sprawdzano"}
          </span>
          <button
            onClick={onMarkChecked}
            disabled={markingChecked}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2 py-1 rounded-md transition-colors disabled:opacity-50"
          >
            {markingChecked ? "Oznaczanie…" : "Oznacz jako sprawdzone"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "active" | "inactive";

export default function SourcesPage() {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [sources, setSources] = useState<AlertSource[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | "all">("all");

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AlertSourceInput>(emptyForm());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AlertSourceInput>(emptyForm());

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [markingCheckedId, setMarkingCheckedId] = useState<string | null>(null);
  const [checkSuccess, setCheckSuccess] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [alertCounts, setAlertCounts] = useState<Record<string, number>>({});

  // ── Auth ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Load sources ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!session) return;
    loadSources();
    loadAlertCounts();
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

  async function loadSources() {
    setLoadState("loading");
    const result = await getAlertSources();
    if (result.error) {
      setLoadState("error");
      return;
    }
    setSources(result.sources);
    setLoadState("ready");
  }

  // ── Add form ────────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const result = await createAlertSource(addForm);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error || "Nie udało się zapisać źródła.");
      return;
    }
    setAddForm(emptyForm());
    setShowAddForm(false);
    await loadSources();
  }

  // ── Edit form ───────────────────────────────────────────────────────────────

  function startEdit(source: AlertSource) {
    setEditingId(source.id);
    setEditForm({
      name: source.name,
      url: source.url,
      category: source.category,
      sourceType: source.sourceType,
      notes: source.notes ?? "",
    });
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setSaveError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setSaveError(null);
    const result = await updateAlertSource(editingId, editForm);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error || "Nie udało się zapisać źródła.");
      return;
    }
    setEditingId(null);
    await loadSources();
  }

  // ── Toggle / Delete ─────────────────────────────────────────────────────────

  async function handleToggle(id: string, currentlyActive: boolean) {
    const result = await toggleAlertSourceActive(id, !currentlyActive);
    if (!result.ok) {
      setSaveError(result.error || "Nie udało się zmienić statusu źródła.");
      return;
    }
    await loadSources();
  }

  async function handleDelete(id: string) {
    if (!confirm("Czy na pewno chcesz usunąć to źródło? Tej operacji nie można cofnąć.")) {
      return;
    }
    setDeleteError(null);
    const result = await deleteAlertSource(id);
    if (!result.ok) {
      setDeleteError(result.error || "Nie udało się usunąć źródła.");
      return;
    }
    await loadSources();
  }

  // ── Prepare alert ───────────────────────────────────────────────────────────

  function handlePrepareAlert(source: AlertSource) {
    const data = {
      sourceName: source.name,
      sourceUrl: source.url,
      suggestedCategory: source.category,
      sourceId: source.id,
    };
    sessionStorage.setItem(PENDING_SOURCE_KEY, JSON.stringify(data));
    router.push("/ai-helper");
  }

  // ── Mark checked ────────────────────────────────────────────────────────────

  async function handleMarkChecked(id: string) {
    setMarkingCheckedId(id);
    setCheckSuccess(null);
    setCheckError(null);
    const result = await markAlertSourceChecked(id);
    setMarkingCheckedId(null);
    if (!result.ok) {
      setCheckError(result.error || "Nie udało się oznaczyć źródła jako sprawdzone.");
      return;
    }
    setCheckSuccess("Źródło oznaczone jako sprawdzone.");
    await loadSources();
    setTimeout(() => setCheckSuccess(null), 4000);
  }

  // ── Filtered list ───────────────────────────────────────────────────────────

  const filtered = sources.filter((s) => {
    if (filter === "active" && !s.isActive) return false;
    if (filter === "inactive" && s.isActive) return false;
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    return true;
  });

  // ── Auth states ─────────────────────────────────────────────────────────────

  if (authLoading) {
    return <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10" />;
  }

  if (!session) {
    return (
      <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <p className="text-lg font-semibold text-slate-700 mb-2">
            Ta sekcja jest dostępna po zalogowaniu.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Przejdź do logowania →
          </Link>
        </div>
      </main>
    );
  }

  // ── Main view ───────────────────────────────────────────────────────────────

  return (
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">

      {/* Page header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Źródła</h1>
          <span className="inline-flex items-center text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
            Admin
          </span>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">
          Lista stron i miejsc, z których Alertownik może w przyszłości pobierać komunikaty.
        </p>
      </div>

      {/* Add button */}
      <div className="mb-5">
        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setSaveError(null);
            setAddForm(emptyForm());
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showAddForm ? "Anuluj dodawanie" : "+ Dodaj źródło"}
        </button>
      </div>

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
            onCancel={() => {
              setShowAddForm(false);
              setAddForm(emptyForm());
              setSaveError(null);
            }}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {(["all", "active", "inactive"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-sm rounded-full font-medium transition-colors ${
              filter === f
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f === "all" ? "Wszystkie" : f === "active" ? "Aktywne" : "Nieaktywne"}
          </button>
        ))}
        <span className="hidden sm:block w-px h-4 bg-slate-200 mx-1" aria-hidden="true" />
        <select
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter(e.target.value as AlertCategory | "all")
          }
          className="text-sm border border-slate-300 rounded-lg px-2.5 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Wszystkie kategorie</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabels[c]}
            </option>
          ))}
        </select>
      </div>

      {/* Success message for mark-checked */}
      {checkSuccess && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 mb-4">
          {checkSuccess}
        </div>
      )}

      {/* Error messages */}
      {checkError && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-4">
          {checkError}
        </div>
      )}
      {loadState === "error" && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-4">
          Nie udało się pobrać źródeł.
        </div>
      )}
      {deleteError && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-4">
          {deleteError}
        </div>
      )}

      {/* Loading skeleton */}
      {loadState === "loading" && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-slate-100 bg-slate-50 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {loadState === "ready" && sources.length === 0 && (
        <div className="text-center py-16">
          <p className="text-slate-400 text-sm mb-6">
            Nie dodano jeszcze żadnych źródeł.
          </p>
          <div className="inline-block text-left rounded-xl border border-slate-200 bg-slate-50 px-6 py-5 max-w-sm">
            <p className="text-sm font-medium text-slate-600 mb-3">
              Przykładowe źródła do dodania:
            </p>
            <ul className="text-sm text-slate-500 space-y-2">
              <li>
                <span className="font-medium text-slate-700">WKD</span>
                {" — "}komunikaty o zakłóceniach ruchu
              </li>
              <li>
                <span className="font-medium text-slate-700">Gmina Michałowice</span>
                {" — "}aktualności i komunikaty urzędu
              </li>
              <li>
                <span className="font-medium text-slate-700">PGE</span>
                {" — "}planowane wyłączenia prądu
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* No results after filter */}
      {loadState === "ready" && sources.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">
          Brak źródeł pasujących do wybranych filtrów.
        </div>
      )}

      {/* Sources list */}
      {loadState === "ready" && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((source) =>
            editingId === source.id ? (
              <div
                key={source.id}
                className="rounded-xl border border-blue-200 bg-blue-50/40 p-4"
              >
                <p className="text-xs font-medium text-blue-700 mb-3">
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
              />
            )
          )}
        </div>
      )}

      {/* Source count summary */}
      {loadState === "ready" && sources.length > 0 && (
        <p className="text-xs text-slate-400 text-right mt-5">
          {sources.length === 1
            ? "1 źródło łącznie"
            : `${sources.length} źródeł łącznie`}
          {filtered.length !== sources.length &&
            ` · ${filtered.length} po filtrowaniu`}
        </p>
      )}

    </main>
  );
}
