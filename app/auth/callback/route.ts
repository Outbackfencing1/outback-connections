// app/auth/callback/route.ts
// Magic-link landing. Supabase redirects here with ?code=... after the user
// clicks the email link. We exchange the code for a session, persist any
// signup consent stashed by the action, then send them onward.
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestContext, logAuthEvent } from "@/lib/auth-events";

const SIGNUP_CONSENT_COOKIE = "oc_signup_consent";

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
    return NextResponse.redirect(`${origin}/signin?error=exchange_failed`);
  }

  // Persist signup consent if it's stashed
  const cookieStore = cookies();
  const consentRaw = cookieStore.get(SIGNUP_CONSENT_COOKIE)?.value;
  if (consentRaw) {
    try {
      const consent = JSON.parse(consentRaw) as {
        terms_version: string;
        agreed_at: string;
        marketing: boolean;
        dob_confirmed: boolean;
      };
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const admin = createAdminClient();
        if (admin) {
          const reqCtx = getRequestContext();
          await admin
            .from("user_profiles")
            .update({
              terms_consent_at: consent.agreed_at,
              terms_consent_version: consent.terms_version,
              dob_confirmed_at: consent.dob_confirmed ? consent.agreed_at : null,
              marketing_consent_at: consent.marketing ? consent.agreed_at : null,
              creation_ip: reqCtx.ip,
              creation_user_agent: reqCtx.userAgent,
            })
            .eq("user_id", userData.user.id);
        }
      }
    } catch (e) {
      console.error("[auth] failed to apply signup consent:", e);
    } finally {
      cookieStore.set(SIGNUP_CONSENT_COOKIE, "", { maxAge: 0, path: "/" });
    }
  }

  // Log the magic link use after the session is established.
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      void logAuthEvent({
        userId: userData.user.id,
        email: userData.user.email ?? null,
        eventType: "magic_link_used",
      });
    }
  } catch {
    // best-effort
  }

  return NextResponse.redirect(`${origin}${next}`);
}
