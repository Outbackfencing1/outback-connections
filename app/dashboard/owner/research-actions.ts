"use server";

// Owner-only research work units (draft migration
// digital_services_research_staging.sql). Each action re-checks the owner and
// writes only through the database functions; the service role can only read
// the tables directly. Nothing here invokes a researcher or a model: Start
// marks the assignment file as handed over, and a return arrives only when the
// owner pastes or uploads it. Staging never imports a company or makes a row
// sendable; accepting links a proposed row to an existing pilot company.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOwnerAccess } from "@/lib/digital-services/owner";
import {
  RESEARCH_ASSIGNMENTS_TABLE,
  RESEARCH_CANDIDATES_TABLE,
  checkAssignmentFiles,
  priorFromStaged,
  reviewReturnForStaging,
  type AssignmentFiles,
  type ResearchOutcome,
} from "@/lib/digital-services/research-staging";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILE = 2_000_000;

async function ownerOnly(): Promise<string> {
  const access = await getOwnerAccess();
  if (!access.ok) redirect("/dashboard/owner"); // the page applies the gate (sign-in or 404)
  return access.userId;
}
function done(outcome: ResearchOutcome, extra: Record<string, string> = {}): never {
  if (["created", "done", "staged", "contract_failed"].includes(outcome)) revalidatePath("/dashboard/owner");
  const params = new URLSearchParams({ research: outcome, ...extra });
  redirect(`/dashboard/owner?${params.toString()}#research`);
}
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
/** A pasted text, or an uploaded file's text when a file was chosen. */
async function textOf(form: FormData, name: string): Promise<string> {
  const file = form.get(`${name}_file`);
  if (file && typeof file !== "string" && file.size > 0) return file.size > MAX_FILE ? "" : await file.text();
  const v = form.get(name);
  return typeof v === "string" && v.length <= MAX_FILE ? v : "";
}
const reasonOf = (errors: string[]) => ({ reason: errors.slice(0, 3).join("; ").slice(0, 300) });

export async function createResearchAssignment(form: FormData): Promise<void> {
  const userId = await ownerOnly();
  const files = {
    request_text: await textOf(form, "request"),
    schema_text: await textOf(form, "schema"),
    exclusions_text: await textOf(form, "exclusions"),
    niche: str(form.get("niche")),
    cohort_limit: Number(str(form.get("cohort_limit"))),
  };
  const country = str(form.get("country")).toUpperCase() || "AU";
  if (!/^[A-Z]{2}$/.test(country)) done("invalid");
  const checked = checkAssignmentFiles(files);
  if (!checked.ok) done("invalid", reasonOf(checked.errors));
  const admin = createAdminClient();
  if (!admin) done("unavailable");
  const { data, error } = await admin.rpc("research_assignment_create", {
    p_request_id: checked.request_id,
    p_niche: files.niche,
    p_country: country,
    p_cohort_limit: files.cohort_limit,
    p_request_text: files.request_text,
    p_schema_text: files.schema_text,
    p_exclusions_text: files.exclusions_text,
    p_by: `owner:${userId}`,
  });
  if (error) done(error.code === "OC409" ? "not_allowed" : "error", error.code === "OC409" ? { reason: "that request ID was issued with other files" } : {});
  const row = (Array.isArray(data) ? data[0] : null) as { outcome?: string } | null;
  done(row?.outcome === "created" ? "created" : row?.outcome === "already_exists" ? "already_exists" : "error");
}

export async function controlResearchAssignment(form: FormData): Promise<void> {
  const userId = await ownerOnly();
  const id = str(form.get("assignment_id"));
  const action = str(form.get("action"));
  if (!UUID.test(id) || !["start", "pause", "resume", "close"].includes(action)) done("invalid");
  const admin = createAdminClient();
  if (!admin) done("unavailable");
  const { data, error } = await admin.rpc("research_assignment_control", { p_id: id, p_action: action, p_by: `owner:${userId}` });
  if (error) done("error");
  done(data === "done" ? "done" : "not_allowed");
}

/** The owner's own note of how far the hand-off has got (nothing reports it automatically). */
export async function checkpointResearch(form: FormData): Promise<void> {
  const userId = await ownerOnly();
  const id = str(form.get("assignment_id"));
  const inspected = Number(str(form.get("inspected")));
  const note = str(form.get("note")).slice(0, 500);
  if (!UUID.test(id) || !Number.isInteger(inspected) || inspected < 0 || inspected > 1000) done("invalid");
  const admin = createAdminClient();
  if (!admin) done("unavailable");
  const { data, error } = await admin.rpc("research_checkpoint", { p_id: id, p_progress: { inspected }, p_note: note || null, p_by: `owner:${userId}` });
  if (error) done("error");
  done(data === "done" ? "done" : "not_allowed");
}

/**
 * Stage a researcher's return. It is reviewed against the assignment's issued
 * files and every current row staged for other requests (a business already
 * researched is held or excluded, never proposed twice), then the database
 * stores the raw text as a new immutable version. A return that fails its
 * contract is kept with its reasons and stages no candidate.
 */
export async function stageResearchReturn(form: FormData): Promise<void> {
  const userId = await ownerOnly();
  const id = str(form.get("assignment_id"));
  const raw = await textOf(form, "return");
  if (!UUID.test(id) || !raw.trim()) done("invalid");
  const admin = createAdminClient();
  if (!admin) done("unavailable");
  const a = await admin
    .from(RESEARCH_ASSIGNMENTS_TABLE)
    .select("id, request_id, niche, country, cohort_limit, request_text, schema_text, exclusions_text, request_sha256, schema_sha256, exclusions_sha256, state")
    .eq("id", id)
    .maybeSingle();
  if (a.error) done("error");
  if (!a.data) done("invalid");
  const assignment = a.data as AssignmentFiles;
  if (assignment.state === "draft" || assignment.state === "closed") done("not_allowed", { reason: assignment.state === "draft" ? "start the assignment first" : "this assignment is closed" });
  const others = await admin
    .from(RESEARCH_CANDIDATES_TABLE)
    .select("request_id, candidate_key, business, locality, domain, outcome")
    .neq("request_id", assignment.request_id)
    .is("superseded_by_version", null)
    .limit(5000);
  if (others.error) done("error");
  let report;
  try {
    report = reviewReturnForStaging(raw, assignment, priorFromStaged(others.data ?? []), new Date().toISOString());
  } catch {
    done("error"); // the issued files no longer load: nothing is staged
  }
  const { data, error } = await admin.rpc("research_stage_return", { p_id: id, p_raw_text: raw, p_report: report, p_by: `owner:${userId}` });
  if (error) done("error");
  const row = (Array.isArray(data) ? data[0] : null) as { outcome?: string; version?: number } | null;
  const outcome = row?.outcome;
  if (outcome === "contract_failed") done("contract_failed", reasonOf(report.contract_errors));
  done(outcome === "staged" ? "staged" : outcome === "already_staged" ? "already_staged" : "error", row?.version ? { v: String(row.version) } : {});
}

export async function decideResearchCandidate(form: FormData): Promise<void> {
  const userId = await ownerOnly();
  const id = str(form.get("candidate_id"));
  const decision = str(form.get("decision"));
  const company = str(form.get("pilot_company_id")).toUpperCase();
  const note = str(form.get("note")).slice(0, 1000);
  if (!UUID.test(id) || !["hold", "reject", "accept"].includes(decision)) done("invalid");
  if (decision === "accept" ? !/^OC-\d{3}$/.test(company) : company) done(decision === "accept" ? "no_such_company" : "invalid");
  const admin = createAdminClient();
  if (!admin) done("unavailable");
  const { data, error } = await admin.rpc("research_decide", {
    p_candidate: id,
    p_decision: decision,
    p_pilot_company: decision === "accept" ? company : null,
    p_note: note || null,
    p_by: `owner:${userId}`,
  });
  if (error) done("error");
  done((["done", "superseded", "not_allowed", "no_such_company"].includes(data as string) ? data : data === "not_found" ? "invalid" : "error") as ResearchOutcome);
}
