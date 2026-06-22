"use client";

import { useState, useEffect } from "react";
import { loadPreferences, savePreferences, emptyPreferences, type UserPreferences } from "@/lib/userPreferences";
import { AreaPreferenceBar } from "./AreaPreferenceBar";
import { NextCollectionCard } from "./NextCollectionCard";
import { WasteScheduleSection } from "./WasteScheduleSection";

// Owns the single `UserPreferences` read for this page, so the inline
// area editor (AreaPreferenceBar) and the two waste-schedule views below
// it share one source of truth instead of each reading localStorage
// independently — without this, changing/clearing the area here wouldn't
// update the card/list without a full page reload.
export function OdpadyClient() {
  const [prefs, setPrefs] = useState<UserPreferences>(emptyPreferences);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefs(loadPreferences());
    setReady(true);
  }, []);

  function handleAreaChange(next: string) {
    const updated = { ...prefs, locationKeywords: next };
    savePreferences(updated);
    setPrefs(updated);
  }

  return (
    <div className="flex flex-col gap-4">
      {ready && <AreaPreferenceBar value={prefs.locationKeywords} onChange={handleAreaChange} />}

      <NextCollectionCard areaKeywords={prefs.locationKeywords} />

      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-2.5">
          Nadchodzące terminy
        </h2>
        <WasteScheduleSection areaKeywords={prefs.locationKeywords} />
      </section>
    </div>
  );
}
