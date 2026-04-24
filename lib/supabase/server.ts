// lib/supabase/server.ts
// Supabase client for Server Components, Server Actions, and Route Handlers.
// Uses Next's cookies() for session persistence — the only way to read the
// current user in RSC land.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In read-only contexts (Server Components), cookies().set throws.
          // In Server Actions / Route Handlers it works. Swallow the throw.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // noop — middleware will refresh the session next request
          }
        },
      },
    }
  );
}
