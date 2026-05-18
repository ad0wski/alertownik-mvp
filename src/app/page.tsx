import Link from "next/link";
import { AlertList } from "@/components/AlertList";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              Alertownik
            </h1>
            <Link
              href="/builder"
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Kreator alertu →
            </Link>
          </div>
          <p className="mt-2 text-gray-500 text-base">
            Lokalne utrudnienia i zmiany w Twojej okolicy
          </p>
        </header>

        <AlertList />
      </div>
    </main>
  );
}
