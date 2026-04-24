// lib/supabase/middleware.ts
// Session-refresh middleware for Supabase Auth. Called from middleware.ts
// on every request so expired access tokens are silently rotated.
//
// IMPORTANT: the pattern here is prescribed by Supabase. Do not call
// supabase.auth.getSession() — that reads cookies without verifying them
// and skips a network round-trip Supabase needs to refresh the token.
// Use getUser() to force the verification + refresh.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session server-side. Don't short-circuit this.
  await supabase.auth.getUser();

  return supabaseResponse;
}
