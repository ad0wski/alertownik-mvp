"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import { AlertCard } from "@/components/AlertCard";
import type { Alert, AlertCategory, AlertSeverity } from "@/types/alert";

const categoryOptions: { value: AlertCategory; label: string }[] = [
  { value: "transport", label: "Transport" },
  { value: "water", label: "Woda" },
  { value: "power", label: "Prąd" },
  { value: "waste", label: "Odpady" },
  { value: "roads", label: "Drogi" },
  { value: "municipal", label: "Komunikaty" },
];

const severityOptions: { value: AlertSeverity; label: string }[] = [
  { value: "info", label: "Informacja" },
  { value: "warning", label: "Uwaga" },
  { value: "critical", label: "Pilne" },
];

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500";

const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-gray-500";

const initialForm = {
  category: "transport" as AlertCategory,
  severity: "info" as AlertSeverity,
  title: "",
  place: "",
  startsAt: "",
  endsAt: "",
  change: "",
  action: "",
  sourceName: "",
  sourceUrl: "",
};

// ── JSON import helpers ──────────────────────────────────────────────────────

const VALID_CATEGORIES: AlertCategory[] = [
  "transport", "water", "power", "waste", "roads", "municipal",
];
const VALID_SEVERITIES: AlertSeverity[] = ["info", "warning", "critical"];

function stripCodeFences(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : text.trim();
}

function stringField(val: unknown, fallback: string): string {
  if (val === undefined) return fallback;
  if (val === null || val === "null") return "";
  return typeof val === "string" ? val : fallback;
}

function dateField(val: unknown, fallback: string): string {
  if (val === undefined) return fallback;
  if (val === null || val === "null" || val === "") return "";
  return typeof val === "string" ? val.split("T")[0] : fallback;
}

function pickPlace(place: unknown, location: unknown, fallback: string): string {
  if (typeof place === "string" && place !== "null" && place.trim()) return place;
  if (typeof location === "string" && location !== "null" && location.trim()) return location;
  return fallback;
}

// ── Draft helpers ────────────────────────────────────────────────────────────

const DRAFTS_KEY = "alertownik-drafts";
const PUBLISHED_KEY = "alertownik-published-alerts";

type DraftForm = typeof initialForm;

interface Draft {
  id: string;
  createdAt: string;
  form: DraftForm;
}

type PublishedAlert = Alert & { publishedAt: string };

function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    return raw ? (JSON.parse(raw) as Draft[]) : [];
  } catch {
    return [];
  }
}

function saveDrafts(drafts: Draft[]): void {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

function loadPublished(): PublishedAlert[] {
  try {
    const raw = localStorage.getItem(PUBLISHED_KEY);
    return raw ? (JSON.parse(raw) as PublishedAlert[]) : [];
  } catch {
    return [];
  }
}

function savePublished(alerts: PublishedAlert[]): void {
  localStorage.setItem(PUBLISHED_KEY, JSON.stringify(alerts));
}

function generateSlug(title: string): string {
  const polishMap: Record<string, string> = {
    ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
    Ą: "a", Ć: "c", Ę: "e", Ł: "l", Ń: "n", Ó: "o", Ś: "s", Ź: "z", Ż: "z",
  };
  const slug = title
    .split("")
    .map((c) => polishMap[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `alert-${Date.now()}`;
}

function formatItemDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ────────────────────────────────────────────────────────────────────────────

type ImportStatus = "idle" | "success" | "error";
type DraftStatus = "idle" | "saved" | "loaded" | "deleted";
type PublishStatus = "idle" | "published" | "loaded" | "deleted";

export default function BuilderPage() {
  const [form, setForm] = useState(initialForm);
  const [copied, setCopied] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [publishedAlerts, setPublishedAlerts] = useState<PublishedAlert[]>([]);
  const [publishStatus, setPublishStatus] = useState<PublishStatus>("idle");

  useEffect(() => {
    setDrafts(loadDrafts());
    setPublishedAlerts(loadPublished());
  }, []);

  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function importFromJson() {
    try {
      const data = JSON.parse(stripCodeFences(jsonInput));

      setForm({
        category: VALID_CATEGORIES.includes(data.category)
          ? (data.category as AlertCategory)
          : form.category,
        severity: VALID_SEVERITIES.includes(data.severity)
          ? (data.severity as AlertSeverity)
          : form.severity,
        title: stringField(data.title, form.title),
        place: pickPlace(data.place, data.location, form.place),
        startsAt: dateField(data.startsAt, form.startsAt),
        endsAt: dateField(data.endsAt, form.endsAt),
        change: stringField(data.change, form.change),
        action: stringField(data.action, form.action),
        sourceName: stringField(data.sourceName, form.sourceName),
        sourceUrl: stringField(data.sourceUrl, form.sourceUrl),
      });

      setImportStatus("success");
    } catch {
      setImportStatus("error");
    }
  }

  // ── Draft actions ────────────────────────────────────────────────────────

  function saveDraft() {
    const draft: Draft = {
      id: `draft-${Date.now()}`,
      createdAt: new Date().toISOString(),
      form: { ...form },
    };
    const updated = [draft, ...drafts];
    saveDrafts(updated);
    setDrafts(updated);
    setDraftStatus("saved");
    setTimeout(() => setDraftStatus("idle"), 2500);
  }

  function loadDraft(draft: Draft) {
    setForm({ ...draft.form });
    setDraftStatus("loaded");
    setTimeout(() => setDraftStatus("idle"), 2500);
  }

  function deleteDraft(id: string) {
    const updated = drafts.filter((d) => d.id !== id);
    saveDrafts(updated);
    setDrafts(updated);
    setDraftStatus("deleted");
    setTimeout(() => setDraftStatus("idle"), 2500);
  }

  // ── Publish actions ──────────────────────────────────────────────────────

  function publishAlert() {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const newAlert: PublishedAlert = {
      id: `local-${now}`,
      slug: generateSlug(form.title || "alert"),
      category: form.category,
      severity: form.severity,
      title: form.title,
      place: form.place,
      startsAt: form.startsAt || today,
      ...(form.endsAt ? { endsAt: form.endsAt } : {}),
      change: form.change,
      action: form.action,
      sourceName: form.sourceName,
      ...(form.sourceUrl ? { sourceUrl: form.sourceUrl } : {}),
      publishedAt: new Date().toISOString(),
    };
    const updated = [newAlert, ...publishedAlerts];
    savePublished(updated);
    setPublishedAlerts(updated);
    setPublishStatus("published");
    setTimeout(() => setPublishStatus("idle"), 2500);
  }

  function loadPublishedToForm(pa: PublishedAlert) {
    setForm({
      category: pa.category,
      severity: pa.severity,
      title: pa.title,
      place: pa.place,
      startsAt: pa.startsAt.split("T")[0],
      endsAt: pa.endsAt ? pa.endsAt.split("T")[0] : "",
      change: pa.change,
      action: pa.action,
      sourceName: pa.sourceName,
      sourceUrl: pa.sourceUrl ?? "",
    });
    setPublishStatus("loaded");
    setTimeout(() => setPublishStatus("idle"), 2500);
  }

  function deletePublished(id: string) {
    const updated = publishedAlerts.filter((a) => a.id !== id);
    savePublished(updated);
    setPublishedAlerts(updated);
    setPublishStatus("deleted");
    setTimeout(() => setPublishStatus("idle"), 2500);
  }

  // ── Preview / output ─────────────────────────────────────────────────────

  const today = new Date().toISOString().split("T")[0];

  const previewAlert: Alert = {
    id: "podglad",
    slug: "podglad",
    category: form.category,
    severity: form.severity,
    title: form.title || "Tytuł alertu",
    place: form.place || "Lokalizacja",
    startsAt: form.startsAt || today,
    endsAt: form.endsAt || undefined,
    change: form.change || "Opis zmian pojawi się tutaj.",
    action: form.action || "Zalecane działanie pojawi się tutaj.",
    sourceName: form.sourceName || "Nazwa źródła",
    sourceUrl: form.sourceUrl || undefined,
  };

  const alertObject = {
    id: "wpisz-sam",
    slug: "wpisz-sam",
    category: form.category,
    severity: form.severity,
    title: form.title,
    place: form.place,
    startsAt: form.startsAt,
    ...(form.endsAt ? { endsAt: form.endsAt } : {}),
    change: form.change,
    action: form.action,
    sourceName: form.sourceName,
    ...(form.sourceUrl ? { sourceUrl: form.sourceUrl } : {}),
  };

  const jsonOutput = JSON.stringify(alertObject, null, 2);

  function copyJson() {
    navigator.clipboard.writeText(jsonOutput).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const jsonPlaceholder = `{
  "category": "transport",
  "severity": "warning",
  "title": "Zmiana trasy WKD",
  "location": "Komorów / Pruszków",
  "startsAt": "2026-05-19",
  "endsAt": "2026-05-23",
  "place": "Warszawa Śródmieście – Pruszków",
  "change": "Pociągi WKD kursują zmienioną trasą...",
  "action": "Sprawdź rozkład przed wyjściem...",
  "sourceName": "WKD",
  "sourceUrl": "https://wkd.com.pl/aktualnosci/"
}`;

  return (
    <main className="max-w-2xl mx-auto w-full px-4 py-8">
      <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Kreator alertu
          </h1>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            Robocze narzędzie do przygotowywania nowych alertów. Nie zapisuje
            danych w bazie — pomaga ułożyć alert w poprawnym formacie.
          </p>
        </div>

        {/* ── JSON import ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4 mb-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Wczytaj alert z JSON
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Wklej tutaj JSON wygenerowany przez AI Helper, aby automatycznie
              uzupełnić formularz alertu.
            </p>
          </div>

          <textarea
            value={jsonInput}
            onChange={(e) => {
              setJsonInput(e.target.value);
              if (importStatus !== "idle") setImportStatus("idle");
            }}
            rows={5}
            placeholder={jsonPlaceholder}
            className={
              inputClass + " resize-y font-mono text-xs placeholder-gray-300"
            }
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={importFromJson}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Wczytaj JSON do formularza
            </button>

            {importStatus === "success" && (
              <span className="text-xs font-medium text-green-700">
                Alert wczytany do formularza.
              </span>
            )}
            {importStatus === "error" && (
              <span className="text-xs font-medium text-red-600">
                Nie udało się wczytać JSON. Sprawdź, czy format jest poprawny.
              </span>
            )}
          </div>
        </div>

        {/* ── Manual form ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col gap-5 mb-6">
          {/* Category + Severity */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Kategoria</label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className={inputClass}
              >
                {categoryOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Poziom</label>
              <select
                name="severity"
                value={form.severity}
                onChange={handleChange}
                className={inputClass}
              >
                {severityOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Tytuł</label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="np. Zmiana trasy WKD – linia W1"
              className={inputClass}
            />
          </div>

          {/* Place */}
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Lokalizacja</label>
            <input
              type="text"
              name="place"
              value={form.place}
              onChange={handleChange}
              placeholder="np. Komorów, ul. Różana"
              className={inputClass}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Data od</label>
              <input
                type="date"
                name="startsAt"
                value={form.startsAt}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>
                Data do{" "}
                <span className="normal-case font-normal text-gray-400">
                  (opcjonalnie)
                </span>
              </label>
              <input
                type="date"
                name="endsAt"
                value={form.endsAt}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
          </div>

          {/* Change */}
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Co się zmienia</label>
            <textarea
              name="change"
              value={form.change}
              onChange={handleChange}
              rows={3}
              placeholder="Opisz co konkretnie się zmienia..."
              className={inputClass + " resize-y"}
            />
          </div>

          {/* Action */}
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Co zrobić</label>
            <textarea
              name="action"
              value={form.action}
              onChange={handleChange}
              rows={2}
              placeholder="Jakie działanie jest zalecane?"
              className={inputClass + " resize-y"}
            />
          </div>

          {/* Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Nazwa źródła</label>
              <input
                type="text"
                name="sourceName"
                value={form.sourceName}
                onChange={handleChange}
                placeholder="np. Urząd Gminy Michałowice"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>
                Link do źródła{" "}
                <span className="normal-case font-normal text-gray-400">
                  (opcjonalnie)
                </span>
              </label>
              <input
                type="url"
                name="sourceUrl"
                value={form.sourceUrl}
                onChange={handleChange}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* ── Form actions ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <button
            onClick={saveDraft}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 transition-colors"
          >
            Zapisz jako draft
          </button>
          <button
            onClick={publishAlert}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 transition-colors"
          >
            Opublikuj lokalnie
          </button>

          {draftStatus === "saved" && (
            <span className="text-xs font-medium text-green-700">
              Draft zapisany lokalnie.
            </span>
          )}
          {draftStatus === "loaded" && (
            <span className="text-xs font-medium text-blue-700">
              Draft wczytany do formularza.
            </span>
          )}
          {draftStatus === "deleted" && (
            <span className="text-xs font-medium text-gray-500">
              Draft usunięty.
            </span>
          )}
          {publishStatus === "published" && (
            <span className="text-xs font-medium text-green-700">
              Alert opublikowany lokalnie.
            </span>
          )}
          {publishStatus === "loaded" && (
            <span className="text-xs font-medium text-blue-700">
              Alert wczytany do edycji.
            </span>
          )}
          {publishStatus === "deleted" && (
            <span className="text-xs font-medium text-gray-500">
              Alert usunięty z lokalnie opublikowanych.
            </span>
          )}
        </div>

        {/* ── Card preview ──────────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className={labelClass + " mb-3"}>Podgląd karty</h2>
          <AlertCard alert={previewAlert} isPreview />
        </section>

        {/* ── JSON output ───────────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className={labelClass}>JSON alertu</h2>
            <button
              onClick={copyJson}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              {copied ? "Skopiowano ✓" : "Kopiuj JSON"}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Skopiuj ten obiekt i wklej go do{" "}
            <code className="font-mono">src/data/sampleAlerts.ts</code>.
            Uzupełnij pola <code className="font-mono">id</code> i{" "}
            <code className="font-mono">slug</code> ręcznie.
          </p>
          <pre className="bg-gray-900 text-green-400 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto">
            {jsonOutput}
          </pre>
        </section>

        {/* ── Saved drafts ──────────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className={labelClass + " mb-4"}>Zapisane drafty</h2>

          {drafts.length === 0 ? (
            <p className="text-sm text-gray-400">Brak zapisanych draftów.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {draft.form.title || "Bez tytułu"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {categoryOptions.find((o) => o.value === draft.form.category)?.label} ·{" "}
                      {severityOptions.find((o) => o.value === draft.form.severity)?.label} ·{" "}
                      {formatItemDate(draft.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => loadDraft(draft)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Wczytaj
                    </button>
                    <button
                      onClick={() => deleteDraft(draft.id)}
                      className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Usuń
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Published alerts ──────────────────────────────────────────── */}
        <section>
          <h2 className={labelClass + " mb-4"}>Lokalnie opublikowane alerty</h2>

          {publishedAlerts.length === 0 ? (
            <p className="text-sm text-gray-400">
              Brak lokalnie opublikowanych alertów.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {publishedAlerts.map((pa) => (
                <div
                  key={pa.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {pa.title || "Bez tytułu"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {categoryOptions.find((o) => o.value === pa.category)?.label} ·{" "}
                      {severityOptions.find((o) => o.value === pa.severity)?.label} ·{" "}
                      opublikowano {formatItemDate(pa.publishedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => loadPublishedToForm(pa)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Wczytaj do edycji
                    </button>
                    <button
                      onClick={() => deletePublished(pa.id)}
                      className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Usuń z publikowanych
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
    </main>
  );
}

