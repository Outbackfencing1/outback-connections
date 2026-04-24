// app/auth/callback/route.ts
// Magic-link landing. Supabase redirects here with ?code=... after the user
// clicks the email link. We exchange the code for a session (sets cookies)
// and send them onward — to the dashboard by default, or to ?next= if set.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/signin?error=no_code`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth] exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(
      `${origin}/signin?error=exchange_failed`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
