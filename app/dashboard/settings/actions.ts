"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupAbn } from "@/lib/abr";
import {
  isValidInsuranceBadge,
  isValidRoleTag,
  normaliseAbn,
} from "@/lib/trust";

export type DeleteResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Delete the signed-in user's account immediately.
 *
 * - All listings cascade-delete via FK (listings.user_id → auth.users(id)
 *   ON DELETE CASCADE), which cascades again to job_details / freight_details
 *   / service_details / listing_flags.
 * - user_profiles cascades the same way.
 * - We use the admin client because supabase.auth.admin.deleteUser requires
 *   the service role key.
 */
export async function deleteAccount(): Promise<DeleteResult> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Not signed in." };

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      message: "Account deletion isn't configured on this environment. Contact support.",
    };
  }

  // Deletion record first (the legal-hardening table that was never wired).
  // Written with the service role so it survives the auth user's removal.
  const nowIso = new Date().toISOString();
  const { error: recordError } = await admin.from("account_deletions").insert({
    user_id: userData.user.id,
    user_email_snapshot: userData.user.email ?? null,
    deletion_requested_at: nowIso,
    deletion_completed_at: nowIso,
    initiated_by: "user",
    retention_reason: null,
  });
  if (recordError) {
    // Don't block the user's right to delete on our own bookkeeping.
    console.error("[deleteAccount] account_deletions insert failed:", recordError.message);
  }

  const { error } = await admin.auth.admin.deleteUser(userData.user.id);
  if (error) {
    console.error("[deleteAccount] failed:", error.message);
    return { ok: false, message: "Couldn't delete the account. Please try again or contact support." };
  }

  // Sign out the local session (cookie cleanup) and redirect home
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}

export type TrustProfileState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function updateTrustProfile(
  _prev: TrustProfileState,
  formData: FormData
): Promise<TrustProfileState> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) {
    return { error: "Please sign in first." };
  }

  const displayName = String(formData.get("display_name") ?? "").trim();
  const tradingName = String(formData.get("trading_name") ?? "").trim();
  const postcode = String(formData.get("postcode") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const abnRaw = String(formData.get("abn") ?? "").trim();
  const yearsRaw = String(formData.get("years_in_district") ?? "").trim();

  const rawInsurances = formData.getAll("insurances_held").map((v) => String(v).trim());
  const insurancesHeld = Array.from(new Set(rawInsurances.filter(isValidInsuranceBadge)));

  const rawRoles = formData.getAll("role_tags").map((v) => String(v).trim());
  const roleTags = Array.from(new Set(rawRoles.filter(isValidRoleTag)));

  const fieldErrors: Record<string, string> = {};
  if (displayName.length > 80) {
    fieldErrors.display_name = "Keep your display name under 80 characters.";
  }
  if (tradingName.length > 100) {
    fieldErrors.trading_name = "Keep your property/trading name under 100 characters.";
  }
  if (postcode && !/^\d{4}$/.test(postcode)) {
    fieldErrors.postcode = "Enter a 4-digit Australian postcode.";
  }
  if (bio.length > 600) {
    fieldErrors.bio = "Keep your bio under 600 characters.";
  }

  let yearsInDistrict: number | null = null;
  if (yearsRaw) {
    const n = Number(yearsRaw);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      fieldErrors.years_in_district = "Enter years between 0 and 100.";
    } else {
      yearsInDistrict = n;
    }
  }

  let cleanAbn: string | null = null;
  let abnVerifiedAt: string | null = null;
  let abnEntityName: string | null = null;

  if (abnRaw) {
    cleanAbn = normaliseAbn(abnRaw);
    if (!cleanAbn) {
      fieldErrors.abn = "Enter a valid 11-digit Australian Business Number (ABN).";
    } else {
      abnVerifiedAt = new Date().toISOString();
      const abr = await lookupAbn(cleanAbn);
      if (abr.ok) {
        if (!abr.isActive) {
          fieldErrors.abn = `ABN ${cleanAbn} is not currently active on the Australian Business Register.`;
        } else {
          abnEntityName = abr.entityName;
        }
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please check the highlighted fields.", fieldErrors };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Server configuration error." };
  }

  const { error: upsertErr } = await admin.from("user_profiles").upsert(
    {
      user_id: user.id,
      display_name: displayName || null,
      trading_name: tradingName || null,
      postcode: postcode || null,
      bio: bio || null,
      abn: cleanAbn,
      abn_verified_at: abnVerifiedAt,
      abn_entity_name: abnEntityName,
      insurances_held: insurancesHeld,
      role_tags: roleTags,
      years_in_district: yearsInDistrict,
      email_verified_at: user.email_confirmed_at ?? null,
    },
    { onConflict: "user_id" }
  );

  if (upsertErr) {
    return { error: "Could not save your trust profile. Please try again." };
  }

  // Also sync ABN verification to any business claimed by this user
  if (cleanAbn) {
    await admin
      .from("businesses")
      .update({
        abn: cleanAbn,
        claim_status: "abn_verified",
        last_verified_at: new Date().toISOString(),
      })
      .eq("claimed_by", user.id)
      .in("claim_status", ["claimed", "abn_verified"]);
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  revalidatePath(`/profile/${user.id}`);

  return { ok: true };
}
