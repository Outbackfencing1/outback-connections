"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setFlash } from "@/lib/posting";
import {
  executePendingListingApproval,
  isValidListingId,
} from "@/lib/pending-approval";

async function requireAdmin() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    await setFlash("Not authorised.");
    redirect("/dashboard");
  }
  return supabase;
}

async function requireStaffOrAdmin() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, is_staff")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!(profile?.is_admin || profile?.is_staff)) {
    await setFlash("Not authorised.");
    redirect("/dashboard");
  }
  return supabase;
}

export async function approvePendingListing(formData: FormData): Promise<void> {
  const id = formData.get("listing_id");
  if (!isValidListingId(id)) {
    await setFlash("Invalid listing ID.");
    redirect("/dashboard/admin/flags");
  }

  await requireStaffOrAdmin();
  const admin = createAdminClient();
  if (!admin) {
    await setFlash("Admin database client unavailable.");
    redirect("/dashboard/admin/flags");
  }

  const outcome = await executePendingListingApproval(admin, id);

  if (!outcome.ok) {
    if (outcome.reason === "db_error" && outcome.errorMessage) {
      console.error("[admin] approve pending listing failed:", outcome.errorMessage);
    }
    await setFlash(outcome.flash);
  } else {
    await setFlash(outcome.flash);
    revalidatePath("/dashboard/admin/flags");
    revalidatePath("/jobs");
    revalidatePath("/freight");
    revalidatePath("/services");
    revalidatePath("/sale");
  }
  redirect("/dashboard/admin/flags");
}

export async function hideListing(formData: FormData): Promise<void> {
  const id = formData.get("listing_id");
  if (typeof id !== "string" || !id) redirect("/dashboard/admin/flags");

  const supabase = await requireAdmin();
  // Use the admin_hide_listing SECURITY DEFINER function — it re-checks
  // is_admin server-side and bypasses RLS on the update.
  const { error } = await supabase.rpc("admin_hide_listing", {
    target_listing: id,
  });

  if (error) {
    console.error("[admin] hide failed:", error.message);
    await setFlash("Couldn't hide listing.");
  } else {
    await setFlash("Listing hidden.");
    revalidatePath("/dashboard/admin/flags");
    revalidatePath("/jobs");
    revalidatePath("/freight");
    revalidatePath("/services");
  }
  redirect("/dashboard/admin/flags");
}

export async function clearFlags(formData: FormData): Promise<void> {
  const id = formData.get("listing_id");
  if (typeof id !== "string" || !id) redirect("/dashboard/admin/flags");

  const supabase = await requireAdmin();
  const { error } = await supabase.rpc("admin_clear_flags", {
    target_listing: id,
  });

  if (error) {
    console.error("[admin] clear flags failed:", error.message);
    await setFlash("Couldn't clear flags.");
  } else {
    await setFlash("Flags cleared.");
    revalidatePath("/dashboard/admin/flags");
  }
  redirect("/dashboard/admin/flags");
}
