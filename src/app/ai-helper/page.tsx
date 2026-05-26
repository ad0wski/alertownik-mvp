"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import type { AlertCategory } from "@/types/alert";
import { normalizeAlertSeverity } from "@/lib/normalizeAlert";

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
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

const labelClass = "text-sm font-medium text-slate-700";

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
  "severity": "info" | "warning" | "urgent",
  "title": "<krótki tytuł, max 60 znaków>",
  "location": "<ogólna lokalizacja lub rejon, np. Komorów / Pruszków>",
  "place": "<dokładna lokalizacja z ulicą lub adresem>",
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
   - "urgent" = pilna awaria lub zagrożenie zdrowia albo bezpieczeństwa
   - "warning" = planowane utrudnienie lub zmiana wymagająca przygotowania
   - "info" = informacja bez pilności
8. Slug: małe litery, myślniki zamiast spacji i polskich liter, np. "przerwa-w-dostawie-wody-komorow".
9. Zwróć sam obiekt JSON — bez owijania w blok kodu markdown (bez \`\`\`json). Sam obiekt, nic więcej.

## Komunikat źródłowy

${rawSection}

## Dodatkowe dane

${categoryLine}
${sourceLines || "Źródło: nieznane"}`;
}

const AI_PENDING_KEY = "alertownik_pending_ai_alert_json";
const PENDING_SOURCE_KEY = "alertownik_pending_source_for_ai";

interface PendingSourceData {
  sourceName: string;
  sourceUrl: string;
  suggestedCategory: string;
  sourceId: string;
}

const REQUIRED_FIELDS = [
  "category", "severity", "title", "startsAt", "change", "action", "sourceName",
] as const;

function validateAiJson(text: string): boolean {
  try {
    const data = JSON.parse(text.trim());
    if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
    const hasPlace =
      (typeof data.location === "string" && data.location.trim()) ||
      (typeof data.place === "string" && data.place.trim());
    if (!hasPlace) return false;
    if (!normalizeAlertSeverity(data.severity)) return false;
    return REQUIRED_FIELDS.every(
      (f) => typeof data[f] === "string" && data[f].trim()
    );
  } catch {
    return false;
  }
}

export default function AiHelperPage() {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [suggestedCategory, setSuggestedCategory] = useState("");
  const [copied, setCopied] = useState(false);
  const [aiJsonInput, setAiJsonInput] = useState("");
  const [aiJsonStatus, setAiJsonStatus] = useState<"idle" | "valid" | "error">("idle");
  const [sourceLoaded, setSourceLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_SOURCE_KEY);
      if (!raw) return;
      const data: PendingSourceData = JSON.parse(raw);
      if (data.sourceName) setSourceName(data.sourceName);
      if (data.sourceUrl) setSourceUrl(data.sourceUrl);
      if (data.suggestedCategory) setSuggestedCategory(data.suggestedCategory);
      sessionStorage.removeItem(PENDING_SOURCE_KEY);
      setSourceLoaded(true);
    } catch {
      // ignore malformed data
    }
  }, []);

  const prompt = buildPrompt(rawText, sourceName, sourceUrl, suggestedCategory);

  function copyPrompt() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleAiJsonChange(text: string) {
    setAiJsonInput(text);
    if (!text.trim()) {
      setAiJsonStatus("idle");
      return;
    }
    setAiJsonStatus(validateAiJson(text) ? "valid" : "error");
  }

  function sendToBuilder() {
    if (!validateAiJson(aiJsonInput)) {
      setAiJsonStatus("error");
      return;
    }
    sessionStorage.setItem(AI_PENDING_KEY, aiJsonInput.trim());
    router.push("/builder");
  }

  return (
    <AuthGate>
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">

      {/* Page title */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            AI Helper
          </h1>
          <span className="inline-flex items-center text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-0.5">
            Narzędzie robocze MVP
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500 leading-relaxed">
          Robocze narzędzie do przygotowania promptu dla AI. Nie łączy się z
          żadnym API — generuje tekst do wklejenia w ChatGPT lub Claude.
        </p>
      </div>

      {/* Source loaded banner */}
      {sourceLoaded && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-4 mb-6">
          <p className="text-sm font-semibold text-emerald-800 mb-1">
            Źródło zostało wczytane do AI Helpera.
          </p>
          <p className="text-sm text-emerald-700">
            Teraz wklej komunikat z tego źródła, a potem skopiuj prompt do ChatGPT lub Claude.
          </p>
        </div>
      )}

      {/* Input form */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5 mb-6">
        <h2 className="text-base font-semibold text-slate-800">
          Dane wejściowe
        </h2>

        {/* Raw text */}
        <div className="flex flex-col gap-2">
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
          <div className="flex flex-col gap-2">
            <label className={labelClass}>
              Nazwa źródła{" "}
              <span className="font-normal text-slate-400">(opcjonalnie)</span>
            </label>
            <input
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="np. WKD, Urząd Gminy Michałowice"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className={labelClass}>
              Link do źródła{" "}
              <span className="font-normal text-slate-400">(opcjonalnie)</span>
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
        <div className="flex flex-col gap-2">
          <label className={labelClass}>
            Sugerowana kategoria{" "}
            <span className="font-normal text-slate-400">(opcjonalnie)</span>
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
      </section>

      {/* Prompt preview */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">
            Wygenerowany prompt
          </h2>
          <button
            onClick={copyPrompt}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              copied
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300"
            }`}
          >
            {copied ? "Skopiowano ✓" : "Kopiuj prompt"}
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-3">
          Skopiuj ten tekst i wklej do{" "}
          <a
            href="https://chat.openai.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            ChatGPT
          </a>{" "}
          albo{" "}
          <a
            href="https://claude.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            Claude
          </a>
          .
        </p>
        <pre className="bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl p-5 text-sm font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
          {prompt}
        </pre>
      </section>

      {/* AI response — paste JSON and send to Builder */}
      <section className="mt-8">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-800">Odpowiedź AI</h2>
          <p className="text-sm text-slate-500 mt-1">
            Wklej tutaj JSON zwrócony przez ChatGPT lub Claude.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <textarea
            value={aiJsonInput}
            onChange={(e) => handleAiJsonChange(e.target.value)}
            rows={8}
            placeholder="Wklej gotowy JSON alertu..."
            className={inputClass + " resize-y font-mono text-xs"}
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={sendToBuilder}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Wczytaj do Kreatora
            </button>

            {aiJsonStatus === "valid" && (
              <span className="text-sm font-medium text-emerald-700">
                JSON wygląda poprawnie.
              </span>
            )}
            {aiJsonStatus === "error" && (
              <span className="text-sm font-medium text-red-600">
                Nie udało się odczytać JSON. Sprawdź, czy wkleiłeś sam obiekt JSON bez dodatkowego tekstu.
              </span>
            )}
          </div>
        </div>
      </section>
    </main>
    </AuthGate>
  );
}
