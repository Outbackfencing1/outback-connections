"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOwnerAccess } from "@/lib/digital-services/owner";
import { referenceFor } from "@/lib/digital-services/intake";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { applyStatusChange, queueViewParams } from "@/lib/digital-services/queue";

export async function setEnquiryStatus(formData: FormData): Promise<void> {
  // Owner check inside the action, not only on the page that renders it.
  const access = await getOwnerAccess();
  if (!access.ok) redirect("/dashboard/owner"); // the page applies the gate (sign-in or 404)

  const admin = createAdminClient();
  const id = formData.get("id");
  const result = await applyStatusChange(
    { id, status: formData.get("status") },
    admin
      ? async (rowId, status) => {
          const { data, error } = await admin
            .from("digital_services_enquiries")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", rowId)
            .select("id, status");
          return { data, error };
        }
      : null
  );

  // Only a confirmed save refreshes the queue as changed. Every outcome is
  // reported back on the page, so a failed write is visible and retryable.
  if (result === "saved") revalidatePath("/dashboard/owner");
  const params = queueViewParams(formData.get("view"));
  params.set("notice", result);
  if (typeof id === "string" && result !== "invalid") params.set("ref", referenceFor(id));
  redirect(`/dashboard/owner?${params.toString()}`);
}

/**
 * Josh's message approval for one exact draft revision. It goes through the
 * database function approve_pilot_message() with Josh's OWN session (not the
 * service role); the database checks the session's user is the configured
 * owner and that the three reviews exist, and refuses anything else.
 */
export async function approvePilotMessage(formData: FormData): Promise<void> {
  const access = await getOwnerAccess();
  if (!access.ok) redirect("/dashboard/owner");
  const draftId = formData.get("draft_id");
  const sha = formData.get("draft_sha256");
  const params = queueViewParams(formData.get("view"));
  const valid = typeof draftId === "string" && /^[0-9a-f-]{36}$/i.test(draftId) && typeof sha === "string" && /^[0-9a-f]{64}$/.test(sha);
  // Approvals are made from the review screen, which shows the exact copy,
  // evidence and reviews first; the outcome is reported back there.
  const back = (outcome: string) =>
    valid ? `/dashboard/owner/review/${draftId}?pilot=${outcome}` : `/dashboard/owner?${params.toString()}`;
  if (!valid) {
    params.set("pilot", "invalid");
    redirect(back("invalid"));
  }
  // The function is idempotent, so a lost response or transient error is
  // retried once: a retry returns the approval if the first call committed.
  // "approved" only with the recorded approval's id back; a policy refusal is
  // final ("stale" when the revision is no longer current); anything still
  // unconfirmed is reported as unconfirmed, not "not recorded". Approving
  // records the approval only: it never sends.
  const attempt = async (): Promise<"approved" | "refused" | "stale" | "unconfirmed"> => {
    try {
      const { data, error } = await createClient().rpc("approve_pilot_message", { p_draft_id: draftId, p_draft_sha256: sha });
      if (error) return error.code === "OC403" ? "refused" : error.code === "OC409" ? "stale" : "unconfirmed";
      return data ? "approved" : "unconfirmed";
    } catch {
      return "unconfirmed";
    }
  };
  let outcome = await attempt();
  if (outcome === "unconfirmed") outcome = await attempt();
  if (outcome === "approved") {
    revalidatePath("/dashboard/owner");
    revalidatePath(`/dashboard/owner/review/${draftId}`);
  }
  redirect(back(outcome));
}
