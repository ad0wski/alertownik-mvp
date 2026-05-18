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

export default function BuilderPage() {
  const [form, setForm] = useState(initialForm);
  const [copied, setCopied] = useState(false);

  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
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

        {/* Form */}
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

        {/* Card preview */}
        <section className="mb-8">
          <h2 className={labelClass + " mb-3"}>Podgląd karty</h2>
          <AlertCard alert={previewAlert} />
        </section>

        {/* JSON preview */}
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
