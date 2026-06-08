"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
