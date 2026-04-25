"use server";

import { z } from "zod";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const InputSchema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("That email doesn't look right").max(255),
  mode: z.enum(["signin", "signup"]),
  agreeTerms: z.boolean().optional(),
  confirmAge: z.boolean().optional(),
  marketing: z.boolean().optional(),
});

export type AuthResult =
  | { ok: true }
  | { ok: false; message: string };

const SIGNUP_CONSENT_COOKIE = "oc_signup_consent";

/**
 * Sends a Supabase magic link to the given email. For signup, validates
 * consent + age and stashes the agreed values in a short-lived cookie
 * so /auth/callback can write them to user_profiles after the user
 * actually exists.
 */
export async function sendMagicLink(input: {
  email: string;
  mode: "signin" | "signup";
  agreeTerms?: boolean;
  confirmAge?: boolean;
  marketing?: boolean;
}): Promise<AuthResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, mode, agreeTerms, confirmAge, marketing } = parsed.data;

  if (mode === "signup") {
    if (!agreeTerms) {
      return {
        ok: false,
        message: "Please tick the box agreeing to the terms and privacy notice.",
      };
    }
    if (!confirmAge) {
      return { ok: false, message: "You need to confirm you're 18 or over." };
    }
  }

  const supabase = createClient();

  const h = headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const redirectTo = `${proto}://${host}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("[auth] signInWithOtp error:", error.message);
    return {
      ok: false,
      message:
        error.message.toLowerCase().includes("rate")
          ? "Too many requests. Please wait a minute and try again."
          : "Couldn't send the link. Please try again in a moment.",
    };
  }

  // For signup flow only: stash the agreed consent values so the
  // callback handler can persist them on user_profiles. We DON'T
  // persist marketing here unless the user is brand new — the trigger
  // creates the profile row on auth.users insert, then the callback
  // runs and applies the consent.
  if (mode === "signup") {
    cookies().set(
      SIGNUP_CONSENT_COOKIE,
      JSON.stringify({
        terms_version: "v3-2026-04-25-defamation-hardened-draft",
        agreed_at: new Date().toISOString(),
        marketing: !!marketing,
        dob_confirmed: !!confirmAge,
      }),
      {
        maxAge: 60 * 60, // 1 hour, matches magic link validity
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: !host.startsWith("localhost"),
      }
    );
  }

  return { ok: true };
}
