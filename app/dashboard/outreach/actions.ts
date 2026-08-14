"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const OutcomeSchema = z.enum([
  "called",
  "emailed",
  "replied",
  "interested",
  "invite_sent",
  "not_now",
  "sequence_complete",
  "not_interested",
  "do_not_contact",
  "email_bounced",
  "invalid_phone",
  "invalid_duplicate",
  "note",
  "assigned",
  "unassigned",
]);

const ContactMethodSchema = z.enum([
  "phone",
  "email",
  "other",
]);

const PrivateDisplayNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your name.")
  .max(80, "Keep your name under 80 characters.");

const InputSchema = z
  .object({
    businessId: z.string().uuid(),
    clientActionId: z.string().uuid(),
    outcome: OutcomeSchema,
    contactMethod: ContactMethodSchema.nullable().optional(),
    note: z.string().trim().max(5000).nullable().optional(),
    nextFollowUpAt: z.string().datetime({ offset: true }).nullable().optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
    clearFollowUp: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.outcome === "not_now" &&
      !value.nextFollowUpAt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nextFollowUpAt"],
        message: "Choose a future follow-up time.",
      });
    }
    if (value.outcome === "note" && !value.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "Add a note before saving.",
      });
    }
    if (value.outcome === "assigned" && !value.assignedUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignedUserId"],
        message: "Choose a team member.",
      });
    }
    if (value.outcome === "unassigned" && value.assignedUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignedUserId"],
        message: "Unassigning cannot include a team member.",
      });
    }
  });

export type OutreachOutcome = z.infer<typeof OutcomeSchema>;
export type RecordOutcomeInput = z.input<typeof InputSchema>;

export type RecordOutcomeState = {
  business_id: string;
  outreach_status: string;
  assigned_user_id: string | null;
  assigned_name: string | null;
  last_contact_method: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  latest_note: string | null;
  suppressed_channels: string[];
  is_suppressed: boolean;
  updated_at: string;
  event_id: string;
  idempotent_replay: boolean;
};

export type RecordOutcomeResult =
  | { ok: true; message: string; state: RecordOutcomeState }
  | { ok: false; message: string };

export type OutreachHistoryRow = {
  id: string;
  actor_user_id: string | null;
  actor_name: string;
  action: string;
  outcome: string | null;
  contact_method: string | null;
  outreach_status: string | null;
  note: string | null;
  next_follow_up_at: string | null;
  assigned_user_id: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  created_at: string;
};

export type OutreachHistoryCursor = {
  createdAt: string;
  id: string;
};

const HISTORY_PAGE_SIZE = 50;
const HistoryCursorSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .nullable();

export async function setOwnAdminOutreachIdentity(
  displayNameInput: string
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const parsed = PrivateDisplayNameSchema.safeParse(displayNameInput);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || "Check your name.",
    };
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sign in again." };

  const { error } = await supabase.rpc("set_own_admin_outreach_identity", {
    p_display_name: parsed.data,
  });
  if (error) {
    console.error("[outreach] private admin identity setup failed:", error.message);
    return { ok: false, message: "Couldn’t save your outreach name. Please try again." };
  }

  revalidatePath("/dashboard/outreach");
  revalidatePath("/dashboard/admin/team-access");
  return { ok: true, message: "Your private outreach name is ready." };
}

export async function recordOutreachOutcome(
  input: RecordOutcomeInput
): Promise<RecordOutcomeResult> {
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

  const { data: canOutreach, error: permissionError } = await supabase.rpc(
    "current_user_can_outreach"
  );
  if (permissionError || !canOutreach) {
    return { ok: false, message: "You do not have outreach access." };
  }

  const value = parsed.data;
  const { data, error } = await supabase.rpc(
    "record_contractor_outreach_outcome",
    {
      p_business_id: value.businessId,
      p_client_action_id: value.clientActionId,
      p_outcome: value.outcome,
      p_contact_method: value.contactMethod ?? null,
      p_note: value.note || null,
      p_next_follow_up_at: value.nextFollowUpAt ?? null,
      p_assigned_user_id: value.assignedUserId ?? null,
      p_clear_follow_up: value.clearFollowUp ?? false,
    }
  );

  if (error) {
    console.error("[outreach] outcome failed:", error.message);
    return { ok: false, message: friendlyRpcError(error.message) };
  }

  revalidatePath("/dashboard/outreach");
  return {
    ok: true,
    message: outcomeMessage(value.outcome),
    state: data as RecordOutcomeState,
  };
}

export async function getOutreachHistory(
  businessId: string,
  cursor: OutreachHistoryCursor | null = null
): Promise<
  | { ok: true; rows: OutreachHistoryRow[]; nextCursor: OutreachHistoryCursor | null }
  | { ok: false; message: string }
> {
  const parsed = z.string().uuid().safeParse(businessId);
  if (!parsed.success) return { ok: false, message: "Bad business id." };
  const parsedCursor = HistoryCursorSchema.safeParse(cursor);
  if (!parsedCursor.success) return { ok: false, message: "Bad history page." };

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sign in again." };

  const { data: canOutreach, error: permissionError } = await supabase.rpc(
    "current_user_can_outreach"
  );
  if (permissionError || !canOutreach) {
    return { ok: false, message: "You do not have outreach access." };
  }

  let historyQuery = supabase
    .from("business_outreach_events")
    .select(
      "id, actor_user_id, actor_name, action, outcome, contact_method, outreach_status, note, next_follow_up_at, assigned_user_id, assigned_to, created_at"
    )
    .eq("business_id", parsed.data)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_PAGE_SIZE + 1);
  if (parsedCursor.data) {
    const { createdAt, id } = parsedCursor.data;
    historyQuery = historyQuery.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`
    );
  }
  const { data, error } = await historyQuery;
  if (error) {
    console.error("Couldn't load outreach history", error);
    return { ok: false, message: "Couldn't load outreach history. Please try again." };
  }

  const fetchedRows = (data ?? []) as Array<
    Omit<OutreachHistoryRow, "actor_name" | "assigned_name"> & {
      actor_name: string | null;
    }
  >;
  const hasMore = fetchedRows.length > HISTORY_PAGE_SIZE;
  const rows = fetchedRows.slice(0, HISTORY_PAGE_SIZE);

  return {
    ok: true,
    rows: rows.map((row) => ({
      ...row,
      actor_name:
        row.actor_user_id === userData.user.id && row.actor_name
          ? "You"
          : row.actor_name?.trim() || (row.actor_user_id ? "Team member" : "System"),
      assigned_name:
        row.assigned_user_id === userData.user.id
          ? "You"
          : row.assigned_to || (row.assigned_user_id ? "Team member" : null),
    })),
    nextCursor:
      hasMore && rows.length > 0
        ? {
            createdAt: rows[rows.length - 1].created_at,
            id: rows[rows.length - 1].id,
          }
        : null,
  };
}

function outcomeMessage(outcome: OutreachOutcome): string {
  const messages: Partial<Record<OutreachOutcome, string>> = {
    assigned: "Record assigned to you.",
    unassigned: "Record returned to the unassigned queue.",
    called: "Call recorded.",
    emailed: "Email recorded as sent.",
    invite_sent: "Invitation email recorded as sent.",
    replied: "Reply recorded.",
    interested: "Interest recorded.",
    not_now: "Follow-up scheduled.",
    sequence_complete: "Final email recorded and the sequence was closed.",
    not_interested: "Marked not interested.",
    do_not_contact: "Contact suppressed.",
    email_bounced: "Email address suppressed after bounce.",
    invalid_phone: "Phone channels suppressed.",
    invalid_duplicate: "Record closed as invalid or duplicate.",
    note: "Note saved.",
  };
  return messages[outcome] || "Outreach outcome saved.";
}

function friendlyRpcError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("suppressed") || lower.includes("do not contact")) {
    return "This contact channel is suppressed. No outreach was recorded.";
  }
  if (lower.includes("follow-up") || lower.includes("follow up")) {
    return "Choose a future follow-up time.";
  }
  if (lower.includes("not authorised") || lower.includes("not authorized")) {
    return "You do not have outreach access.";
  }
  if (lower.includes("joined")) {
    return "This contractor is already marked as joined. Refresh the queue.";
  }
  if (lower.includes("invalid") || lower.includes("duplicate")) {
    return "This record is no longer available for that outcome. Refresh the queue.";
  }
  return "Couldn't save this outcome. Please refresh and try again.";
}
