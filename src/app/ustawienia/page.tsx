import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = {
  title: "Ustawienia — Alertownik",
  description: "Wygląd aplikacji — jasny, ciemny albo systemowy motyw.",
};

export default function UstawieniaPage() {
  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary transition-colors mb-5 sm:mb-6 group"
      >
        <span className="group-hover:-translate-x-0.5 transition-transform inline-block">←</span>
        Wróć do listy alertów
      </Link>

      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight mb-2">
          Ustawienia
        </h1>
        <p className="text-sm sm:text-base text-text-muted leading-relaxed">
          Ustawienia zapisują się lokalnie w tej przeglądarce — nie są wysyłane na
          serwer ani powiązane z kontem.
        </p>
      </div>

      <section className="bg-surface rounded-2xl border border-border shadow-sm p-4 sm:p-5">
        <h2 className="text-base font-semibold text-text-primary mb-1">Wygląd</h2>
        <p className="text-sm text-text-secondary leading-relaxed mb-4">
          Domyślnie Alertownik dopasowuje się do motywu Twojego systemu. Możesz
          też wymusić jasny albo ciemny wygląd niezależnie od ustawień systemu.
        </p>
        <ThemeToggle />
      </section>
    </main>
  );
}
