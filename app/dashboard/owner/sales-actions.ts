"use server";

// Owner-only sales controls: draft quotes, quote status, payment evidence,
// delivery stage and the conversation log. Each action re-checks the owner
// (never trusting the page that rendered it), validates input, writes with
// the service role and reports the database's answer back on the page.
// There is deliberately no action that marks anything paid: payment exists
// only as evidence rows.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOwnerAccess } from "@/lib/digital-services/owner";
import { queueViewParams } from "@/lib/digital-services/queue";
import {
  CONVERSATIONS_TABLE,
  PAYMENTS_TABLE,
  QUOTES_TABLE,
  QUOTE_TRANSITIONS,
  parseConversation,
  parseDraftQuote,
  parsePayment,
  parseQuoteStatus,
  parseStage,
  runSalesWrite,
  type SalesOutcome,
  type WriteResult,
} from "@/lib/digital-services/sales";
import { createAdminClient } from "@/lib/supabase/admin";

async function ownerOnly(): Promise<string> {
  const access = await getOwnerAccess();
  if (!access.ok) redirect("/dashboard/owner"); // the page applies the gate (sign-in or 404)
  return access.userId;
}

function done(form: FormData, outcome: SalesOutcome): never {
  if (outcome === "saved") revalidatePath("/dashboard/owner");
  const params = queueViewParams(form.get("view"));
  params.set("sales", outcome);
  redirect(`/dashboard/owner?${params.toString()}#sales`);
}

const sydneyToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
const recorder = (userId: string) => `owner:${userId}`;

export async function createDraftQuote(form: FormData): Promise<void> {
  await ownerOnly();
  const quote = parseDraftQuote(form);
  if (!quote) done(form, "invalid");
  const admin = createAdminClient();
  // Not retried: a lost response could otherwise create two drafts.
  const outcome = await runSalesWrite(
    admin ? async () => (await admin.from(QUOTES_TABLE).insert({ ...quote, status: "draft" }).select("id")) as WriteResult : null,
    { retry: false }
  );
  done(form, outcome);
}

export async function setQuoteStatus(form: FormData): Promise<void> {
  await ownerOnly();
  const change = parseQuoteStatus(form);
  if (!change) done(form, "invalid");
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const patch: Record<string, string> = { status: change.to };
  if (change.to === "sent") patch.sent_at = now;
  if (change.to === "accepted") patch.accepted_at = now;
  // Only from the statuses that lead here, so a stale page can't skip a step.
  // Not retried: after a lost response the retry would read back as "stale".
  const outcome = await runSalesWrite(
    admin
      ? async () =>
          (await admin.from(QUOTES_TABLE).update(patch).eq("id", change.id).in("status", QUOTE_TRANSITIONS[change.to]).select("id")) as WriteResult
      : null,
    { retry: false }
  );
  done(form, outcome);
}

export async function setDeliveryStage(form: FormData): Promise<void> {
  await ownerOnly();
  const change = parseStage(form);
  if (!change) done(form, "invalid");
  const admin = createAdminClient();
  // Setting a stage is idempotent; the database gates production and launch on evidenced payment.
  const outcome = await runSalesWrite(
    admin
      ? async () => (await admin.from(QUOTES_TABLE).update({ delivery_stage: change.stage }).eq("id", change.id).select("id")) as WriteResult
      : null,
    { retry: true }
  );
  done(form, outcome);
}

export async function recordPaymentEvidence(form: FormData): Promise<void> {
  const userId = await ownerOnly();
  const payment = parsePayment(form, sydneyToday());
  if (!payment) done(form, "invalid");
  const admin = createAdminClient();
  // Evidence is unique, so a retry can't double-count.
  const outcome = await runSalesWrite(
    admin
      ? async () => (await admin.from(PAYMENTS_TABLE).insert({ ...payment, recorded_by: recorder(userId) }).select("id")) as WriteResult
      : null,
    { retry: true }
  );
  done(form, outcome);
}

export async function addConversation(form: FormData): Promise<void> {
  const userId = await ownerOnly();
  const entry = parseConversation(form);
  if (!entry) done(form, "invalid");
  const admin = createAdminClient();
  const { occurred_at, ...rest } = entry;
  const outcome = await runSalesWrite(
    admin
      ? async () =>
          (await admin
            .from(CONVERSATIONS_TABLE)
            .insert({ ...rest, ...(occurred_at ? { occurred_at } : {}), recorded_by: recorder(userId) })
            .select("id")) as WriteResult
      : null,
    { retry: false }
  );
  done(form, outcome);
}
