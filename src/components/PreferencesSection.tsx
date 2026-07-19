"use client";

import { useState, useEffect } from "react";
import { type UserPreferences, emptyPreferences } from "@/lib/userPreferences";
import { PILOT_LOCALITIES } from "@/lib/officialSourceChecklist";
import { matchPilotLocality, pilotLocalitiesLabel } from "@/lib/pilotCoverage";
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
  onClose: () => void;
}

// Sprint 158A — this is now the single place a resident sets "Moja
// okolica": pilot-locality chips, manual locality/street-group input, and
// category interests all live in one panel with one save action. Before
// this sprint, AlertList also rendered a separate compact chip-only picker
// above this panel — Userbrain testers (Franklin, Elizabeth) both found
// that redundant pair confusing, unsure whether the search box was a third
// way to set the same thing. Merging into one panel and clarifying the
// search box's copy (AlertList.tsx) both address that finding.
export function PreferencesSection({ savedPrefs, onSave, onClear, onClose }: Props) {
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

  function selectLocality(locality: string) {
    setSaved(false);
    setForm((prev) => ({ ...prev, locationKeywords: locality }));
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

  const localityStatus = matchPilotLocality(form.locationKeywords);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 shadow-sm p-4 sm:p-5 mb-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Moja okolica</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            Wybierz miejscowość z pilotażu albo wpisz miejscowość lub grupę ulic.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Zamknij ustawienia okolicy"
          className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          Zamknij
        </button>
      </div>

      {/* Pilot locality chips */}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Miejscowości w pilotażu</p>
        <div className="flex flex-wrap gap-2">
          {PILOT_LOCALITIES.map((locality) => {
            const active = form.locationKeywords.trim().toLowerCase() === locality.toLowerCase();
            return (
              <button
                key={locality}
                type="button"
                onClick={() => selectLocality(locality)}
                aria-pressed={active}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  active
                    ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-600"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300"
                }`}
              >
                {locality}
              </button>
            );
          })}
        </div>
      </div>

      {/* Location keywords — manual entry */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="prefs-location" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Lub wpisz miejscowość albo grupę ulic
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
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 transition-colors"
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
          Nie podawaj dokładnego adresu — wystarczy miejscowość lub grupa
          ulic. Alertownik pokaże alerty i terminy odbioru odpadów (strona{" "}
          <span className="font-medium text-slate-500 dark:text-slate-400">Odpady</span>), które
          zawierają te słowa.
        </p>
        {localityStatus === "unsupported" && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
            Nie obsługujemy jeszcze tej okolicy. Obecny pilotaż obejmuje:{" "}
            {pilotLocalitiesLabel()}.
          </p>
        )}
        {localityStatus === "unclear" && (
          <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 leading-relaxed">
            Nie mamy pewności, czy ta grupa ulic znajduje się w obszarze
            pilotażu ({pilotLocalitiesLabel()}). Zapiszemy ją mimo to — jeśli
            nie zobaczysz alertów, może to być powód.
          </p>
        )}
      </div>

      {/* Category toggles */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Interesujące kategorie</p>
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
                    ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-600"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Brak zaznaczenia oznacza wszystkie kategorie.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-0.5">
        <button
          onClick={handleSave}
          className="rounded-lg bg-blue-600 dark:bg-blue-500 px-4 py-2.5 sm:py-2 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors"
        >
          Zapisz preferencje
        </button>
        <button
          onClick={handleClear}
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 sm:py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 transition-colors"
        >
          Wyczyść preferencje
        </button>
        {saved && (
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Preferencje zapisane — tylko w tej przeglądarce.
          </span>
        )}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
        Nie podawaj dokładnego adresu. Preferencje zapisujemy tylko w tej
        przeglądarce.
      </p>
    </div>
  );
}
