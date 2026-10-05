// lib/digital-services/approval-review-load.ts
// Loads one pilot draft's review (owner-only tables, service role, server
// only) and reports unavailable / read-error / not-found states distinctly,
// so the review screen never shows an empty page as if nothing were wrong.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildApprovalReview, type ApprovalReview, type PilotEvidence, type ReviewCompany, type ReviewDraft } from "./approval-review";
import type { PilotApproval, PilotEvent } from "./dispatch-guard";
import { PILOT_APPROVALS_TABLE, PILOT_DRAFTS_TABLE, PILOT_EVENTS_TABLE, PILOT_TABLE, outreachSender } from "./pilot";

export const PILOT_EVIDENCE_TABLE = "digital_services_pilot_evidence";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LoadedReview = ApprovalReview | { state: "unavailable" } | { state: "error"; what: string };

export async function loadApprovalReview(admin: SupabaseClient | null, draftId: string, ownerUserId: string, now: Date): Promise<LoadedReview> {
  if (!UUID.test(draftId)) return { state: "not_found" };
  if (!admin) return { state: "unavailable" };
  const d = await admin
    .from(PILOT_DRAFTS_TABLE)
    .select("id, company_id, revision, subject, body, sha256, evidence_revision, offer, preview_token, author, change_reason, created_at")
    .eq("id", draftId)
    .maybeSingle();
  if (d.error) return { state: "error", what: "drafts" };
  if (!d.data) return { state: "not_found" };
  const companyId = (d.data as ReviewDraft).company_id;
  const [c, all, a, ev, e] = await Promise.all([
    admin.from(PILOT_TABLE).select("*").eq("id", companyId).maybeSingle(),
    admin
      .from(PILOT_DRAFTS_TABLE)
      .select("id, company_id, revision, subject, body, sha256, evidence_revision, offer, preview_token, author, change_reason, created_at")
      .eq("company_id", companyId),
    admin.from(PILOT_APPROVALS_TABLE).select("draft_id, draft_sha256, kind, actor, approved_at, approver_user_id, draft_revision, evidence_revision"),
    admin.from(PILOT_EVIDENCE_TABLE).select("id, company_id, source_url, source_type, checked_at, fact_text, limitations, recorded_by").eq("company_id", companyId),
    admin.from(PILOT_EVENTS_TABLE).select("company_id, kind, rfc822_message_id").eq("company_id", companyId),
  ]);
  // Every read must succeed: a missing approval or evidence list would look
  // like "nothing recorded" and mislead the review.
  const failed = [
    ["company", c.error],
    ["drafts", all.error],
    ["approvals", a.error],
    ["evidence", ev.error],
    ["events", e.error],
  ].find(([, err]) => err);
  if (failed) return { state: "error", what: failed[0] as string };
  const drafts = (all.data ?? []) as ReviewDraft[];
  const ids = new Set(drafts.map((x) => x.id));
  return buildApprovalReview({
    draftId,
    company: (c.data ?? null) as ReviewCompany | null,
    drafts,
    approvals: ((a.data ?? []) as PilotApproval[]).filter((x) => ids.has(x.draft_id)),
    evidence: (ev.data ?? []) as PilotEvidence[],
    events: (e.data ?? []) as PilotEvent[],
    sender: outreachSender(),
    ownerUserId,
    now,
  });
}
