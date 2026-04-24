// lib/supabase/client.ts
// Supabase client for client components. Uses document.cookie directly via
// @supabase/ssr so it stays in sync with the server client.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
