"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const Input = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "forwarded", "closed", "spam"]),
  via: z.enum(["phone", "sms", "email", "whatsapp", "other"]).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export type EnquiryUpdateResult = { ok: true; message: string } | { ok: false; message: string };

export async function updateEnquiry(input: z.input<typeof Input>): Promise<EnquiryUpdateResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Bad input." };

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sign in again." };
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) return { ok: false, message: "Admins only." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Not configured." };

  const { status, via, note } = parsed.data;
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "forwarded") {
    patch.forwarded_at = new Date().toISOString();
    patch.forwarded_via = via ?? "other";
  }
  if (note) patch.notes = note;

  const { error } = await admin.from("listing_enquiries").update(patch).eq("id", parsed.data.id);
  if (error) return { ok: false, message: `Couldn't update: ${error.message}` };

  revalidatePath("/dashboard/admin/enquiries");
  return {
    ok: true,
    message:
      status === "forwarded" ? "Marked forwarded." : status === "closed" ? "Closed." : status === "spam" ? "Marked spam." : "Reopened.",
  };
}
