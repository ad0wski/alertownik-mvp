"use client";

import { useState } from "react";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

// Inline editor for the same `locationKeywords` preference the homepage's
// "Moje alerty" panel saves (src/lib/userPreferences.ts) — lets a resident
// set/change/clear their area directly from /odpady instead of having to
// go back to the homepage first. Sprints 84/85 deliberately rejected a
// second, waste-only locality/street-group picker (see Decisions.md)
// since there was no real data yet to back a dropdown with — this isn't
// that either, it's the same free-text field, just editable from a
// second page so the value stays in sync everywhere it's used.
export function AreaPreferenceBar({ value, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const hasValue = value.trim().length > 0;

  function startEdit() {
    setDraft(value);
    setEditing(true);
  }

  function handleSave() {
    onChange(draft.trim());
    setEditing(false);
  }

  function handleClear() {
    onChange("");
    setDraft("");
    setEditing(false);
  }

  function handleCancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-500/30 shadow-sm p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="odpady-area-input" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Moja okolica
          </label>
          <input
            id="odpady-area-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Np. Komorów, Pruszków, ul. Raszyńska"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 transition-colors"
            autoFocus
          />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
          Nie podawaj dokładnego adresu — wystarczy miejscowość lub grupa ulic.
          Preferencje zapisują się tylko w tej przeglądarce i są też używane
          w „Moja okolica” na stronie głównej.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            className="rounded-lg bg-blue-600 dark:bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors"
          >
            Zapisz
          </button>
          <button
            onClick={handleCancel}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 transition-colors"
          >
            Anuluj
          </button>
          {hasValue && (
            <button
              onClick={handleClear}
              className="rounded-lg border border-red-200 dark:border-red-500/30 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              Wyczyść
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!hasValue) {
    return (
      <div className="bg-blue-50 dark:bg-blue-500/15 rounded-2xl border border-blue-200 dark:border-blue-500/30 shadow-sm p-4 sm:p-5 flex flex-col gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Wybierz swoją okolicę</p>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Nie podawaj dokładnego adresu — wystarczy miejscowość lub grupa ulic.
          Preferencje zapisują się tylko w tej przeglądarce.
        </p>
        <button
          onClick={startEdit}
          className="self-start rounded-lg bg-blue-600 dark:bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors"
        >
          Wybierz okolicę
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-blue-100 shadow-sm p-4 sm:p-5 flex flex-col gap-2">
      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Moja okolica</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{value}</p>
        <div className="flex gap-2">
          <button
            onClick={startEdit}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 transition-colors"
          >
            Zmień
          </button>
          <button
            onClick={handleClear}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 transition-colors"
          >
            Wyczyść
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Ta sama okolica jest też używana w „Moja okolica” na stronie głównej.
      </p>
    </div>
  );
}
