"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const EmailSchema = z
  .string()
  .trim()
  .email("Enter the email address used for their account.")
  .max(254, "That email address is too long.")
  .transform((email) => email.toLowerCase());

export type TeamAccessResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

async function getAdminClient() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false as const, message: "Sign in again." };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return { ok: false as const, message: "Admins only." };
  }

  return { ok: true as const, supabase };
}

export async function grantOutreachAccess(
  emailInput: string
): Promise<TeamAccessResult> {
  const parsed = EmailSchema.safeParse(emailInput);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || "Check the email address.",
    };
  }

  const auth = await getAdminClient();
  if (!auth.ok) return auth;

  // Use the signed-in client. The RPC independently checks that the caller is
  // a full admin before resolving the private auth email and granting the
  // narrow outreach role.
  const { error } = await auth.supabase.rpc("admin_set_outreach_staff", {
    p_email: parsed.data,
    p_active: true,
  });

  if (error) {
    console.error("[team-access] grant failed:", error.message);
    if (error.code === "P0002") {
      return {
        ok: false,
        message: "No registered account uses that email. Ask them to sign up first.",
      };
    }
    return { ok: false, message: "Couldn’t grant access. Please try again." };
  }

  revalidatePath("/dashboard/admin/team-access");
  return { ok: true, message: "Outreach access granted." };
}

export async function revokeOutreachAccess(
  emailInput: string
): Promise<TeamAccessResult> {
  const parsed = EmailSchema.safeParse(emailInput);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || "Check the team member.",
    };
  }

  const auth = await getAdminClient();
  if (!auth.ok) return auth;

  // The database RPC repeats the full-admin check and only removes the narrow
  // outreach role; it never changes is_admin.
  const { error } = await auth.supabase.rpc("admin_set_outreach_staff", {
    p_email: parsed.data,
    p_active: false,
  });

  if (error) {
    console.error("[team-access] revoke failed:", error.message);
    return { ok: false, message: "Couldn’t revoke access. Please try again." };
  }

  revalidatePath("/dashboard/admin/team-access");
  return { ok: true, message: "Outreach access revoked." };
}
