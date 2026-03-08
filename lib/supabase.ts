// lib/supabase.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

function hasSupabase(): boolean {
  return !!(url && anon);
}

// For client components / browser (no session persistence needed yet)
export const supabaseBrowser = (): SupabaseClient | null => {
  if (!hasSupabase()) return null;
  return createClient(url!, anon!, { auth: { persistSession: false } });
};

// For server components (uses anon key + your RLS policies)
export const supabaseServer = (): SupabaseClient | null => {
  if (!hasSupabase()) return null;
  return createClient(url!, anon!, { auth: { persistSession: false } });
};

// For trusted server-side writes (bypasses RLS). **Never expose to the client**
export const supabaseAdmin = (): SupabaseClient | null => {
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
};
