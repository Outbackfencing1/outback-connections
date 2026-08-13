"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const StatusSchema = z.enum([
  "not_contacted",
  "attempted",
  "contacted",
  "interested",
  "invite_sent",
  "follow_up",
  "joined",
  "not_interested",
  "invalid_duplicate",
  "do_not_contact",
]);

const MethodSchema = z.enum(["phone", "email", "sms", "whatsapp", "other"]);
const ActionSchema = z.enum([
  "called",
  "emailed",
  "sms",
  "whatsapp",
  "note",
  "status_changed",
  "follow_up_set",
  "assigned",
  "joined",
]);

const InputSchema = z
  .object({
    businessId: z.string().uuid(),
    action: ActionSchema,
    status: StatusSchema.nullable().optional(),
    contactMethod: MethodSchema.nullable().optional(),
    note: z.string().trim().max(5000).nullable().optional(),
    nextFollowUpAt: z.string().datetime({ offset: true }).nullable().optional(),
    assignedTo: z.string().trim().max(100).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "status_changed" && !value.status) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "Choose a status.",
      });
    }
  });

export type RecordOutreachInput = z.input<typeof InputSchema>;
export type RecordOutreachResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export type OutreachHistoryRow = {
  id: string;
  action: string;
  contact_method: string | null;
  outreach_status: string | null;
  note: string | null;
  next_follow_up_at: string | null;
  assigned_to: string | null;
  created_at: string;
};

export async function recordOutreach(
  input: RecordOutreachInput
): Promise<RecordOutreachResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || "Check the outreach update.",
    };
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sign in again." };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) return { ok: false, message: "Admins only." };

  const value = parsed.data;
  // This must use the signed-in user's client: the RPC checks auth.uid() and
  // current_user_is_admin() itself before its SECURITY DEFINER write.
  const { error } = await supabase.rpc("record_contractor_outreach", {
    p_business_id: value.businessId,
    p_action: value.action,
    p_status: value.status ?? null,
    p_contact_method: value.contactMethod ?? null,
    p_note: value.note || null,
    p_next_follow_up_at: value.nextFollowUpAt ?? null,
    p_assigned_to: value.assignedTo || null,
  });

  if (error) {
    console.error("[contractor-outreach] record failed:", error.message);
    return { ok: false, message: `Couldn't save: ${error.message}` };
  }

  revalidatePath("/dashboard/admin/contractor-outreach");
  return {
    ok: true,
    message:
      ["called", "emailed", "sms", "whatsapp"].includes(value.action)
        ? "Contact recorded."
        : value.action === "status_changed" || value.action === "joined"
          ? "Status updated."
          : "Outreach details saved.",
  };
}

export async function getOutreachHistory(
  businessId: string
): Promise<
  | { ok: true; rows: OutreachHistoryRow[] }
  | { ok: false; message: string }
> {
  const parsed = z.string().uuid().safeParse(businessId);
  if (!parsed.success) return { ok: false, message: "Bad business id." };

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sign in again." };
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) return { ok: false, message: "Admins only." };

  const { data, error } = await supabase
    .from("business_outreach_events")
    .select(
      "id, action, contact_method, outreach_status, note, next_follow_up_at, assigned_to, created_at"
    )
    .eq("business_id", parsed.data)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { ok: false, message: `Couldn't load history: ${error.message}` };
  return { ok: true, rows: (data ?? []) as OutreachHistoryRow[] };
}
