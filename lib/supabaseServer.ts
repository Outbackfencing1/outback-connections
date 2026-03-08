// lib/supabaseServer.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseServer: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
