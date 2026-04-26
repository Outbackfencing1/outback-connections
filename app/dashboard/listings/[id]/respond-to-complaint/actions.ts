"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendThrottledEmail } from "@/lib/email-throttle";
import { NOTIFICATION_TO } from "@/lib/email";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

const Schema = z.object({
  listingId: z.string().uuid(),
  complaintId: z.string().min(1),
  response: z.string().trim().min(20, "Write at least a sentence or two").max(8000),
});

export type RespondResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function submitOwnerResponse(input: {
  listingId: string;
  complaintId: string;
  response: string;
}): Promise<RespondResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const { listingId, complaintId, response } = parsed.data;

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sign in first." };

  // Verify ownership
  const { data: listing } = await supabase
    .from("listings")
    .select("id, title, user_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.user_id !== userData.user.id) {
    return { ok: false, message: "Listing not found." };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Service unavailable." };

  // Update the complaint with the owner's response
  const { error } = await admin
    .from("defamation_complaints")
    .update({
      owner_response_text: response,
      owner_responded_at: new Date().toISOString(),
    })
    .eq("anonymised_id", complaintId)
    .eq("listing_id", listingId);

  if (error) {
    console.error("[respond] update failed:", error.message);
    return { ok: false, message: "Couldn't save your response. Try again." };
  }

  // Email admin queue
  const body = `Listing owner has responded to complaint ${complaintId}.

Listing: ${listing.title}
Listing id: ${listing.id}
Owner: ${userData.user.email}

Owner's response:
---
${response}
---

Admin queue: ${BASE_URL}/dashboard/admin/flags`;

  void sendThrottledEmail({
    to: NOTIFICATION_TO,
    subject: `[RESPONSE] ${complaintId} — ${listing.title}`,
    text: body,
    html: `<pre style="font-family: monospace; white-space: pre-wrap;">${body.replace(/</g, "&lt;")}</pre>`,
    replyTo: userData.user.email ?? undefined,
  });

  revalidatePath(`/dashboard/listings/${listingId}/respond-to-complaint`);
  return {
    ok: true,
    message:
      "Your response is in the admin queue. We'll reach a decision and contact both parties.",
  };
}
