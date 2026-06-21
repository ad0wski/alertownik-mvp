"use client";

import { useState, useEffect, useCallback, type ChangeEvent, type FormEvent } from "react";
import { AuthGate } from "@/components/AuthGate";
import {
  getAllWasteScheduleItems,
  createWasteScheduleItems,
  updateWasteScheduleItem,
  deleteWasteScheduleItem,
} from "@/lib/supabaseWasteWrites";
import {
  WASTE_TYPES,
  WASTE_TYPE_LABELS,
  placeLabel,
  validateWasteScheduleInput,
  findDuplicateWasteItem,
  isPastDate,
} from "@/lib/wasteSchedule";
import type { WasteScheduleItem, WasteScheduleItemInput, WasteType } from "@/types/wasteSchedule";

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyForm(): WasteScheduleItemInput {
  return {
    locality: "",
    areaName: "",
    streetGroup: "",
    wasteType: "mixed",
    collectionDate: "",
    sourceName: "",
    sourceUrl: "",
    notes: "",
  };
}

function formToInput(item: WasteScheduleItem): WasteScheduleItemInput {
  return {
    locality: item.locality,
    areaName: item.areaName ?? "",
    streetGroup: item.streetGroup ?? "",
    wasteType: item.wasteType,
    collectionDate: item.collectionDate,
    sourceName: item.sourceName ?? "",
    sourceUrl: item.sourceUrl ?? "",
    notes: item.notes ?? "",
  };
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const IMPORT_PLACEHOLDER = `[
  {
    "locality": "Komorów",
    "areaName": "Strefa A",
    "streetGroup": "ul. Główna – ul. Sportowa",
    "wasteType": "mixed",
    "collectionDate": "2026-07-03",
    "sourceName": "Eco-Harmonogram",
    "sourceUrl": "https://www.pruszkow.pl/aplikacja-eco-harmonogram/",
    "notes": ""
  }
]`;

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
const labelClass = "block text-sm font-medium text-slate-700 mb-1";

// Parses + validates a pasted JSON array against the documented row
// format, reusing the exact same validation as the single add/edit form
// (validateWasteScheduleInput) so the two entry paths can't drift apart.
function parseImportRows(text: string): { rows: WasteScheduleItemInput[] } | { errors: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { errors: ["Nieprawidłowy JSON — sprawdź składnię."] };
  }
  if (!Array.isArray(data)) {
    return { errors: ["JSON musi być tablicą obiektów, np. [ {...}, {...} ]."] };
  }
  if (data.length === 0) {
    return { errors: ["Tablica jest pusta — brak wierszy do zaimportowania."] };
  }

  const rows: WasteScheduleItemInput[] = [];
  const errors: string[] = [];

  data.forEach((raw, i) => {
    if (typeof raw !== "object" || raw === null) {
      errors.push(`Wiersz ${i + 1}: musi być obiektem.`);
      return;
    }
    const r = raw as Record<string, unknown>;
    const input: WasteScheduleItemInput = {
      locality: typeof r.locality === "string" ? r.locality : "",
      areaName: typeof r.areaName === "string" ? r.areaName : undefined,
      streetGroup: typeof r.streetGroup === "string" ? r.streetGroup : undefined,
      wasteType: r.wasteType as WasteType,
      collectionDate: typeof r.collectionDate === "string" ? r.collectionDate : "",
      sourceName: typeof r.sourceName === "string" ? r.sourceName : undefined,
      sourceUrl: typeof r.sourceUrl === "string" ? r.sourceUrl : undefined,
      notes: typeof r.notes === "string" ? r.notes : undefined,
    };
    const rowErrors = validateWasteScheduleInput(input);
    if (rowErrors.length > 0) {
      errors.push(`Wiersz ${i + 1}: ${rowErrors.join(" ")}`);
    } else {
      rows.push(input);
    }
  });

  if (errors.length > 0) return { errors };
  return { rows };
}

// ── Page content (auth-gated) ───────────────────────────────────────────────

function WasteAdminContent() {
  const [items, setItems] = useState<WasteScheduleItem[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "table_missing" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [localityFilter, setLocalityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<WasteType | "all">("all");

  // Add/edit form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<WasteScheduleItemInput>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importParsed, setImportParsed] = useState<WasteScheduleItemInput[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoadState("loading");
    const result = await getAllWasteScheduleItems();
    if (result.tableMissing) { setLoadState("table_missing"); return; }
    if (result.error) { setLoadError(result.error); setLoadState("error"); return; }
    setItems(result.items);
    setLoadState("ready");
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── Add/edit form ──────────────────────────────────────────────────────────

  function startAdd() {
    setForm(emptyForm());
    setEditingId(null);
    setFormErrors([]);
    setSaveMsg(null);
    setShowForm(true);
  }

  function startEdit(item: WasteScheduleItem) {
    setForm(formToInput(item));
    setEditingId(item.id);
    setFormErrors([]);
    setSaveMsg(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormErrors([]);
  }

  function handleFormChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errors = validateWasteScheduleInput(form);
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    if (isPastDate(form.collectionDate)) {
      if (!confirm("Data odbioru jest w przeszłości. Zapisać mimo to?")) return;
    }

    if (!editingId) {
      const dup = findDuplicateWasteItem(form, items);
      if (dup) {
        const proceed = confirm(
          `Podobny wpis już istnieje: ${dup.locality}, ${WASTE_TYPE_LABELS[dup.wasteType]}, ${dup.collectionDate}. Zapisać mimo to?`
        );
        if (!proceed) return;
      }
    }

    setFormErrors([]);
    setSaving(true);
    const result = editingId
      ? await updateWasteScheduleItem(editingId, form)
      : await createWasteScheduleItems([form]);
    setSaving(false);

    if (!result.ok) {
      setSaveMsg({ ok: false, text: result.error ?? "Nie udało się zapisać." });
      return;
    }
    setSaveMsg({ ok: true, text: editingId ? "Zapisano zmiany." : "Dodano nowy termin." });
    cancelForm();
    await loadItems();
    setTimeout(() => setSaveMsg(null), 4000);
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete(item: WasteScheduleItem) {
    const proceed = confirm(
      `Usunąć termin „${WASTE_TYPE_LABELS[item.wasteType]}" dla ${placeLabel(item)} (${item.collectionDate})? Tej operacji nie można cofnąć.`
    );
    if (!proceed) return;

    setDeletingId(item.id);
    const result = await deleteWasteScheduleItem(item.id);
    setDeletingId(null);

    if (!result.ok) {
      alert(result.error ?? "Nie udało się usunąć terminu.");
      return;
    }
    await loadItems();
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  function handleImportTextChange(text: string) {
    setImportText(text);
    setImportMsg(null);
    if (!text.trim()) {
      setImportErrors([]);
      setImportParsed(null);
      return;
    }
    const result = parseImportRows(text);
    if ("errors" in result) {
      setImportErrors(result.errors);
      setImportParsed(null);
    } else {
      setImportErrors([]);
      setImportParsed(result.rows);
    }
  }

  async function handleImport() {
    if (!importParsed || importParsed.length === 0) return;
    setImporting(true);
    const result = await createWasteScheduleItems(importParsed);
    setImporting(false);

    if (!result.ok) {
      setImportMsg(result.error ?? "Import nie powiódł się.");
      return;
    }
    setImportMsg(`Zaimportowano ${importParsed.length} ${importParsed.length === 1 ? "wiersz" : "wierszy"}.`);
    setImportText("");
    setImportParsed(null);
    await loadItems();
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = items.filter((item) => {
    if (typeFilter !== "all" && item.wasteType !== typeFilter) return false;
    if (localityFilter.trim()) {
      const q = localityFilter.trim().toLowerCase();
      const haystack = [item.locality, item.areaName, item.streetGroup].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const upcoming = filtered.filter((i) => !isPastDate(i.collectionDate));
  const past = filtered.filter((i) => isPastDate(i.collectionDate));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Harmonogram odpadów</h1>
          <span className="inline-flex items-center text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
            Admin
          </span>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">
          Dodawaj i edytuj terminy odbioru odpadów. Każdy termin jest widoczny publicznie od razu po
          zapisaniu — nie ma tu draftów. Zawsze sprawdzaj dane z oficjalnym źródłem przed zapisem i
          unikaj wpisywania dokładnych adresów — używaj okolicy albo grupy ulic.
        </p>
      </div>

      {loadState === "table_missing" && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 mb-6">
          <p className="text-sm font-medium text-slate-700">Tabela harmonogramu nie jest jeszcze włączona.</p>
          <p className="text-sm text-slate-500 mt-1">
            Uruchom migrację z{" "}
            <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
              docs/supabase_waste_schedule_items.sql
            </span>{" "}
            w Supabase SQL Editor.
          </p>
        </div>
      )}

      {loadState === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6">
          <p className="text-sm font-medium text-red-700">Nie udało się pobrać harmonogramu.</p>
          {loadError && <p className="text-xs text-red-500 mt-1 font-mono">{loadError}</p>}
        </div>
      )}

      {(loadState === "ready" || loadState === "loading") && (
        <>
          {/* ── Actions ─────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <button
              onClick={() => (showForm ? cancelForm() : startAdd())}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showForm ? "Anuluj" : "+ Dodaj termin"}
            </button>
            <button
              onClick={() => setShowImport(!showImport)}
              className="px-4 py-2 border border-blue-200 text-blue-700 bg-white text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
            >
              {showImport ? "Ukryj import" : "Import z JSON →"}
            </button>
          </div>

          {/* ── Add/edit form ───────────────────────────────────────────── */}
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-blue-200 bg-blue-50/40 p-5 space-y-4 mb-6"
            >
              <p className="text-sm font-semibold text-slate-800">
                {editingId ? "Edytujesz termin" : "Nowy termin odbioru"}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Lokalizacja (miejscowość)</label>
                  <input
                    name="locality"
                    className={inputClass}
                    value={form.locality}
                    onChange={handleFormChange}
                    placeholder="np. Komorów"
                  />
                </div>
                <div>
                  <label className={labelClass}>Rodzaj odpadów</label>
                  <select
                    name="wasteType"
                    className={inputClass}
                    value={form.wasteType}
                    onChange={handleFormChange}
                  >
                    {WASTE_TYPES.map((t) => (
                      <option key={t} value={t}>{WASTE_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    Strefa / okolica <span className="font-normal text-slate-400">(opcjonalnie)</span>
                  </label>
                  <input
                    name="areaName"
                    className={inputClass}
                    value={form.areaName ?? ""}
                    onChange={handleFormChange}
                    placeholder="np. Strefa A"
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Grupa ulic <span className="font-normal text-slate-400">(opcjonalnie, nie dokładny adres)</span>
                  </label>
                  <input
                    name="streetGroup"
                    className={inputClass}
                    value={form.streetGroup ?? ""}
                    onChange={handleFormChange}
                    placeholder="np. ul. Główna – ul. Sportowa"
                  />
                </div>
                <div>
                  <label className={labelClass}>Data odbioru</label>
                  <input
                    type="date"
                    name="collectionDate"
                    className={inputClass}
                    value={form.collectionDate}
                    onChange={handleFormChange}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Link do źródła <span className="font-normal text-slate-400">(zalecane)</span>
                  </label>
                  <input
                    type="url"
                    name="sourceUrl"
                    className={inputClass}
                    value={form.sourceUrl ?? ""}
                    onChange={handleFormChange}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className={labelClass}>Nazwa źródła</label>
                  <input
                    name="sourceName"
                    className={inputClass}
                    value={form.sourceName ?? ""}
                    onChange={handleFormChange}
                    placeholder="np. Eco-Harmonogram"
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Notatki <span className="font-normal text-slate-400">(opcjonalnie)</span></label>
                <textarea
                  name="notes"
                  rows={2}
                  className={inputClass}
                  value={form.notes ?? ""}
                  onChange={handleFormChange}
                />
              </div>

              {!form.sourceUrl && (
                <p className="text-xs text-amber-600">
                  Brak linku źródła — termin bez źródła trudniej zweryfikować później. Zalecane, niewymagane.
                </p>
              )}

              {formErrors.length > 0 && (
                <ul className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-0.5">
                  {formErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}

              {saveMsg && !saveMsg.ok && (
                <p className="text-sm font-medium text-red-700">{saveMsg.text}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Zapisywanie…" : editingId ? "Zapisz zmiany" : "Dodaj termin"}
                </button>
                <button
                  type="button"
                  onClick={cancelForm}
                  className="px-4 py-2 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Anuluj
                </button>
              </div>
            </form>
          )}

          {saveMsg && saveMsg.ok && (
            <p className="text-sm font-medium text-emerald-700 mb-4">{saveMsg.text}</p>
          )}

          {/* ── JSON import ─────────────────────────────────────────────── */}
          {showImport && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 mb-6">
              <div>
                <p className="text-sm font-semibold text-slate-800">Import wielu terminów z JSON</p>
                <p className="text-sm text-slate-500 mt-1">
                  Wklej tablicę obiektów w formacie poniżej. Pola: <span className="font-mono text-xs">locality</span> (wymagane),{" "}
                  <span className="font-mono text-xs">areaName</span>, <span className="font-mono text-xs">streetGroup</span>,{" "}
                  <span className="font-mono text-xs">wasteType</span> (wymagane — {WASTE_TYPES.join(", ")}),{" "}
                  <span className="font-mono text-xs">collectionDate</span> (wymagane, RRRR-MM-DD),{" "}
                  <span className="font-mono text-xs">sourceName</span>, <span className="font-mono text-xs">sourceUrl</span>,{" "}
                  <span className="font-mono text-xs">notes</span>. Każdy wiersz przechodzi te same sprawdzenia co formularz powyżej —
                  import zapisze dane tylko wtedy, gdy wszystkie wiersze są poprawne.
                </p>
              </div>
              <textarea
                value={importText}
                onChange={(e) => handleImportTextChange(e.target.value)}
                rows={8}
                placeholder={IMPORT_PLACEHOLDER}
                className={inputClass + " resize-y font-mono text-xs"}
              />
              {importErrors.length > 0 && (
                <ul className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-0.5">
                  {importErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
              {importParsed && (
                <p className="text-sm font-medium text-emerald-700">
                  {importParsed.length} {importParsed.length === 1 ? "wiersz gotowy" : "wierszy gotowych"} do zaimportowania.
                </p>
              )}
              {importMsg && <p className="text-sm font-medium text-slate-700">{importMsg}</p>}
              <button
                onClick={handleImport}
                disabled={!importParsed || importing}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {importing ? "Importowanie…" : "Zaimportuj"}
              </button>
            </div>
          )}

          {/* ── Filters ─────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <input
              type="text"
              value={localityFilter}
              onChange={(e) => setLocalityFilter(e.target.value)}
              placeholder="Filtruj po lokalizacji/okolicy..."
              className="flex-1 min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as WasteType | "all")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Wszystkie rodzaje</option>
              {WASTE_TYPES.map((t) => (
                <option key={t} value={t}>{WASTE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* ── List ────────────────────────────────────────────────────── */}
          {loadState === "loading" ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl border border-slate-100 bg-slate-50 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              {items.length === 0
                ? "Brak terminów. Dodaj pierwszy termin albo zaimportuj kilka naraz z JSON."
                : "Brak terminów pasujących do filtrów."}
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-slate-700 mb-3">
                  Nadchodzące ({upcoming.length})
                </h2>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-slate-400">Brak nadchodzących terminów.</p>
                ) : (
                  <div className="space-y-2">
                    {upcoming.map((item) => (
                      <WasteItemRow
                        key={item.id}
                        item={item}
                        onEdit={() => startEdit(item)}
                        onDelete={() => handleDelete(item)}
                        deleting={deletingId === item.id}
                      />
                    ))}
                  </div>
                )}
              </div>

              {past.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-slate-400 mb-3">
                    Przeszłe ({past.length})
                  </h2>
                  <div className="space-y-2 opacity-60">
                    {past.map((item) => (
                      <WasteItemRow
                        key={item.id}
                        item={item}
                        onEdit={() => startEdit(item)}
                        onDelete={() => handleDelete(item)}
                        deleting={deletingId === item.id}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ── WasteItemRow ──────────────────────────────────────────────────────────────

function WasteItemRow({
  item, onEdit, onDelete, deleting,
}: {
  item: WasteScheduleItem;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5">
            {WASTE_TYPE_LABELS[item.wasteType] ?? item.wasteType}
          </span>
          <span className="text-sm font-semibold text-slate-900">{item.collectionDate}</span>
        </div>
        <p className="text-sm text-slate-600">{placeLabel(item)}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          {item.sourceUrl ? (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Źródło: {item.sourceName || "zobacz"} →
            </a>
          ) : (
            <span className="text-xs text-amber-600">Brak linku źródła</span>
          )}
          <span className="text-xs text-slate-400">zmieniono {formatUpdatedAt(item.updatedAt)}</span>
        </div>
        {item.notes && <p className="text-xs text-slate-400 mt-1">{item.notes}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onEdit}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          Edytuj
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          {deleting ? "…" : "Usuń"}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminWastePage() {
  return (
    <AuthGate>
      <WasteAdminContent />
    </AuthGate>
  );
}
