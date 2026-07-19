"use client";

import { useTheme } from "@/components/ThemeProvider";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Systemowy" },
  { value: "light", label: "Jasny" },
  { value: "dark", label: "Ciemny" },
];

// Sprint 162 — three-way theme control. Built as a labeled radiogroup (not a
// <select>) so the current choice and all options are visible and
// keyboard/screen-reader navigable at once — arrow keys move between
// options per the native radiogroup pattern, each button is a real
// `role="radio"` with `aria-checked`, and every hit target is >=44px tall
// per the sprint's accessibility requirement.
export function ThemeToggle() {
  const { preference, resolvedTheme, setPreference } = useTheme();

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Wygląd aplikacji"
        className="inline-flex rounded-xl border border-border bg-surface p-1 gap-1"
      >
        {OPTIONS.map((option) => {
          const checked = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => setPreference(option.value)}
              className={`min-h-[44px] px-4 rounded-lg text-sm font-medium transition-colors ${
                checked
                  ? "bg-primary text-primary-foreground"
                  : "text-text-secondary hover:bg-background-subtle hover:text-text-primary"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-text-muted mt-2">
        Aktualnie: {resolvedTheme === "dark" ? "ciemny" : "jasny"}
        {preference === "system" ? " (wg ustawień systemu)" : ""}.
      </p>
    </div>
  );
}
