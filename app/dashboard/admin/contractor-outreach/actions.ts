"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { buildClaimInviteEmail } from "@/lib/claim-invite-email";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";
const INVITE_COOLDOWN_DAYS = 14;

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
    .select("is_admin, is_staff")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!(profile?.is_admin || profile?.is_staff)) return { ok: false, message: "Staff and admins only." };

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
    .select("is_admin, is_staff")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!(profile?.is_admin || profile?.is_staff)) return { ok: false, message: "Staff and admins only." };

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

// ------------------------------------------------------------
// One-click claim invite. Reads the private email through the admin-only
// view, sends via Resend from the Connections address, then logs it through
// record_contractor_outreach (action=emailed, status=invite_sent). At most
// one invite email per business per INVITE_COOLDOWN_DAYS.
// ------------------------------------------------------------
export async function sendClaimInvite(businessId: string): Promise<RecordOutreachResult> {
  const parsed = z.string().uuid().safeParse(businessId);
  if (!parsed.success) return { ok: false, message: "Bad business id." };
  const id = parsed.data;

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sign in again." };
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, is_staff")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!(profile?.is_admin || profile?.is_staff)) return { ok: false, message: "Staff and admins only." };

  const { data: row, error: rowError } = await supabase
    .from("admin_contractor_outreach")
    .select("business_id, business_name, contact_email, claim_status, outreach_status")
    .eq("business_id", id)
    .maybeSingle();
  if (rowError) return { ok: false, message: `Couldn't load the business: ${rowError.message}` };
  if (!row) return { ok: false, message: "That business isn't in the outreach workspace." };
  if (!row.contact_email) return { ok: false, message: "No email on file for this business." };
  if (row.claim_status !== "unclaimed") return { ok: false, message: "Already claimed." };
  if (["do_not_contact", "invalid_duplicate", "joined", "not_interested"].includes(row.outreach_status ?? "")) {
    return { ok: false, message: "Contact actions are disabled for this status." };
  }

  const since = new Date(Date.now() - INVITE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("business_outreach_events")
    .select("id")
    .eq("business_id", id)
    .eq("action", "emailed")
    .ilike("note", "Claim invite emailed%")
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) {
    return { ok: false, message: `An invite email already went out in the last ${INVITE_COOLDOWN_DAYS} days.` };
  }

  const claimUrl = `${BASE_URL}/claim/${id}?utm_source=email&utm_medium=claim_invite&utm_campaign=contractor_outreach`;
  const reference = `INV-${id.slice(0, 8).toUpperCase()}`;
  const email = buildClaimInviteEmail({ businessName: row.business_name, claimUrl, reference });

  const sent = await sendEmail({
    to: row.contact_email,
    subject: email.subject,
    text: email.text,
    html: email.html,
    replyTo: "help@outbackconnections.com.au",
  });
  if (!sent.ok) {
    if (sent.logged) return { ok: false, message: "Email isn't configured on this environment (no RESEND_API_KEY)." };
    return { ok: false, message: `Email failed: ${sent.error}` };
  }

  const { error } = await supabase.rpc("record_contractor_outreach", {
    p_business_id: id,
    p_action: "emailed",
    p_status: "invite_sent",
    p_contact_method: "email",
    p_note: `Claim invite emailed to ${row.contact_email} (ref ${reference})`,
    p_next_follow_up_at: null,
    p_assigned_to: null,
  });
  if (error) {
    console.error("[contractor-outreach] invite sent but log failed:", error.message);
    return { ok: false, message: `Sent, but couldn't log it: ${error.message}` };
  }

  revalidatePath("/dashboard/admin/contractor-outreach");
  return { ok: true, message: `Invite emailed to ${row.contact_email}.` };
}
