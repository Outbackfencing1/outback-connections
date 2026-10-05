"use server";

// Owner-only preparation queue controls. Each action re-checks the owner and
// works through the database functions (draft migration
// digital_services_prep_queue.sql); the service role can only enqueue and read
// directly. No action runs a job: there is no automatic worker.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOwnerAccess } from "@/lib/digital-services/owner";
import { PILOT_DRAFTS_TABLE, PILOT_TABLE } from "@/lib/digital-services/pilot";
import { PILOT_EVIDENCE_TABLE } from "@/lib/digital-services/approval-review-load";
import {
  PREP_HANDOFF_LEASE_SECONDS,
  PREP_HANDOFF_WORKER,
  PREP_JOBS_TABLE,
  PREP_KINDS,
  buildPacket,
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
  // The packet is built only from what the database holds now.
  const [c, ev, d] = await Promise.all([
    admin.from(PILOT_TABLE).select("id, evidence_revision, uncertainties").eq("id", company).maybeSingle(),
    admin.from(PILOT_EVIDENCE_TABLE).select("source_url, source_type, checked_at").eq("company_id", company),
    draftId ? admin.from(PILOT_DRAFTS_TABLE).select("id, company_id, revision, sha256").eq("id", draftId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (c.error || ev.error || d.error) done("error");
  if (!c.data) done("invalid");
  const draft = d.data as { id: string; company_id: string; revision: number; sha256: string } | null;
  if (draftId && (!draft || draft.company_id !== company)) done("invalid");
  const packet = buildPacket({
    kind,
    company: { id: company, evidence_revision: (c.data as { evidence_revision: number }).evidence_revision, uncertainties: (c.data as { uncertainties: string[] | null }).uncertainties ?? [] },
    evidence: (ev.data ?? []) as { source_url: string; source_type: string; checked_at: string }[],
    draft: draft ? { id: draft.id, revision: draft.revision, sha256: draft.sha256 } : null,
  });
  if ("error" in packet) done("invalid", { reason: packet.error });
  const { error } = await admin
    .from(PREP_JOBS_TABLE)
    .insert({ company_id: company, kind, draft_id: draft?.id ?? null, packet_text: packet.text, packet_sha256: "computed-by-database", evidence_revision: 0, created_by: `owner:${userId}` })
    .select("id");
  if (error) done(error.code === "23505" ? "already_queued" : "error");
  done("queued");
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
  const text = typeof form.get("result") === "string" ? (form.get("result") as string) : "";
  if (!UUID.test(id) || !text.trim()) done("invalid");
  const admin = createAdminClient();
  if (!admin) done("unavailable");
  const { data: job, error } = await admin.from(PREP_JOBS_TABLE).select("id, kind, packet_sha256, created_at").eq("id", id).maybeSingle();
  if (error) done("error");
  if (!job) done("invalid");
  const checked = validateResult(text, job as { id: string; kind: PrepKind; packet_sha256: string; created_at: string }, new Date());
  if (!checked.ok) done("rejected", { reason: checked.errors.slice(0, 3).join("; ").slice(0, 300) });
  if (checked.result.status === "blocked") {
    const r = await admin.rpc("prep_fail", { p_job: id, p_worker: PREP_HANDOFF_WORKER, p_error: `blocked: ${checked.result.summary}`.slice(0, 500) });
    if (r.error) done("error");
    done(r.data === "retrying" ? "retrying" : r.data === "failed" ? "failed" : "lost_lease");
  }
  const r = await admin.rpc("prep_complete", { p_job: id, p_worker: PREP_HANDOFF_WORKER, p_result_text: text });
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
