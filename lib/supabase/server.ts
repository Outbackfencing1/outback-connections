// lib/supabase/server.ts
// Supabase client for Server Components, Server Actions, and Route Handlers.
// Uses Next's cookies() for session persistence — the only way to read the
// current user in RSC land.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  // Supabase's cookie adapter supports promises. Keeping the promise here lets
  // callers create the client synchronously while still using Next's supported
  // asynchronous request API.
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return (await cookieStore).getAll();
        },
        async setAll(cookiesToSet) {
          // In read-only contexts (Server Components), cookies().set throws.
          // In Server Actions / Route Handlers it works. Swallow the throw.
          try {
            const store = await cookieStore;
            cookiesToSet.forEach(({ name, value, options }) =>
              store.set(name, value, options)
            );
          } catch {
            // noop — middleware will refresh the session next request
          }
        },
      },
    }
  );
}
