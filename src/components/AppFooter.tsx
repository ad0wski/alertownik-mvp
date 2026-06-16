"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
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
    <footer className="border-t border-slate-200 mt-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-xs text-slate-400">
            {session ? "Alertownik — panel admina" : "Alertownik — wersja pilotażowa"}
          </p>

          {!session && (
            <div className="flex items-center gap-3">
              <Link
                href="/about"
                className="text-xs text-slate-300 hover:text-slate-500 transition-colors"
              >
                O projekcie
              </Link>
              <a
                href="mailto:ak.jurkowski@gmail.com?subject=Alertownik%20%E2%80%94%20opinia"
                className="text-xs text-slate-300 hover:text-slate-500 transition-colors"
              >
                Kontakt
              </a>
              <Link
                href="/login"
                className="text-xs text-slate-300 hover:text-slate-500 transition-colors"
              >
                Panel admina
              </Link>
            </div>
          )}
        </div>

        {!session && (
          <p className="text-xs text-slate-300">
            Możesz dodać Alertownik do ekranu głównego telefonu.
          </p>
        )}
      </div>
    </footer>
  );
}
