"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    // Blank placeholder while session is being checked — avoids layout flash
    return <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10" />;
  }

  if (!session) {
    return (
      <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
            To narzędzie robocze MVP.
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-8">
            Zaloguj się, aby kontynuować.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 dark:bg-blue-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors"
          >
            Przejdź do logowania →
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
