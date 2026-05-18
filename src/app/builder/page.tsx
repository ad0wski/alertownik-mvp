"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
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

// Strip optional ```json … ``` or ``` … ``` code fences that AI sometimes adds.
function stripCodeFences(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : text.trim();
}

// Return the string value, or "" for explicit null, or fallback if field absent.
function stringField(val: unknown, fallback: string): string {
  if (val === undefined) return fallback;
  if (val === null || val === "null") return "";
  return typeof val === "string" ? val : fallback;
}

// Like stringField but also strips the time component (for date inputs).
function dateField(val: unknown, fallback: string): string {
  if (val === undefined) return fallback;
  if (val === null || val === "null" || val === "") return "";
  return typeof val === "string" ? val.split("T")[0] : fallback;
}

// Try place first, then location (older AI output used "location" instead).
function pickPlace(place: unknown, location: unknown, fallback: string): string {
  if (typeof place === "string" && place !== "null" && place.trim()) return place;
  if (typeof location === "string" && location !== "null" && location.trim()) return location;
  return fallback;
}

// ────────────────────────────────────────────────────────────────────────────

type ImportStatus = "idle" | "success" | "error";

export default function BuilderPage() {
  const [form, setForm] = useState(initialForm);
  const [copied, setCopied] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");

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
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Link
          href="/"
          className="inline-block text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors mb-6"
        >
          ← Wróć do listy alertów
        </Link>

        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Kreator alertu
          </h1>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            To robocze narzędzie do przygotowywania nowych alertów. Na razie
            nie zapisuje danych w bazie — pomaga tylko ułożyć alert w poprawnym
            formacie.
          </p>
        </header>

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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col gap-5 mb-8">
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

        {/* ── Card preview ──────────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className={labelClass + " mb-3"}>Podgląd karty</h2>
          <AlertCard alert={previewAlert} isPreview />
        </section>

        {/* ── JSON output ───────────────────────────────────────────────── */}
        <section>
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
      </div>
    </main>
  );
}
