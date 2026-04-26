// lib/supabase/anon.ts
// Stateless anon Supabase client (no cookies, no session). Safe to use inside
// unstable_cache callbacks where the request-scoped cookied client would error.
// Only suitable for data that's public anyway (aggregate counts, etc.) — RLS
// still applies, so this can't reach private rows.
import { createClient } from "@supabase/supabase-js";

export function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
