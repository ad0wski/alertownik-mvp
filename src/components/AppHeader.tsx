"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { signOut } from "@/lib/auth";
import type { Session } from "@supabase/supabase-js";

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await signOut();
    router.push("/");
  }

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/" || pathname.startsWith("/alerts");
    return pathname === href;
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">

          {/* Logo block */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Brand icon — blue rounded square with white dot */}
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

          {/* Navigation */}
          <nav
            className="flex flex-wrap items-center justify-end gap-x-1 gap-y-1"
            aria-label="Nawigacja"
          >
            {/* Public link — always visible */}
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                isActive("/")
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Alerty
            </Link>

            {/* Admin tools — only when logged in */}
            {session && (
              <>
                <span className="hidden sm:block w-px h-4 bg-slate-200 mx-2" aria-hidden="true" />

                {/* Admin badge */}
                <span
                  className="hidden sm:block text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 select-none cursor-default"
                  aria-label="Tryb admina"
                >
                  Admin
                </span>

                {/* Kreator link — shorter label on mobile */}
                <Link
                  href="/builder"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive("/builder")
                      ? "bg-amber-50 text-amber-700"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="sm:hidden">Kreator</span>
                  <span className="hidden sm:inline">Kreator alertu</span>
                </Link>

                {/* AI Helper link */}
                <Link
                  href="/ai-helper"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive("/ai-helper")
                      ? "bg-amber-50 text-amber-700"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  AI Helper
                </Link>

                <span className="hidden sm:block w-px h-4 bg-slate-200 mx-1" aria-hidden="true" />

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  Wyloguj
                </button>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
