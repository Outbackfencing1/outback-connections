"use server";

import { revalidatePath } from "next/cache";
import { getOwnerAccess } from "@/lib/digital-services/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUSES } from "@/lib/digital-services/queue";

export async function setEnquiryStatus(formData: FormData): Promise<void> {
  // Owner check inside the action, not only on the page that renders it.
  const access = await getOwnerAccess();
  if (!access.ok) return;
  const id = formData.get("id");
  const status = formData.get("status");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return;
  if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin
    .from("digital_services_enquiries")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/dashboard/owner");
}
