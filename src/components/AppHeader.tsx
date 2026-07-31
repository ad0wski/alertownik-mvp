"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { signOut } from "@/lib/auth";
import { EnvironmentBadge } from "@/components/EnvironmentBadge";
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

  // Sprint 163 — "/" is now the "Dzisiaj" view and "/alerty" is the full
  // list (previously "/" was both). Alert detail pages read as "Alerty"
  // active, matching the mobile bottom nav's same rule
  // (src/lib/publicNav.ts's activePublicNavKey) so desktop and mobile never
  // disagree about which top-level section a given page belongs to.
  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    if (href === "/alerty") return pathname === "/alerty" || pathname.startsWith("/alerts/");
    return pathname === href;
  }

  const publicNavLinkClass = (href: string) =>
    `px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
      isActive(href)
        ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
        : "text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
    }`;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm dark:bg-slate-900 dark:border-slate-800">
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
                className="text-lg font-bold text-slate-900 hover:text-blue-700 transition-colors tracking-tight leading-none dark:text-white dark:hover:text-blue-400"
              >
                Alertownik
              </Link>
              <p className="hidden sm:block text-xs text-slate-500 mt-0.5 leading-none dark:text-slate-400">
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
              Dzisiaj
            </Link>
            <Link href="/alerty" className={publicNavLinkClass("/alerty")}>
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
                <span className="w-px h-4 bg-slate-200 mx-2 dark:bg-slate-700" aria-hidden="true" />
                <span
                  className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 select-none cursor-default dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30"
                  aria-label="Tryb admina"
                >
                  Admin
                </span>
                <EnvironmentBadge />

                {adminLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive(l.href)
                        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}

                <span className="w-px h-4 bg-slate-200 mx-1 dark:bg-slate-700" aria-hidden="true" />

                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-500/10"
                >
                  Wyloguj
                </button>
              </>
            )}
          </nav>

          {/* ── Mobile nav (below sm) ── */}
          {/* Sprint 163 — the public Alerty/Odpady/O projekcie row that used
              to live here was removed: those destinations (plus Dzisiaj)
              are now the fixed bottom navigation on every public mobile
              page (src/components/BottomNav.tsx), so repeating them in the
              header would just be the same three links twice on screen at
              once. The admin hamburger stays — an admin browsing a public
              page on mobile still needs a way back into /admin. */}
          <div className="flex sm:hidden items-center gap-1 flex-1 justify-end min-w-0">
            {session && (
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-label="Menu admina"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
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
        <div className="sm:hidden border-t border-slate-100 bg-white px-4 pt-3 pb-4 flex flex-col gap-1 shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30">
              Admin
            </span>
            <EnvironmentBadge />
          </div>

          {adminLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(l.href)
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                  : "text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
              }`}
            >
              {l.label}
            </Link>
          ))}

          <div className="border-t border-slate-100 mt-2 pt-2 dark:border-slate-800">
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors dark:text-red-400 dark:hover:bg-red-500/10"
            >
              Wyloguj
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
