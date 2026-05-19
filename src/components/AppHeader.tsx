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
    <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="shrink-0">
            <Link
              href="/"
              className="text-lg font-bold text-gray-900 tracking-tight hover:text-gray-700 transition-colors"
            >
              Alertownik
            </Link>
            <p className="text-xs text-gray-400 leading-none mt-0.5">
              Lokalne alerty w jednym miejscu
            </p>
          </div>
          <nav
            className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1"
            aria-label="Nawigacja"
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? "text-gray-900"
                    : "text-gray-400 hover:text-gray-700"
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
