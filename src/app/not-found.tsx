import Link from "next/link";

// FINAL-2 — Polish 404 for any unknown public URL (previously Next.js's
// default English page). Public UI stays Polish.
export default function NotFound() {
  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-10">
      <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <h1 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Nie znaleziono strony</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-8">Ten adres nie istnieje w Alertowniku.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 dark:bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-500 transition-colors"
        >
          ← Strona główna
        </Link>
      </div>
    </main>
  );
}
