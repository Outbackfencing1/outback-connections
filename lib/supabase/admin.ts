// lib/supabase/admin.ts
// Service-role Supabase client. Bypasses RLS. SERVER-ONLY.
// Use for: rate-limit counters, account deletion, admin flag queue actions.
// Never import this into client components.
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a service-role client, or null if the service key isn't configured
 * (local dev without env vars). Callers must handle the null case gracefully.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
