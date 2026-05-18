"use client";

import { useState } from "react";
import Link from "next/link";
import type { AlertCategory } from "@/types/alert";

const categoryOptions: { value: AlertCategory | ""; label: string }[] = [
  { value: "", label: "AI dobierze automatycznie" },
  { value: "transport", label: "Transport" },
  { value: "water", label: "Woda" },
  { value: "power", label: "Prąd" },
  { value: "waste", label: "Odpady" },
  { value: "roads", label: "Drogi" },
  { value: "municipal", label: "Komunikaty" },
];

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500";

const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-gray-500";

function buildPrompt(
  rawText: string,
  sourceName: string,
  sourceUrl: string,
  suggestedCategory: string
): string {
  const categoryLine = suggestedCategory
    ? `Sugerowana kategoria: ${categoryOptions.find((o) => o.value === suggestedCategory)?.label ?? suggestedCategory}`
    : 'Kategoria: wybierz najlepiej pasującą spośród: "transport", "water", "power", "waste", "roads", "municipal"';

  const sourceLines = [
    sourceName ? `Nazwa źródła: ${sourceName}` : null,
    sourceUrl ? `URL źródła: ${sourceUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const rawSection = rawText.trim() || "(wklej komunikat źródłowy w polu powyżej)";

  return `Jesteś asystentem aplikacji Alertownik — lokalnego serwisu z alertami dla mieszkańców.

Twoim zadaniem jest przekształcić poniższy komunikat źródłowy w alert zgodny ze strukturą danych Alertownik.

## Wymagany format wyjściowy (JSON)

Zwróć obiekt JSON z dokładnie tymi polami:

{
  "id": "wpisz-sam",
  "slug": "<unikalny-identyfikator-url-bez-polskich-liter>",
  "category": "transport" | "water" | "power" | "waste" | "roads" | "municipal",
  "severity": "info" | "warning" | "critical",
  "title": "<krótki tytuł, max 60 znaków>",
  "place": "<dokładna lokalizacja>",
  "startsAt": "<YYYY-MM-DD lub YYYY-MM-DDTHH:MM>",
  "endsAt": "<YYYY-MM-DD lub YYYY-MM-DDTHH:MM — jeśli brak w komunikacie: null>",
  "change": "<co dokładnie się zmienia — 1–3 zdania>",
  "action": "<co mieszkaniec powinien zrobić — 1–2 zdania>",
  "sourceName": "<nazwa instytucji>",
  "sourceUrl": "<URL lub null>"
}

## Zasady tworzenia alertu

1. Pisz prostym, zrozumiałym językiem. Unikaj urzędowego stylu i skomplikowanych zdań.
2. Alert musi być krótki i czytelny na ekranie telefonu.
3. Skup się na tym, co mieszkaniec musi wiedzieć i co powinien zrobić — nie przepisuj całego komunikatu.
4. Jeśli jakaś informacja nie wynika jasno z komunikatu, wpisz null — nie zgaduj i nie uzupełniaj luk.
5. Pole "change": opisuje co konkretnie się zmienia lub dzieje (fakty).
6. Pole "action": opisuje co mieszkaniec powinien zrobić w odpowiedzi na ten alert (zalecenie).
7. Dobór severity:
   - "critical" = pilna awaria lub zagrożenie zdrowia albo bezpieczeństwa
   - "warning" = planowane utrudnienie lub zmiana wymagająca przygotowania
   - "info" = informacja bez pilności
8. Slug: małe litery, myślniki zamiast spacji i polskich liter, np. "przerwa-w-dostawie-wody-komorow".

## Komunikat źródłowy

${rawSection}

## Dodatkowe dane

${categoryLine}
${sourceLines || "Źródło: nieznane"}`;
}

export default function AiHelperPage() {
  const [rawText, setRawText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [suggestedCategory, setSuggestedCategory] = useState("");
  const [copied, setCopied] = useState(false);

  const prompt = buildPrompt(rawText, sourceName, sourceUrl, suggestedCategory);

  function copyPrompt() {
    navigator.clipboard.writeText(prompt).then(() => {
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
            AI Helper
          </h1>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            To robocze narzędzie pomaga przygotować prompt do AI. Na razie nie
            łączy się z żadnym API — generuje tekst, który można wkleić do
            ChatGPT albo Claude.
          </p>
        </header>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col gap-5 mb-8">
          {/* Raw text */}
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Wklej komunikat źródłowy</label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={6}
              placeholder="Wklej tutaj komunikat z WKD, gminy, PGE albo innego oficjalnego źródła..."
              className={inputClass + " resize-y"}
            />
          </div>

          {/* Source name + URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>
                Nazwa źródła{" "}
                <span className="normal-case font-normal text-gray-400">
                  (opcjonalnie)
                </span>
              </label>
              <input
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="np. WKD, Urząd Gminy Michałowice"
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
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
          </div>

          {/* Suggested category */}
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>
              Sugerowana kategoria{" "}
              <span className="normal-case font-normal text-gray-400">
                (opcjonalnie)
              </span>
            </label>
            <select
              value={suggestedCategory}
              onChange={(e) => setSuggestedCategory(e.target.value)}
              className={inputClass}
            >
              {categoryOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Prompt preview */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className={labelClass}>Wygenerowany prompt</h2>
            <button
              onClick={copyPrompt}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              {copied ? "Skopiowano ✓" : "Kopiuj prompt"}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Skopiuj ten tekst i wklej do{" "}
            <a
              href="https://chat.openai.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-600"
            >
              ChatGPT
            </a>{" "}
            albo{" "}
            <a
              href="https://claude.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-600"
            >
              Claude
            </a>
            .
          </p>
          <pre className="bg-gray-900 text-green-400 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
            {prompt}
          </pre>
        </section>
      </div>
    </main>
  );
}
