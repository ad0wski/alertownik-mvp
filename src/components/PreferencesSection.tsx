"use client";

import { useState, useEffect } from "react";
import { type UserPreferences, emptyPreferences } from "@/lib/userPreferences";
import type { AlertCategory } from "@/types/alert";

const categoryOptions: { value: AlertCategory; label: string }[] = [
  { value: "transport", label: "Transport" },
  { value: "water",     label: "Woda" },
  { value: "power",     label: "Prąd" },
  { value: "waste",     label: "Odpady" },
  { value: "roads",     label: "Drogi" },
  { value: "municipal", label: "Komunikaty" },
];

interface Props {
  savedPrefs: UserPreferences;
  onSave: (prefs: UserPreferences) => void;
  onClear: () => void;
}

export function PreferencesSection({ savedPrefs, onSave, onClear }: Props) {
  const [form, setForm] = useState<UserPreferences>(savedPrefs);
  const [saved, setSaved] = useState(false);

  // Keep form in sync when parent clears preferences
  useEffect(() => {
    setForm(savedPrefs);
  }, [savedPrefs]);

  function toggleCategory(cat: AlertCategory) {
    setSaved(false);
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat],
    }));
  }

  function handleSave() {
    onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleClear() {
    setForm(emptyPreferences);
    onClear();
    setSaved(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4 sm:p-5 mb-5 flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-slate-900">Moja okolica</h2>
        <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
          Wybierz swoją okolicę i kategorie, które Cię interesują. Nie wymaga
          konta — preferencje zapisują się tylko w tej przeglądarce.
        </p>
      </div>

      {/* Location keywords */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="prefs-location" className="text-sm font-medium text-slate-700">
          Moja okolica
        </label>
        <input
          id="prefs-location"
          type="text"
          value={form.locationKeywords}
          onChange={(e) => {
            setSaved(false);
            setForm((p) => ({ ...p, locationKeywords: e.target.value }));
          }}
          placeholder="Np. Komorów, Pruszków, ul. Raszyńska"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        />
        <p className="text-xs text-slate-400 leading-relaxed">
          Nie podawaj dokładnego adresu — wystarczy miejscowość lub grupa
          ulic. Alertownik pokaże alerty i terminy odbioru odpadów (strona{" "}
          <span className="font-medium text-slate-500">Odpady</span>), które
          zawierają te słowa.
        </p>
      </div>

      {/* Category toggles */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-slate-700">Interesujące kategorie</p>
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map((opt) => {
            const active = form.categories.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleCategory(opt.value)}
                aria-pressed={active}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  active
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-400">
          Brak zaznaczenia oznacza wszystkie kategorie.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-0.5">
        <button
          onClick={handleSave}
          className="rounded-lg bg-blue-600 px-4 py-2.5 sm:py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Zapisz preferencje
        </button>
        <button
          onClick={handleClear}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 sm:py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          Wyczyść preferencje
        </button>
        {saved && (
          <span className="text-sm font-medium text-emerald-700">
            Preferencje zapisane — tylko w tej przeglądarce.
          </span>
        )}
      </div>
    </div>
  );
}
