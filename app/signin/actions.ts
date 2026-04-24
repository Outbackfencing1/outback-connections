"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const EmailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .email("That email doesn't look right")
  .max(255);

export type AuthResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Sends a Supabase magic link to the given email. Used by both /signin and
 * /signup — Supabase's signInWithOtp creates the account on first use when
 * shouldCreateUser is true.
 */
export async function sendMagicLink(email: string): Promise<AuthResult> {
  const parsed = EmailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid email" };
  }

  const supabase = createClient();

  // Build the redirect URL from the incoming host so local dev, preview, and
  // production all work without env changes.
  const h = headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const redirectTo = `${proto}://${host}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("[auth] signInWithOtp error:", error.message);
    // Most Supabase auth errors are safe to show; rate-limit ones are the
    // main one worth surfacing plainly.
    return {
      ok: false,
      message:
        error.message.toLowerCase().includes("rate")
          ? "Too many requests. Please wait a minute and try again."
          : "Couldn't send the link. Please try again in a moment.",
    };
  }

  return { ok: true };
}
