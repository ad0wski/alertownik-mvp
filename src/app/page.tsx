import Link from "next/link";
import { AlertList } from "@/components/AlertList";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">

      {/* Hero */}
      <div className="mb-6 sm:mb-10">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug mb-2">
          Lokalne zmiany i utrudnienia w prostym formacie.
        </h1>
        <p className="text-sm sm:text-base text-slate-500 mb-4 sm:mb-5 leading-relaxed">
          Alertownik zbiera w jednym miejscu informacje o utrudnieniach w transporcie,
          dostawach wody i prądu, drogach, odpadach i komunikatach gminnych —
          bez przeszukiwania długich ogłoszeń.
        </p>
        <div className="flex flex-wrap gap-2 mb-4 sm:mb-5">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" aria-hidden="true" />
            Transport
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" aria-hidden="true" />
            Awarie
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" aria-hidden="true" />
            Komunikaty lokalne
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Wczesny pilotaż —{" "}
          <Link href="/about" className="font-medium text-slate-500 hover:text-blue-700 underline">
            sprawdź jak to działa
          </Link>
          .
        </p>
      </div>

      <AlertList />
    </main>
  );
}
