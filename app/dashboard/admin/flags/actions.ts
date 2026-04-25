"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setFlash } from "@/lib/posting";

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
    setFlash("Not authorised.");
    redirect("/dashboard");
  }
  return supabase;
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
    setFlash("Couldn't hide listing.");
  } else {
    setFlash("Listing hidden.");
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
    setFlash("Couldn't clear flags.");
  } else {
    setFlash("Flags cleared.");
    revalidatePath("/dashboard/admin/flags");
  }
  redirect("/dashboard/admin/flags");
}
