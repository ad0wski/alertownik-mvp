"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { signOut } from "@/lib/auth";
import type { Session } from "@supabase/supabase-js";

const adminLinks = [
  { href: "/admin",           label: "Panel" },
  { href: "/admin/new-alert", label: "Nowy alert" },
  { href: "/builder",         label: "Kreator alertu" },
  { href: "/ai-helper",      label: "AI Helper" },
  { href: "/admin/sources",  label: "Źródła" },
  { href: "/admin/queue",    label: "Kandydaci" },
  { href: "/admin/waste",    label: "Harmonogram odpadów" },
];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    setMenuOpen(false);
    await signOut();
    router.push("/");
  }

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/" || pathname.startsWith("/alerts");
    return pathname === href;
  }

  const publicNavLinkClass = (href: string) =>
    `px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
      isActive(href)
        ? "bg-blue-50 text-blue-700"
        : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
    }`;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">

          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span
              className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-sm"
              aria-hidden="true"
            >
              <span className="w-2 h-2 rounded-full bg-white opacity-90" />
            </span>
            <div>
              <Link
                href="/"
                className="text-lg font-bold text-slate-900 hover:text-blue-700 transition-colors tracking-tight leading-none"
              >
                Alertownik
              </Link>
              <p className="hidden sm:block text-xs text-slate-400 mt-0.5 leading-none">
                Lokalne alerty w jednym miejscu
              </p>
            </div>
          </div>

          {/* ── Desktop nav (sm and up) ── */}
          <nav
            className="hidden sm:flex flex-wrap items-center justify-end gap-x-1 gap-y-1"
            aria-label="Nawigacja"
          >
            <Link href="/" className={publicNavLinkClass("/")}>
              Alerty
            </Link>
            <Link href="/odpady" className={publicNavLinkClass("/odpady")}>
              Odpady
            </Link>
            <Link href="/about" className={publicNavLinkClass("/about")}>
              O projekcie
            </Link>

            {session && (
              <>
                <span className="w-px h-4 bg-slate-200 mx-2" aria-hidden="true" />
                <span
                  className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 select-none cursor-default"
                  aria-label="Tryb admina"
                >
                  Admin
                </span>

                {adminLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive(l.href)
                        ? "bg-amber-50 text-amber-700"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}

                <span className="w-px h-4 bg-slate-200 mx-1" aria-hidden="true" />

                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  Wyloguj
                </button>
              </>
            )}
          </nav>

          {/* ── Mobile nav (below sm) ── */}
          <div className="flex sm:hidden items-center gap-1 flex-1 min-w-0">
            {/* Public links scroll horizontally if they don't fit, rather than
                wrapping/overflowing the header (3 links + logo no longer fit
                on a 375px screen) — same pattern as the category-filter row. */}
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
              <Link href="/" className={publicNavLinkClass("/") + " shrink-0 whitespace-nowrap"}>
                Alerty
              </Link>
              <Link href="/odpady" className={publicNavLinkClass("/odpady") + " shrink-0 whitespace-nowrap"}>
                Odpady
              </Link>
              <Link href="/about" className={publicNavLinkClass("/about") + " shrink-0 whitespace-nowrap"}>
                O projekcie
              </Link>
            </div>

            {session && (
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-label="Menu admina"
                className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
              >
                {menuOpen ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu — admin only */}
      {session && menuOpen && (
        <div className="sm:hidden border-t border-slate-100 bg-white px-4 pt-3 pb-4 flex flex-col gap-1 shadow-md">
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
              Admin
            </span>
          </div>

          {adminLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(l.href)
                  ? "bg-amber-50 text-amber-700"
                  : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {l.label}
            </Link>
          ))}

          <div className="border-t border-slate-100 mt-2 pt-2">
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Wyloguj
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
