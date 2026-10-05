"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOwnerAccess } from "@/lib/digital-services/owner";
import { referenceFor } from "@/lib/digital-services/intake";
import { createAdminClient } from "@/lib/supabase/admin";
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
