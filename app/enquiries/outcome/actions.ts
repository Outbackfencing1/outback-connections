"use server";

// Commit a farmer's one-click answer. Only ever called from the confirm form
// on /enquiries/outcome (a POST), never from the emailed link itself, so a
// mail scanner that prefetches links records nothing.
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/signed-tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEnquiryOutcome } from "@/lib/enquiry-outcome";

export async function confirmOutcome(formData: FormData): Promise<void> {
  const t = formData.get("t");
  const v = verifyToken(typeof t === "string" ? t : "");
  if (!v.ok || v.payload.p !== "enq_outcome" || !isEnquiryOutcome(v.payload.l)) {
    redirect("/enquiries/thanks?o=invalid");
  }
  const admin = createAdminClient();
  if (!admin) redirect("/enquiries/thanks?o=invalid");

  const { error } = await admin
    .from("listing_enquiries")
    .update({ outcome: v.payload.l, outcome_at: new Date().toISOString() })
    .eq("id", v.payload.u)
    .eq("status", "forwarded");
  if (error) console.error("[enquiry-outcome] update failed:", error.message);

  redirect(`/enquiries/thanks?o=${v.payload.l}`);
}
