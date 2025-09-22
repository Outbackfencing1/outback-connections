// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// For client components / browser (no session persistence needed yet)
export const supabaseBrowser = () =>
  createClient(url, anon, { auth: { persistSession: false } });

// For server components (uses anon key + your RLS policies)
export const supabaseServer = () =>
  createClient(url, anon, { auth: { persistSession: false } });

// For trusted server-side writes (bypasses RLS). **Never expose to the client**
export const supabaseAdmin = () => createClient(url, serviceRole);
