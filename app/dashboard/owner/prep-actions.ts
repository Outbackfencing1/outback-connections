"use server";

// Owner-only preparation queue controls. Each action re-checks the owner and
// works through the database functions (draft migration
// digital_services_prep_queue.sql); the service role can only enqueue and read
// directly. No action runs a job: there is no automatic worker. A hand-off's
// lease token is the only key to finish it: the import form carries the token
// it was rendered with, so a result from an earlier, expired hand-off of the
// same job can't land under a later one.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOwnerAccess } from "@/lib/digital-services/owner";
import {
  PREP_HANDOFF_LEASE_SECONDS,
  PREP_HANDOFF_WORKER,
  PREP_JOBS_TABLE,
  PREP_KINDS,
  ENQUEUE_REFUSALS,
  validateResult,
  type PrepKind,
  type PrepOutcome,
} from "@/lib/digital-services/prep-queue";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownerOnly(): Promise<string> {
  const access = await getOwnerAccess();
  if (!access.ok) redirect("/dashboard/owner"); // the page applies the gate (sign-in or 404)
  return access.userId;
}
function done(outcome: PrepOutcome, extra: Record<string, string> = {}): never {
  if (!["invalid", "error", "unavailable", "rejected", "not_ready", "not_allowed", "conflict", "lost_lease"].includes(outcome)) revalidatePath("/dashboard/owner");
  const params = new URLSearchParams({ prep: outcome, ...extra });
  redirect(`/dashboard/owner?${params.toString()}#prep`);
}
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export async function enqueuePrepJob(form: FormData): Promise<void> {
  const userId = await ownerOnly();
  const company = str(form.get("company_id")).toUpperCase();
  const kind = str(form.get("kind")) as PrepKind;
  const draftId = str(form.get("draft_id"));
  if (!/^OC-\d{3}$/.test(company) || !(PREP_KINDS as readonly string[]).includes(kind) || (draftId && !UUID.test(draftId))) done("invalid");
  const admin = createAdminClient();
  if (!admin) done("unavailable");
  // The database builds the packet from one locked snapshot of what it holds,
  // and refuses (rather than invents) a missing fact.
  const { data, error } = await admin.rpc("prep_enqueue", { p_company: company, p_kind: kind, p_draft: draftId || null, p_created_by: `owner:${userId}` });
  if (error) {
    const reason = ENQUEUE_REFUSALS.find((r) => r === error.message);
    done(reason ? "invalid" : "error", reason ? { reason } : {});
  }
  const row = (Array.isArray(data) ? data[0] : null) as { outcome?: string } | null;
  done(row?.outcome === "already_queued" ? "already_queued" : row?.outcome === "queued" ? "queued" : "error");
}

/** Take a job for a person-run hand-off (24-hour lease). */
export async function handOffPrepJob(form: FormData): Promise<void> {
  await ownerOnly();
  const id = str(form.get("job_id"));
  if (!UUID.test(id)) done("invalid");
  const admin = createAdminClient();
  if (!admin) done("unavailable");
  const { data, error } = await admin.rpc("prep_claim", { p_worker: PREP_HANDOFF_WORKER, p_lease_seconds: PREP_HANDOFF_LEASE_SECONDS, p_job: id });
  if (error) done("error");
  done(Array.isArray(data) && data.length === 1 ? "claimed" : "not_ready");
}

/** Import the result file for a handed-off job. */
export async function importPrepResult(form: FormData): Promise<void> {
  await ownerOnly();
  const id = str(form.get("job_id"));
  const token = str(form.get("lease_token"));
  const text = typeof form.get("result") === "string" ? (form.get("result") as string) : "";
  if (!UUID.test(id) || !UUID.test(token) || !text.trim()) done("invalid");
  const admin = createAdminClient();
  if (!admin) done("unavailable");
  const { data: job, error } = await admin.from(PREP_JOBS_TABLE).select("id, kind, packet_sha256, created_at").eq("id", id).maybeSingle();
  if (error) done("error");
  if (!job) done("invalid");
  const checked = validateResult(text, job as { id: string; kind: PrepKind; packet_sha256: string; created_at: string }, new Date());
  if (!checked.ok) done("rejected", { reason: checked.errors.slice(0, 3).join("; ").slice(0, 300) });
  if (checked.result.status === "blocked") {
    const r = await admin.rpc("prep_fail", { p_job: id, p_token: token, p_error: `blocked: ${checked.result.summary}`.slice(0, 500) });
    if (r.error) done("error");
    done(r.data === "retrying" ? "retrying" : r.data === "failed" ? "failed" : "lost_lease");
  }
  const r = await admin.rpc("prep_complete", { p_job: id, p_token: token, p_result_text: text });
  if (r.error) done("error");
  const outcome = r.data as string;
  done((["succeeded", "already", "conflict", "lost_lease", "stale"].includes(outcome) ? outcome : "error") as PrepOutcome);
}

export async function controlPrepJob(form: FormData): Promise<void> {
  const userId = await ownerOnly();
  const id = str(form.get("job_id"));
  const action = str(form.get("action"));
  if (!UUID.test(id) || !["pause", "resume", "retry", "cancel"].includes(action)) done("invalid");
  const admin = createAdminClient();
  if (!admin) done("unavailable");
  const { data, error } = await admin.rpc("prep_control", { p_job: id, p_action: action, p_by: `owner:${userId}` });
  if (error) done("error");
  done(data === "done" ? "done" : "not_allowed");
}

export async function setPrepQueuePaused(form: FormData): Promise<void> {
  const userId = await ownerOnly();
  const paused = str(form.get("paused"));
  if (paused !== "true" && paused !== "false") done("invalid");
  const admin = createAdminClient();
  if (!admin) done("unavailable");
  const { error } = await admin.rpc("prep_set_paused", { p_paused: paused === "true", p_by: `owner:${userId}` });
  if (error) done("error");
  done(paused === "true" ? "paused" : "resumed");
}
