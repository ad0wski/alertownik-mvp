import Link from "next/link";

// FINAL-2 — shown with HTTP 404 for a missing or archived alert (the page
// calls notFound()). Same wording as the previous client-side message.
export default function AlertNotFound() {
  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-10">
      <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <h1 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Nie znaleziono alertu</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-8">
          Alert mógł zostać zakończony i usunięty z listy albo link jest nieprawidłowy.
        </p>
        <Link
          href="/alerty"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 dark:bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-500 transition-colors"
        >
          ← Zobacz aktualne alerty
        </Link>
      </div>
    </main>
  );
}
