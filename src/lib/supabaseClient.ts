import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

// Returns null if env variables are not set, so callers can skip gracefully
export const supabase = url && key ? createClient(url, key) : null;
