"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

const EXPORT_RATE_LIMIT_MS = 24 * 60 * 60 * 1000;

export async function requestDataExport(): Promise<ActionResult> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sign in first." };
  const user = userData.user;

  const admin = createAdminClient();
  if (!admin) {
    console.error("[privacy] admin client unavailable for export");
    return {
      ok: false,
      message:
        "Export service is temporarily unavailable. Please try again later.",
    };
  }

  // Rate limit: 1 per 24h
  const since = new Date(Date.now() - EXPORT_RATE_LIMIT_MS).toISOString();
  const { count: recent } = await admin
    .from("data_export_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("requested_at", since);
  if ((recent ?? 0) > 0) {
    return {
      ok: false,
      message:
        "You've already requested an export in the last 24 hours. Try again tomorrow.",
    };
  }

  // Insert a pending row; the API endpoint will pick it up and complete it.
  const { error } = await admin.from("data_export_requests").insert({
    user_id: user.id,
    delivered_to_email: user.email ?? null,
    status: "pending",
  });
  if (error) {
    console.error("[privacy] export insert failed:", error.message);
    return { ok: false, message: "Couldn't queue your export. Try again." };
  }

  // Trigger generation immediately. Best-effort — failures still leave a
  // pending row that an admin can re-process.
  try {
    const base =
      process.env.NEXT_PUBLIC_BASE_URL ??
      "https://www.outbackconnections.com.au";
    await fetch(`${base}/api/user/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": user.id,
        "x-internal-call": process.env.URL_SIGNING_SECRET ?? "",
      },
      cache: "no-store",
    }).catch((e) => {
      console.error("[privacy] export trigger failed:", e);
    });
  } catch (e) {
    console.error("[privacy] export trigger error:", e);
  }

  revalidatePath("/dashboard/privacy");
  return {
    ok: true,
    message:
      "Export requested. Check your email — should arrive within a few minutes.",
  };
}

export async function revokeMarketingConsent(): Promise<ActionResult> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sign in first." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Service unavailable." };

  const { error } = await admin
    .from("user_profiles")
    .update({ marketing_consent_revoked_at: new Date().toISOString() })
    .eq("user_id", userData.user.id);
  if (error) {
    console.error("[privacy] revoke marketing failed:", error.message);
    return { ok: false, message: "Couldn't revoke consent. Try again." };
  }
  revalidatePath("/dashboard/privacy");
  return { ok: true, message: "Marketing emails turned off." };
}
