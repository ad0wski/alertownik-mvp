"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Alerty" },
  { href: "/builder", label: "Kreator alertu" },
  { href: "/ai-helper", label: "AI Helper" },
];

export function AppHeader() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/" || pathname.startsWith("/alerts");
    return pathname === href;
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="shrink-0">
            <Link
              href="/"
              className="text-xl font-bold text-slate-900 hover:text-slate-700 transition-colors tracking-tight"
            >
              Alertownik
            </Link>
            <p className="text-sm text-slate-500 leading-none mt-1">
              Lokalne alerty w jednym miejscu
            </p>
          </div>
          <nav
            className="flex flex-wrap items-center justify-end gap-x-1 gap-y-1"
            aria-label="Nawigacja"
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
