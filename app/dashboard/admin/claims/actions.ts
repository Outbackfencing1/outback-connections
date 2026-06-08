"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupAbn } from "@/lib/abr";

// Admin review of claim-this-business requests. App-side admin gate, then the
// service-role-only transition RPCs (approve_claim / reject_claim).

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sign in." };
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) return { ok: false, message: "Admins only." };
  return { ok: true, userId: userData.user.id };
}

export type ClaimActionResult = { ok: true; message: string } | { ok: false; message: string };

export async function approveClaim(claimId: string): Promise<ClaimActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Not configured." };
  const { data, error } = await admin.rpc("approve_claim", {
    p_claim_id: claimId,
    p_reviewed_by: gate.userId,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/admin/claims");
  const status = (data as { business_claim_status?: string })?.business_claim_status ?? "claimed";
  return { ok: true, message: `Approved — business is now ${status}.` };
}

export async function rejectClaim(claimId: string, note?: string): Promise<ClaimActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Not configured." };
  const { error } = await admin.rpc("reject_claim", {
    p_claim_id: claimId,
    p_reviewed_by: gate.userId,
    p_note: note ?? null,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/admin/claims");
  return { ok: true, message: "Rejected." };
}

// Promote a CLAIMED business to abn_verified via an ABR ABN Lookup match.
// UNTESTED against the live ABR (needs ABR_GUID). Admin-gated; the transition
// is recorded by the mark_business_abn_verified RPC. Trigger UI (an owner
// supplying their ABN post-claim, or an admin button on a business view) is a
// later surface — this is the callable capability.
export async function verifyBusinessAbn(
  businessId: string,
  abnInput?: string
): Promise<ClaimActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Not configured." };

  const { data: biz } = await admin
    .from("businesses")
    .select("id, abn, claim_status")
    .eq("id", businessId)
    .maybeSingle();
  if (!biz) return { ok: false, message: "Business not found." };
  if (biz.claim_status !== "claimed" && biz.claim_status !== "abn_verified") {
    return { ok: false, message: `Business must be claimed first (currently ${biz.claim_status}).` };
  }

  const abn = (abnInput || biz.abn || "").replace(/\s/g, "");
  if (!/^\d{11}$/.test(abn)) {
    return { ok: false, message: "No valid 11-digit ABN on file. Add one first." };
  }

  const result = await lookupAbn(abn);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "no_guid"
          ? "ABR not configured (ABR_GUID missing)."
          : `ABR lookup failed: ${result.reason}`,
    };
  }
  if (!result.isActive) {
    return { ok: false, message: `ABN status is ${result.abnStatus} — not active. Not verified.` };
  }

  if (abnInput) await admin.from("businesses").update({ abn }).eq("id", businessId);
  const { error } = await admin.rpc("mark_business_abn_verified", {
    p_business_id: businessId,
    p_abr_status: result.abnStatus,
    p_entity_name: result.entityName,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/admin/claims");
  return { ok: true, message: `Verified: ${result.entityName ?? "entity"} (${result.abnStatus}). Now abn_verified.` };
}
