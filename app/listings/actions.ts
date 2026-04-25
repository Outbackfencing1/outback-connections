"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setFlash } from "@/lib/posting";

// ============================================================
// Flag a listing (signed-in non-owner only)
// ============================================================

const FlagSchema = z.object({
  listing_id: z.string().uuid("Bad listing id"),
  reason: z.enum(["scam", "duplicate", "offensive", "miscategorised", "other"]),
  note: z.string().trim().max(2000).optional().default(""),
});

export type FlagResult =
  | { ok: true }
  | { ok: false; message: string };

export async function flagListing(formData: FormData): Promise<FlagResult> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, message: "Sign in to flag a listing." };
  }

  const parsed = FlagSchema.safeParse({
    listing_id: formData.get("listing_id"),
    reason: formData.get("reason"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Bad input" };
  }

  // Don't let owners flag their own listings
  const { data: listing } = await supabase
    .from("listings")
    .select("id, user_id")
    .eq("id", parsed.data.listing_id)
    .maybeSingle();

  if (!listing) return { ok: false, message: "Listing not found." };
  if (listing.user_id === userData.user.id) {
    return { ok: false, message: "You can't flag your own listing." };
  }

  const { error } = await supabase.from("listing_flags").insert({
    listing_id: parsed.data.listing_id,
    flagged_by: userData.user.id,
    reason: parsed.data.reason,
    note: parsed.data.note || null,
  });

  if (error) {
    // The UNIQUE (listing_id, flagged_by) constraint surfaces here for repeat flags
    if (error.code === "23505") {
      return { ok: false, message: "You've already flagged this listing." };
    }
    console.error("[flag] insert failed:", error.message);
    return { ok: false, message: "Couldn't record the flag. Please try again." };
  }

  return { ok: true };
}

// ============================================================
// Delete own listing (cascades to detail + flags via FK)
// ============================================================

export async function deleteListing(formData: FormData): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin");

  const id = formData.get("id");
  if (typeof id !== "string" || !id) redirect("/dashboard/listings");

  // Ownership check is also enforced by RLS but we surface a friendly error
  const { data: listing } = await supabase
    .from("listings")
    .select("id, user_id, title")
    .eq("id", id)
    .maybeSingle();

  if (!listing || listing.user_id !== userData.user.id) {
    setFlash("That listing isn't yours to delete.");
    redirect("/dashboard/listings");
  }

  const { error } = await supabase.from("listings").delete().eq("id", id);
  if (error) {
    console.error("[delete] failed:", error.message);
    setFlash("Couldn't delete the listing. Please try again.");
    redirect("/dashboard/listings");
  }

  setFlash(`Deleted: ${listing.title}`);
  revalidatePath("/dashboard/listings");
  revalidatePath("/jobs");
  revalidatePath("/freight");
  revalidatePath("/services");
  redirect("/dashboard/listings");
}

// ============================================================
// Mark a listing as closed (outcome captured)
// ============================================================

const CloseSchema = z.object({
  listing_id: z.string().uuid("Bad listing id"),
  reason: z.enum(["matched", "no_takers", "withdrawn", "other"]),
  note: z.string().trim().max(2000).optional().default(""),
});

export type CloseResult =
  | { ok: true }
  | { ok: false; message: string };

export async function closeListing(formData: FormData): Promise<CloseResult> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, message: "Sign in to close a listing." };
  }

  const parsed = CloseSchema.safeParse({
    listing_id: formData.get("listing_id"),
    reason: formData.get("reason"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Bad input" };
  }

  // Ownership check via the user's RLS context
  const { data: existing } = await supabase
    .from("listings")
    .select("id, user_id, title, status")
    .eq("id", parsed.data.listing_id)
    .maybeSingle();

  if (!existing) return { ok: false, message: "Listing not found." };
  if (existing.user_id !== userData.user.id) {
    return { ok: false, message: "That listing isn't yours." };
  }
  if (existing.status !== "active") {
    return {
      ok: false,
      message: `Listing is already ${existing.status.replace(/_/g, " ")}; can only close active listings.`,
    };
  }

  // Use admin client to bypass any RLS subtleties on update
  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      message: "Closing isn't configured on this environment. Contact support.",
    };
  }

  const { error } = await admin
    .from("listings")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_reason: parsed.data.reason,
      closed_note: parsed.data.note || null,
    })
    .eq("id", parsed.data.listing_id);

  if (error) {
    console.error("[close] update failed:", error.message);
    return { ok: false, message: "Couldn't close the listing. Please try again." };
  }

  revalidatePath("/dashboard/listings");
  revalidatePath("/jobs");
  revalidatePath("/freight");
  revalidatePath("/services");

  return { ok: true };
}

