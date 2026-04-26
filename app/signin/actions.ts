"use server";

import { z } from "zod";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { logAuthEvent } from "@/lib/auth-events";

const EmailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email")
  .email("That email doesn't look right")
  .max(255);

const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");

const MagicLinkSchema = z.object({
  email: EmailSchema,
  mode: z.enum(["signin", "signup"]),
  agreeTerms: z.boolean().optional(),
  confirmAge: z.boolean().optional(),
  marketing: z.boolean().optional(),
});

const PasswordSignInSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Enter your password").max(128),
});

const PasswordSignUpSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  agreeTerms: z.boolean(),
  confirmAge: z.boolean(),
  marketing: z.boolean().optional(),
});

const ResetSchema = z.object({ email: EmailSchema });

const UpdatePasswordSchema = z.object({ password: PasswordSchema });

export type AuthResult =
  | { ok: true; redirect?: string; sentLink?: boolean }
  | { ok: false; message: string };

const SIGNUP_CONSENT_COOKIE = "oc_signup_consent";
const TERMS_VERSION = "v3-2026-04-25-defamation-hardened-draft";

function getRedirectBase(): string {
  const h = headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function stashSignupConsent(opts: {
  marketing: boolean;
  dob_confirmed: boolean;
  host: string;
}) {
  cookies().set(
    SIGNUP_CONSENT_COOKIE,
    JSON.stringify({
      terms_version: TERMS_VERSION,
      agreed_at: new Date().toISOString(),
      marketing: opts.marketing,
      dob_confirmed: opts.dob_confirmed,
    }),
    {
      maxAge: 60 * 60,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: !opts.host.startsWith("localhost"),
    }
  );
}

/**
 * Sends a Supabase magic link. For signup, validates consent + age and
 * stashes the agreed values so /auth/callback can apply them once the
 * user actually exists.
 */
export async function sendMagicLink(input: {
  email: string;
  mode: "signin" | "signup";
  agreeTerms?: boolean;
  confirmAge?: boolean;
  marketing?: boolean;
}): Promise<AuthResult> {
  const parsed = MagicLinkSchema.safeParse(input);
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
  const base = getRedirectBase();
  const host = headers().get("host") ?? "localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${base}/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("[auth] signInWithOtp error:", error.message);
    return {
      ok: false,
      message: error.message.toLowerCase().includes("rate")
        ? "Too many requests. Please wait a minute and try again."
        : "Couldn't send the link. Please try again in a moment.",
    };
  }

  if (mode === "signup") {
    stashSignupConsent({
      marketing: !!marketing,
      dob_confirmed: !!confirmAge,
      host,
    });
  }

  void logAuthEvent({ email, eventType: "magic_link_requested" });
  return { ok: true, sentLink: true };
}

/** Email + password sign in. Returns redirect on success. */
export async function signInWithPassword(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const parsed = PasswordSignInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, password } = parsed.data;

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    void logAuthEvent({ email, eventType: "failed_signin" });
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid")) {
      return { ok: false, message: "Email or password is incorrect." };
    }
    if (msg.includes("not confirmed") || msg.includes("email")) {
      return {
        ok: false,
        message:
          "Please confirm your email first — check your inbox for a confirmation link.",
      };
    }
    if (msg.includes("rate")) {
      return { ok: false, message: "Too many attempts. Please wait a minute." };
    }
    console.error("[auth] signInWithPassword error:", error.message);
    return { ok: false, message: "Couldn't sign you in. Please try again." };
  }

  void logAuthEvent({
    userId: data.user?.id ?? null,
    email,
    eventType: "password_signin",
  });
  return { ok: true, redirect: "/dashboard" };
}

/**
 * Email + password sign up. Validates consent + age, stashes them so the
 * email confirmation callback can apply them, calls Supabase signUp.
 */
export async function signUpWithPassword(input: {
  email: string;
  password: string;
  agreeTerms: boolean;
  confirmAge: boolean;
  marketing?: boolean;
}): Promise<AuthResult> {
  const parsed = PasswordSignUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, password, agreeTerms, confirmAge, marketing } = parsed.data;

  if (!agreeTerms) {
    return {
      ok: false,
      message: "Please tick the box agreeing to the terms and privacy notice.",
    };
  }
  if (!confirmAge) {
    return { ok: false, message: "You need to confirm you're 18 or over." };
  }

  const supabase = createClient();
  const base = getRedirectBase();
  const host = headers().get("host") ?? "localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${base}/auth/callback` },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("registered") || msg.includes("already")) {
      return {
        ok: false,
        message:
          "That email already has an account. Try signing in, or use the password reset.",
      };
    }
    if (msg.includes("password")) {
      return { ok: false, message: error.message };
    }
    console.error("[auth] signUp error:", error.message);
    return { ok: false, message: "Couldn't create your account. Please try again." };
  }

  stashSignupConsent({
    marketing: !!marketing,
    dob_confirmed: !!confirmAge,
    host,
  });

  void logAuthEvent({
    userId: data.user?.id ?? null,
    email,
    eventType: "password_signup",
  });

  // If session is null, email confirmation is required.
  // If session exists, user is signed in immediately (when confirmation off).
  if (data.session) {
    return { ok: true, redirect: "/dashboard" };
  }
  return { ok: true, sentLink: true };
}

/** Send a password-reset email. */
export async function requestPasswordReset(input: {
  email: string;
}): Promise<AuthResult> {
  const parsed = ResetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email } = parsed.data;

  const supabase = createClient();
  const base = getRedirectBase();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${base}/auth/callback?next=/reset-password/confirm`,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("rate")) {
      return { ok: false, message: "Too many requests. Please wait a minute." };
    }
    console.error("[auth] resetPasswordForEmail error:", error.message);
    // Don't leak whether the email exists. Treat as success either way.
  }

  void logAuthEvent({ email, eventType: "password_reset_requested" });
  return { ok: true, sentLink: true };
}

/** Update the signed-in user's password. Used by /reset-password/confirm. */
export async function updatePassword(input: {
  password: string;
}): Promise<AuthResult> {
  const parsed = UpdatePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return {
      ok: false,
      message: "Your reset link has expired. Request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("[auth] updateUser password error:", error.message);
    return { ok: false, message: "Couldn't update your password. Please try again." };
  }
  void logAuthEvent({
    userId: userData.user.id,
    email: userData.user.email ?? null,
    eventType: "password_reset_completed",
  });
  return { ok: true, redirect: "/dashboard" };
}
