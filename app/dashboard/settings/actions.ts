"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const { error } = await admin.auth.admin.deleteUser(userData.user.id);
  if (error) {
    console.error("[deleteAccount] failed:", error.message);
    return { ok: false, message: "Couldn't delete the account. Please try again or contact support." };
  }

  // Sign out the local session (cookie cleanup) and redirect home
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
