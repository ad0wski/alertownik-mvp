"use client";

import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { AlertCard } from "@/components/AlertCard";
import { AuthGate } from "@/components/AuthGate";
import type { Alert, AlertCategory, AlertSeverity } from "@/types/alert";
import {
  saveAlertDraftToSupabase,
  publishAlertToSupabase,
  publishSupabaseAlert,
  archiveSupabaseAlert,
  restoreSupabaseAlertAsDraft,
  updateSupabaseAlert,
} from "@/lib/supabaseAlertWrites";
import {
  getAdminSupabaseAlerts,
  type AdminAlert,
} from "@/lib/getAdminSupabaseAlerts";
import { normalizeAlertSeverity } from "@/lib/normalizeAlert";

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
  { value: "urgent", label: "Pilne" },
];

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

const labelClass = "text-sm font-medium text-slate-700";

const sectionTitleClass = "text-base font-semibold text-slate-800";

const initialForm = {
  category: "transport" as AlertCategory,
  severity: "info" as AlertSeverity,
  title: "",
  slug: "",
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

function statusBadgeClass(status: AdminAlert["status"]): string {
  if (status === "published")
    return "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700";
  if (status === "archived")
    return "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700";
  return "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600";
}

function statusLabel(status: AdminAlert["status"]): string {
  if (status === "published") return "Opublikowany";
  if (status === "archived") return "Zarchiwizowany";
  return "Draft";
}

function matchesAdminSearch(a: AdminAlert, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return (
    a.title.toLowerCase().includes(q) ||
    a.slug.toLowerCase().includes(q) ||
    a.place.toLowerCase().includes(q) ||
    a.change.toLowerCase().includes(q) ||
    a.action.toLowerCase().includes(q)
  );
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
  const [supabaseSaving, setSupabaseSaving] = useState(false);
  const [supabaseSuccess, setSupabaseSuccess] = useState<
    "idle" | "draft" | "published"
  >("idle");
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [supabaseSavedSlug, setSupabaseSavedSlug] = useState("");
  const [supabaseAlerts, setSupabaseAlerts] = useState<AdminAlert[]>([]);
  const [supabaseAlertsLoading, setSupabaseAlertsLoading] = useState(false);
  const [supabaseAlertsError, setSupabaseAlertsError] = useState<string | null>(null);
  const [supabaseLoadedMsg, setSupabaseLoadedMsg] = useState(false);
  const [statusActionSlug, setStatusActionSlug] = useState<string | null>(null);
  const [statusActionMsg, setStatusActionMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [editingSupabaseAlert, setEditingSupabaseAlert] = useState<AdminAlert | null>(null);
  const [supabaseUpdateSaving, setSupabaseUpdateSaving] = useState(false);
  const [supabaseUpdateSuccess, setSupabaseUpdateSuccess] = useState(false);
  const [supabaseUpdateError, setSupabaseUpdateError] = useState<string | null>(null);
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [adminStatusFilter, setAdminStatusFilter] = useState<"all" | "draft" | "published" | "archived">("all");
  const [adminCategoryFilter, setAdminCategoryFilter] = useState<AlertCategory | "all">("all");
  const [urlEditError, setUrlEditError] = useState<string | null>(null);
  const [loadingSupabaseId, setLoadingSupabaseId] = useState<string | null>(null);
  const [aiHelperLoadedMsg, setAiHelperLoadedMsg] = useState(false);
  // Refs track URL-based edit loading: param is read once on mount, processed flag
  // prevents re-loading when the Supabase list refreshes after saves.
  const urlEditParamRef = useRef<string | null>(null);
  const urlEditProcessedRef = useRef(false);
  const formSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    urlEditParamRef.current = new URLSearchParams(window.location.search).get("edit");
    setDrafts(loadDrafts());
    setPublishedAlerts(loadPublished());
    refreshSupabaseAlerts();

    const pendingJson = sessionStorage.getItem("alertownik_pending_ai_alert_json");
    if (pendingJson) {
      sessionStorage.removeItem("alertownik_pending_ai_alert_json");
      try {
        const data = JSON.parse(stripCodeFences(pendingJson));
        setForm({
          category: VALID_CATEGORIES.includes(data.category) ? (data.category as AlertCategory) : "transport",
          severity: normalizeAlertSeverity(data.severity) ?? "info",
          title: stringField(data.title, ""),
          slug: stringField(data.slug, ""),
          place: pickPlace(data.place, data.location, ""),
          startsAt: dateField(data.startsAt, ""),
          endsAt: dateField(data.endsAt, ""),
          change: stringField(data.change, ""),
          action: stringField(data.action, ""),
          sourceName: stringField(data.sourceName, ""),
          sourceUrl: stringField(data.sourceUrl, ""),
        });
        setAiHelperLoadedMsg(true);
        setTimeout(() => setAiHelperLoadedMsg(false), 4000);
        requestAnimationFrame(() => {
          formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } catch {
        // silently ignore — malformed JSON from sessionStorage
      }
    }
  }, []);

  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "title" && !prev.slug) {
        next.slug = generateSlug(value);
      }
      return next;
    });
  }

  function importFromJson() {
    try {
      const data = JSON.parse(stripCodeFences(jsonInput));

      setForm({
        category: VALID_CATEGORIES.includes(data.category)
          ? (data.category as AlertCategory)
          : form.category,
        severity: normalizeAlertSeverity(data.severity) ?? form.severity,
        title: stringField(data.title, form.title),
        slug: stringField(data.slug, form.slug),
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
    setForm({ ...initialForm, ...draft.form });
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
      slug: form.slug || generateSlug(form.title || "alert"),
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
      slug: pa.slug ?? "",
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

  function loadFromSupabaseAlert(a: AdminAlert) {
    setLoadingSupabaseId(a.id);
    setForm({
      category: a.category,
      severity: a.severity,
      title: a.title,
      slug: a.slug,
      place: a.place,
      startsAt: a.startsAt.split("T")[0],
      endsAt: a.endsAt ? a.endsAt.split("T")[0] : "",
      change: a.change,
      action: a.action,
      sourceName: a.sourceName,
      sourceUrl: a.sourceUrl ?? "",
    });
    setEditingSupabaseAlert(a);
    setSupabaseUpdateError(null);
    setSupabaseUpdateSuccess(false);
    setSupabaseLoadedMsg(true);
    setTimeout(() => setSupabaseLoadedMsg(false), 3000);
    setTimeout(() => setLoadingSupabaseId(null), 600);
    // Scroll after React commits the state update so the edit banner is visible
    requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function cancelSupabaseEdit() {
    setEditingSupabaseAlert(null);
    setForm(initialForm);
    setSupabaseUpdateError(null);
    setSupabaseUpdateSuccess(false);
    setUrlEditError(null);
    if (window.location.search.includes("edit=")) {
      window.history.replaceState({}, "", "/builder");
    }
  }

  function clearAdminFilters() {
    setAdminSearchQuery("");
    setAdminStatusFilter("all");
    setAdminCategoryFilter("all");
  }

  function validateForUpdate(): string | null {
    if (!form.title.trim()) return "Uzupełnij wymagane pola przed zapisem.";
    if (!form.slug.trim()) return "Uzupełnij wymagane pola przed zapisem.";
    if (!form.category) return "Uzupełnij wymagane pola przed zapisem.";
    if (!normalizeAlertSeverity(form.severity)) return "Nieprawidłowy poziom ważności alertu.";
    if (!form.startsAt) return "Uzupełnij wymagane pola przed zapisem.";
    return null;
  }

  async function handleUpdateSupabaseAlert() {
    setSupabaseUpdateError(null);
    setSupabaseUpdateSuccess(false);
    const err = validateForUpdate();
    if (err) { setSupabaseUpdateError(err); return; }
    if (!editingSupabaseAlert) return;

    setSupabaseUpdateSaving(true);

    const result = await updateSupabaseAlert(editingSupabaseAlert.id, {
      slug: form.slug.trim(),
      category: form.category,
      severity: form.severity,
      title: form.title,
      place: form.place,
      startsAt: form.startsAt,
      endsAt: form.endsAt || undefined,
      change: form.change,
      action: form.action,
      sourceName: form.sourceName,
      sourceUrl: form.sourceUrl || undefined,
    });

    setSupabaseUpdateSaving(false);

    if (result.ok) {
      setSupabaseUpdateSuccess(true);
      setEditingSupabaseAlert((prev) =>
        prev ? { ...prev, slug: form.slug.trim(), title: form.title } : null
      );
      setTimeout(() => setSupabaseUpdateSuccess(false), 5000);
      await refreshSupabaseAlerts();
    } else {
      setSupabaseUpdateError(result.error ?? "Nieznany błąd.");
    }
  }

  // ── Supabase actions ─────────────────────────────────────────────────────

  async function refreshSupabaseAlerts() {
    setSupabaseAlertsLoading(true);
    setSupabaseAlertsError(null);
    const { alerts, error } = await getAdminSupabaseAlerts();
    setSupabaseAlerts(alerts);
    setSupabaseAlertsError(error);
    setSupabaseAlertsLoading(false);

    // On the first fetch, check if the URL has ?edit=<slug-or-id> and auto-load that alert.
    const editParam = urlEditParamRef.current;
    if (editParam && !urlEditProcessedRef.current) {
      urlEditProcessedRef.current = true;
      const found =
        alerts.find((a) => a.slug === editParam) ??
        alerts.find((a) => a.id === editParam);
      if (found) {
        loadFromSupabaseAlert(found);
      } else {
        setUrlEditError("Nie znaleziono alertu do edycji.");
      }
    }
  }

  async function handleStatusAction(
    slug: string,
    action: "publish" | "archive" | "restore"
  ) {
    setStatusActionSlug(slug);
    setStatusActionMsg(null);

    let result: { ok: boolean; error?: string };
    let successMsg: string;

    if (action === "publish") {
      result = await publishSupabaseAlert(slug);
      successMsg = "Alert opublikowany.";
    } else if (action === "archive") {
      result = await archiveSupabaseAlert(slug);
      successMsg = "Alert zarchiwizowany.";
    } else {
      result = await restoreSupabaseAlertAsDraft(slug);
      successMsg = "Alert przywrócony jako draft.";
    }

    setStatusActionSlug(null);

    if (result.ok) {
      setStatusActionMsg({ type: "success", text: successMsg });
      setTimeout(() => setStatusActionMsg(null), 4000);
      await refreshSupabaseAlerts();
    } else {
      console.error("[Alertownik] Błąd zmiany statusu alertu:", result.error);
      setStatusActionMsg({
        type: "error",
        text: "Nie udało się zmienić statusu alertu.",
      });
      setTimeout(() => setStatusActionMsg(null), 5000);
    }
  }

  function validateForSupabase(): string | null {
    if (!form.title.trim()) return "Tytuł jest wymagany.";
    if (!form.category) return "Kategoria jest wymagana.";
    if (!normalizeAlertSeverity(form.severity)) return "Nieprawidłowy poziom ważności alertu.";
    const slug = form.slug.trim() || generateSlug(form.title);
    if (!slug) return "Nie udało się wygenerować slugu. Wpisz tytuł lub slug ręcznie.";
    return null;
  }

  async function handleSaveDraftToSupabase() {
    setSupabaseError(null);
    setSupabaseSuccess("idle");
    const err = validateForSupabase();
    if (err) { setSupabaseError(err); return; }
    setSupabaseSaving(true);
    const slug = form.slug.trim() || generateSlug(form.title);
    if (!form.slug) setForm((prev) => ({ ...prev, slug }));
    const result = await saveAlertDraftToSupabase({
      slug,
      category: form.category,
      severity: form.severity,
      title: form.title,
      place: form.place,
      startsAt: form.startsAt,
      endsAt: form.endsAt || undefined,
      change: form.change,
      action: form.action,
      sourceName: form.sourceName,
      sourceUrl: form.sourceUrl || undefined,
    });
    setSupabaseSaving(false);
    if (result.ok) {
      setSupabaseSavedSlug(slug);
      setSupabaseSuccess("draft");
      setTimeout(() => setSupabaseSuccess("idle"), 5000);
    } else {
      setSupabaseError(result.error ?? "Nieznany błąd.");
    }
  }

  async function handlePublishToSupabase() {
    setSupabaseError(null);
    setSupabaseSuccess("idle");
    const err = validateForSupabase();
    if (err) { setSupabaseError(err); return; }
    setSupabaseSaving(true);
    const slug = form.slug.trim() || generateSlug(form.title);
    if (!form.slug) setForm((prev) => ({ ...prev, slug }));
    const result = await publishAlertToSupabase({
      slug,
      category: form.category,
      severity: form.severity,
      title: form.title,
      place: form.place,
      startsAt: form.startsAt,
      endsAt: form.endsAt || undefined,
      change: form.change,
      action: form.action,
      sourceName: form.sourceName,
      sourceUrl: form.sourceUrl || undefined,
    });
    setSupabaseSaving(false);
    if (result.ok) {
      setSupabaseSavedSlug(slug);
      setSupabaseSuccess("published");
    } else {
      setSupabaseError(result.error ?? "Nieznany błąd.");
    }
  }

  // ── Admin list filter computations ──────────────────────────────────────

  const filteredSupabaseAlerts = supabaseAlerts
    .filter((a) => adminStatusFilter === "all" || a.status === adminStatusFilter)
    .filter((a) => adminCategoryFilter === "all" || a.category === adminCategoryFilter)
    .filter((a) => matchesAdminSearch(a, adminSearchQuery));

  const hasAdminFilters =
    adminSearchQuery.trim() !== "" ||
    adminStatusFilter !== "all" ||
    adminCategoryFilter !== "all";

  // ── Preview / output ─────────────────────────────────────────────────────

  const today = new Date().toISOString().split("T")[0];

  const previewAlert: Alert = {
    id: "podglad",
    slug: form.slug || "podglad",
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
    slug: form.slug || "wpisz-sam",
    category: form.category,
    severity: normalizeAlertSeverity(form.severity) ?? form.severity,
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
    <AuthGate>
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">

      {/* Page title */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Kreator alertu
          </h1>
          <span className="inline-flex items-center text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-0.5">
            Narzędzie robocze MVP
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500 leading-relaxed">
          Robocze narzędzie do przygotowywania i zapisywania nowych alertów.
          Umożliwia zapis lokalny (w przeglądarce) oraz bezpośredni zapis do Supabase.
          Widoczne tylko dla zalogowanego administratora.
        </p>
      </div>

      {/* ── JSON import ───────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4 mb-6">
        <div>
          <h2 className={sectionTitleClass}>Wczytaj alert z JSON</h2>
          <p className="text-sm text-slate-500 mt-1">
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
          className={inputClass + " resize-y font-mono text-xs placeholder-slate-300"}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={importFromJson}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Wczytaj JSON do formularza
          </button>

          {importStatus === "success" && (
            <span className="text-sm font-medium text-emerald-700">
              Alert wczytany do formularza.
            </span>
          )}
          {importStatus === "error" && (
            <span className="text-sm font-medium text-red-600">
              Nie udało się wczytać JSON. Sprawdź, czy format jest poprawny.
            </span>
          )}
        </div>
      </section>

      {/* ── Manual form ───────────────────────────────────────────────── */}
      <section ref={formSectionRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5 mb-6">

        {editingSupabaseAlert && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 flex flex-col gap-1">
            <p className="text-sm font-bold text-amber-900">
              Edytujesz alert z Supabase: {editingSupabaseAlert.title}
            </p>
            <p className="text-xs font-medium text-amber-700">
              Po zmianach kliknij „Zapisz zmiany w Supabase".
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Status: {statusLabel(editingSupabaseAlert.status)}
            </p>
          </div>
        )}

        {urlEditError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">{urlEditError}</p>
            <p className="text-xs text-red-600 mt-1">
              Sprawdź czy slug jest prawidłowy lub wybierz alert ręcznie z listy poniżej.
            </p>
          </div>
        )}

        <h2 className={sectionTitleClass}>Formularz alertu</h2>

        {/* Category + Severity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
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
          <div className="flex flex-col gap-2">
            <label className={labelClass}>Poziom ważności</label>
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
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Tytuł alertu</label>
          <input
            type="text"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="np. Zmiana trasy WKD – linia W1"
            className={inputClass}
          />
        </div>

        {/* Slug */}
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Slug</label>
          <input
            type="text"
            name="slug"
            value={form.slug}
            onChange={handleChange}
            placeholder="np. zmiana-ruchu-wkd-komorow"
            className={inputClass + " font-mono text-xs"}
          />
          <p className="text-xs text-slate-400">
            Unikalny adres alertu, np. zmiana-ruchu-wkd-komorow. Wypełnia się automatycznie z tytułu.
          </p>
        </div>

        {/* Place */}
        <div className="flex flex-col gap-2">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className={labelClass}>Data od</label>
            <input
              type="date"
              name="startsAt"
              value={form.startsAt}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className={labelClass}>
              Data do{" "}
              <span className="font-normal text-slate-400">(opcjonalnie)</span>
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
        <div className="flex flex-col gap-2">
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
        <div className="flex flex-col gap-2">
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
          <div className="flex flex-col gap-2">
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
          <div className="flex flex-col gap-2">
            <label className={labelClass}>
              Link do źródła{" "}
              <span className="font-normal text-slate-400">(opcjonalnie)</span>
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
      </section>

      {/* ── Form actions (lokalne) ────────────────────────────────────── */}
      <p className="text-xs text-slate-400 mb-2">Zapis lokalny (tylko w przeglądarce):</p>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={saveDraft}
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors"
        >
          Zapisz jako draft
        </button>
        <button
          onClick={publishAlert}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          Opublikuj lokalnie
        </button>

        {draftStatus === "saved" && (
          <span className="text-sm font-medium text-emerald-700">
            Draft zapisany lokalnie.
          </span>
        )}
        {draftStatus === "loaded" && (
          <span className="text-sm font-medium text-blue-700">
            Draft wczytany do formularza.
          </span>
        )}
        {draftStatus === "deleted" && (
          <span className="text-sm font-medium text-slate-500">
            Draft usunięty.
          </span>
        )}
        {publishStatus === "published" && (
          <span className="text-sm font-medium text-emerald-700">
            Alert opublikowany lokalnie.
          </span>
        )}
        {publishStatus === "loaded" && (
          <span className="text-sm font-medium text-blue-700">
            Alert wczytany do edycji.
          </span>
        )}
        {publishStatus === "deleted" && (
          <span className="text-sm font-medium text-slate-500">
            Alert usunięty z lokalnie opublikowanych.
          </span>
        )}
        {supabaseLoadedMsg && (
          <span className="text-sm font-medium text-blue-700">
            Alert z Supabase wczytany do edycji.
          </span>
        )}
        {aiHelperLoadedMsg && (
          <span className="text-sm font-medium text-blue-700">
            Alert z AI Helpera został wczytany do formularza.
          </span>
        )}
      </div>

      {/* ── Supabase save / edit ──────────────────────────────────────── */}
      {editingSupabaseAlert ? (
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-col gap-4 mb-10">
          <div>
            <h2 className="text-base font-semibold text-amber-900">Edycja alertu w Supabase</h2>
            <p className="text-sm text-amber-700 mt-1">
              Zmiany zostaną zapisane w istniejącym wierszu bazy danych. Status alertu pozostaje bez zmian.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleUpdateSupabaseAlert}
              disabled={supabaseUpdateSaving}
              className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {supabaseUpdateSaving ? "Zapisywanie…" : "Zapisz zmiany w Supabase"}
            </button>
            <button
              onClick={cancelSupabaseEdit}
              disabled={supabaseUpdateSaving}
              className="rounded-lg border border-amber-300 bg-white px-5 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Anuluj edycję
            </button>
          </div>

          {supabaseUpdateError && (
            <p className="text-sm font-medium text-red-700">{supabaseUpdateError}</p>
          )}
          {supabaseUpdateSuccess && (
            <p className="text-sm font-medium text-emerald-700">
              Zmiany zapisane w Supabase.
            </p>
          )}
        </section>
      ) : (
        <section className="bg-blue-50 border border-blue-200 rounded-2xl p-6 flex flex-col gap-4 mb-10">
          <div>
            <h2 className="text-base font-semibold text-blue-900">Zapis do Supabase</h2>
            <p className="text-sm text-blue-700 mt-1">
              Zapisuje alert bezpośrednio w bazie danych. Wymaga zalogowania jako administrator.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSaveDraftToSupabase}
              disabled={supabaseSaving}
              className="rounded-lg border border-blue-300 bg-white px-5 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {supabaseSaving ? "Zapisywanie…" : "Zapisz jako draft w Supabase"}
            </button>
            <button
              onClick={handlePublishToSupabase}
              disabled={supabaseSaving}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {supabaseSaving ? "Publikowanie…" : "Opublikuj w Supabase"}
            </button>
          </div>

          {supabaseError && (
            <p className="text-sm font-medium text-red-700">Błąd: {supabaseError}</p>
          )}
          {supabaseSuccess === "draft" && (
            <p className="text-sm font-medium text-emerald-700">
              Draft zapisany w Supabase (slug: {supabaseSavedSlug}).
            </p>
          )}
          {supabaseSuccess === "published" && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-emerald-700">
                Alert opublikowany w Supabase.
              </p>
              <a
                href={`/alerts/${supabaseSavedSlug}`}
                className="text-sm text-blue-700 underline hover:text-blue-900"
              >
                Otwórz alert → /alerts/{supabaseSavedSlug}
              </a>
            </div>
          )}
        </section>
      )}

      {/* ── Card preview ──────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className={sectionTitleClass + " mb-4"}>Podgląd karty</h2>
        <AlertCard alert={previewAlert} isPreview />
      </section>

      {/* ── JSON output ───────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className={sectionTitleClass}>JSON alertu</h2>
          <button
            onClick={copyJson}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              copied
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300"
            }`}
          >
            {copied ? "Skopiowano ✓" : "Kopiuj JSON"}
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-3">
          Skopiuj ten obiekt i wklej go do{" "}
          <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">src/data/sampleAlerts.ts</code>.
          Uzupełnij pola <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">id</code> i{" "}
          <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">slug</code> ręcznie.
        </p>
        <pre className="bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl p-5 text-sm font-mono leading-relaxed overflow-x-auto">
          {jsonOutput}
        </pre>
      </section>

      {/* ── Saved drafts ──────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className={sectionTitleClass + " mb-4"}>Zapisane drafty</h2>

        {drafts.length === 0 ? (
          <p className="text-sm text-slate-400">Brak zapisanych draftów.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {draft.form.title || "Bez tytułu"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {categoryOptions.find((o) => o.value === draft.form.category)?.label} ·{" "}
                    {severityOptions.find((o) => o.value === draft.form.severity)?.label} ·{" "}
                    {formatItemDate(draft.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => loadDraft(draft)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  >
                    Wczytaj
                  </button>
                  <button
                    onClick={() => deleteDraft(draft.id)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
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
      <section className="mb-10">
        <h2 className={sectionTitleClass + " mb-4"}>Lokalnie opublikowane alerty</h2>

        {publishedAlerts.length === 0 ? (
          <p className="text-sm text-slate-400">
            Brak lokalnie opublikowanych alertów.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {publishedAlerts.map((pa) => (
              <div
                key={pa.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {pa.title || "Bez tytułu"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {categoryOptions.find((o) => o.value === pa.category)?.label} ·{" "}
                    {severityOptions.find((o) => o.value === pa.severity)?.label} ·{" "}
                    opublikowano {formatItemDate(pa.publishedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => loadPublishedToForm(pa)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  >
                    Wczytaj do edycji
                  </button>
                  <button
                    onClick={() => deletePublished(pa.id)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Usuń
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {/* ── Alerty w Supabase ─────────────────────────────────────────── */}
      <section className="pb-10">
        <div className="flex items-center justify-between mb-1">
          <h2 className={sectionTitleClass}>Alerty w Supabase</h2>
          <button
            onClick={refreshSupabaseAlerts}
            disabled={supabaseAlertsLoading}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {supabaseAlertsLoading ? "Ładowanie…" : "Odśwież listę"}
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Alerty zapisane w prawdziwej bazie danych. Widoczne tylko dla zalogowanego administratora.
        </p>

        {/* Search + filters — only shown when alerts are loaded */}
        {!supabaseAlertsLoading && !supabaseAlertsError && supabaseAlerts.length > 0 && (
          <div className="flex flex-col gap-3 mb-4">
            {/* Search input */}
            <div className="relative">
              <input
                type="text"
                value={adminSearchQuery}
                onChange={(e) => setAdminSearchQuery(e.target.value)}
                placeholder="Szukaj po tytule, slugu, lokalizacji..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-20 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {adminSearchQuery && (
                <button
                  onClick={() => setAdminSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Wyczyść
                </button>
              )}
            </div>

            {/* Status filter */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: "all", label: "Wszystkie" },
                  { value: "draft", label: "Drafty" },
                  { value: "published", label: "Opublikowane" },
                  { value: "archived", label: "Zarchiwizowane" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAdminStatusFilter(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    adminStatusFilter === opt.value
                      ? "bg-slate-700 text-white border-slate-700"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Category filter */}
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="flex gap-2 min-w-max sm:min-w-0 sm:flex-wrap pb-1 sm:pb-0">
                {(
                  [
                    { value: "all", label: "Wszystkie kategorie" },
                    ...categoryOptions,
                  ] as { value: AlertCategory | "all"; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAdminCategoryFilter(opt.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                      adminCategoryFilter === opt.value
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Counter + clear */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                Wyświetlane alerty w Supabase:{" "}
                <span className="font-semibold text-slate-700">
                  {filteredSupabaseAlerts.length}
                </span>{" "}
                z {supabaseAlerts.length}
              </p>
              {hasAdminFilters && (
                <button
                  onClick={clearAdminFilters}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Wyczyść filtry
                </button>
              )}
            </div>
          </div>
        )}

        {statusActionMsg && (
          <div
            className={`rounded-xl px-4 py-3 mb-4 ${
              statusActionMsg.type === "success"
                ? "bg-emerald-50 border border-emerald-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            <p
              className={`text-sm font-medium ${
                statusActionMsg.type === "success"
                  ? "text-emerald-700"
                  : "text-red-700"
              }`}
            >
              {statusActionMsg.text}
            </p>
          </div>
        )}

        {supabaseAlertsLoading && supabaseAlerts.length === 0 ? (
          <p className="text-sm text-slate-400">Pobieranie alertów z bazy danych…</p>
        ) : supabaseAlertsError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-700">
              Nie udało się pobrać alertów z Supabase.
            </p>
            <p className="text-xs text-red-500 mt-1 font-mono">{supabaseAlertsError}</p>
            <p className="text-xs text-red-600 mt-2">
              Sprawdź czy kolumna <span className="font-mono">updated_at</span> istnieje w tabeli i czy polityki RLS pozwalają na odczyt.
            </p>
          </div>
        ) : supabaseAlerts.length === 0 ? (
          <p className="text-sm text-slate-400">
            Brak alertów w Supabase albo nie udało się ich pobrać.
          </p>
        ) : filteredSupabaseAlerts.length === 0 ? (
          <p className="text-sm text-slate-400">
            Brak alertów pasujących do filtrów.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredSupabaseAlerts.map((a) => (
              <div
                key={a.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={statusBadgeClass(a.status)}>
                      {statusLabel(a.status)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {categoryOptions.find((o) => o.value === a.category)?.label}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-400">
                      {severityOptions.find((o) => o.value === a.severity)?.label}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {a.title || "Bez tytułu"}
                  </p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">
                    {a.slug}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    dodano {formatItemDate(a.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    onClick={() => loadFromSupabaseAlert(a)}
                    disabled={loadingSupabaseId === a.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-60 transition-colors"
                  >
                    {loadingSupabaseId === a.id ? "Wczytywanie…" : "Wczytaj do edycji"}
                  </button>

                  {a.status === "draft" && (
                    <button
                      onClick={() => handleStatusAction(a.slug, "publish")}
                      disabled={statusActionSlug === a.slug}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {statusActionSlug === a.slug ? "…" : "Opublikuj"}
                    </button>
                  )}

                  {a.status === "published" && (
                    <>
                      <a
                        href={`/alerts/${a.slug}`}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        Otwórz alert
                      </a>
                      <button
                        onClick={() => handleStatusAction(a.slug, "archive")}
                        disabled={statusActionSlug === a.slug}
                        className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {statusActionSlug === a.slug ? "…" : "Archiwizuj"}
                      </button>
                    </>
                  )}

                  {a.status === "archived" && (
                    <>
                      <button
                        onClick={() => handleStatusAction(a.slug, "restore")}
                        disabled={statusActionSlug === a.slug}
                        className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {statusActionSlug === a.slug ? "…" : "Przywróć jako draft"}
                      </button>
                      <span className="text-xs text-slate-400 italic">
                        Niewidoczny publicznie
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

    </main>
    </AuthGate>
  );
}
