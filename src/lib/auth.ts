import { supabase } from "@/lib/supabaseClient";

// Returns null on success, Polish error message on failure
export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return "Brak konfiguracji Supabase.";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return null;
  if (error.message.toLowerCase().includes("invalid")) {
    return "Nieprawidłowy email lub hasło.";
  }
  return "Logowanie nie powiodło się. Spróbuj ponownie.";
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}
