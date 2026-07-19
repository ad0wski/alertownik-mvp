"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { buildFeedbackMailto } from "@/lib/feedbackMailto";
import type { Session } from "@supabase/supabase-js";

export function AppFooter() {
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

  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 mt-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {session ? "Alertownik — panel admina" : "Alertownik — wersja pilotażowa"}
          </p>

          {!session && (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/about"
                className="text-xs text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
              >
                O projekcie
              </Link>
              <Link
                href="/partnerzy"
                className="text-xs text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
              >
                Współpraca
              </Link>
              <Link
                href="/prywatnosc"
                className="text-xs text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
              >
                Prywatność
              </Link>
              <Link
                href="/zasady"
                className="text-xs text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
              >
                Zasady
              </Link>
              <a
                href={buildFeedbackMailto()}
                className="text-xs text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
              >
                Kontakt
              </a>
              <Link
                href="/login"
                className="text-xs text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
              >
                Panel admina
              </Link>
              <Link
                href="/instalacja"
                className="text-xs text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
              >
                Zainstaluj Alertownik
              </Link>
              <Link
                href="/ustawienia"
                className="text-xs text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
              >
                Ustawienia
              </Link>
            </div>
          )}
        </div>

        {!session && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Niezależny projekt — nie jest oficjalną aplikacją żadnej gminy, WKD ani PGE.
          </p>
        )}

        {!session && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Możesz dodać Alertownik do ekranu głównego telefonu —{" "}
            <Link
              href="/about#instalacja"
              className="underline hover:text-slate-800 transition-colors dark:hover:text-slate-200"
            >
              zobacz jak
            </Link>
            .
          </p>
        )}
      </div>
    </footer>
  );
}
