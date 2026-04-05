import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY?.trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "[SUPABASE] Variabili mancanti:",
    !SUPABASE_URL ? "SUPABASE_URL" : "",
    !SUPABASE_ANON_KEY ? "SUPABASE_ANON_KEY" : "",
  );
  throw new Error(
    "SUPABASE_URL and SUPABASE_ANON_KEY are required to initialize Supabase client.",
  );
}

let supabaseHost = "(non parsabile)";
try {
  supabaseHost = new URL(SUPABASE_URL).host;
} catch {
  console.error("[SUPABASE] SUPABASE_URL non è un URL valido (prime 48 chars):", SUPABASE_URL.slice(0, 48));
  throw new Error("SUPABASE_URL must be a valid HTTP(S) URL.");
}

console.error(
  "[SUPABASE] Client pronto — host:",
  supabaseHost,
  "| anon key configurata: yes",
);

/** Client pubblico: Auth (signInWithPassword) e chiamate dove RLS è sufficiente. */
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Client service role: bypass RLS per operazioni server-side (host auth, diario, health DB).
 */
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is required for server-side database access (bypass RLS).",
  );
}

export const supabaseAdmin: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);
