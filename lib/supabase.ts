import { createClient } from '@supabase/supabase-js';

export const supabaseServer = () => {
  const url = process.env.SUPABASE_URL!;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceRole, {
    auth: { persistSession: false },
  });
};
