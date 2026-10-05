// lib/digital-services/dispatch-guard.ts
// The server-side check any future first-contact dispatch must pass. There is
// no sending code in this app yet; this is the gate it will call, and the
// owner dashboard shows its verdict for every pilot company. The same rules
// are enforced again in the database (digital_services_pilot draft
// migration), which also makes "one first contact per company" race-proof.
import { createHash } from "node:crypto";

export type Lane = "cowork" | "engine";
export const APPROVAL_KINDS = ["evidence_refresh", "preview_review", "copy_review", "message_approval"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
export const STOP_EVENTS = ["opted_out", "suppressed", "bounced"] as const;

export type PilotCompany = {
  id: string;
  lane: "email" | "walk-in" | "phone";
  reserved_for: Lane | null;
  contact_address: string | null;
  contact_basis_confirmed_at: string | null;
};
export type PilotDraft = { id: string; company_id: string; revision: number; subject: string; body: string; sha256: string };
export type PilotApproval = { draft_id: string; draft_sha256: string; kind: ApprovalKind; actor: string; approved_at: string };
export type PilotEvent = { company_id: string; kind: "contacted" | "replied" | "opted_out" | "suppressed" | "bounced" };

export type Hold =
  | "not_email_lane"
  | "reserved_for_other_lane"
  | "suppressed"
  | "already_contacted"
  | "replied"
  | "no_contact_address"
  | "no_contact_basis"
  | "no_draft"
  | "not_latest_revision"
  | "draft_hash_mismatch"
  | `missing_${ApprovalKind}`
  | "no_verified_sender";

/** The hash approvals are bound to: subject, blank line, body (UTF-8). */
export function draftHash(subject: string, body: string): string {
  return createHash("sha256").update(`${subject}\n\n${body}`, "utf8").digest("hex");
}

export function firstContactHolds(input: {
  lane: Lane;
  company: PilotCompany;
  drafts: PilotDraft[]; // all revisions for this company
  draftId: string | null; // the revision proposed for sending
  approvals: PilotApproval[];
  events: PilotEvent[];
  sender: { address: string; verified: boolean } | null;
}): Hold[] {
  const { lane, company, drafts, approvals, events, sender } = input;
  const holds: Hold[] = [];
  const mine = events.filter((e) => e.company_id === company.id);
  if (company.lane !== "email") holds.push("not_email_lane");
  if (company.reserved_for && company.reserved_for !== lane) holds.push("reserved_for_other_lane");
  if (mine.some((e) => (STOP_EVENTS as readonly string[]).includes(e.kind))) holds.push("suppressed");
  if (mine.some((e) => e.kind === "contacted")) holds.push("already_contacted");
  if (mine.some((e) => e.kind === "replied")) holds.push("replied");
  if (!company.contact_address) holds.push("no_contact_address");
  if (!company.contact_basis_confirmed_at) holds.push("no_contact_basis");

  const ours = drafts.filter((d) => d.company_id === company.id);
  const draft = ours.find((d) => d.id === input.draftId);
  if (!draft) {
    holds.push("no_draft");
  } else {
    if (draft.revision !== Math.max(...ours.map((d) => d.revision))) holds.push("not_latest_revision");
    if (draftHash(draft.subject, draft.body) !== draft.sha256) holds.push("draft_hash_mismatch");
    for (const kind of APPROVAL_KINDS) {
      if (!approvals.some((a) => a.draft_id === draft.id && a.draft_sha256 === draft.sha256 && a.kind === kind && a.actor.trim())) {
        holds.push(`missing_${kind}`);
      }
    }
  }
  // help@ is the marketplace support/transactional identity, never outreach.
  if (!sender || !sender.verified || /^help@/i.test(sender.address)) holds.push("no_verified_sender");
  return holds;
}

export const HOLD_LABELS: Record<string, string> = {
  not_email_lane: "not an email-lane company",
  reserved_for_other_lane: "reserved for another lane",
  suppressed: "suppressed or opted out",
  already_contacted: "already contacted",
  replied: "has replied (a person handles it)",
  no_contact_address: "no contact address",
  no_contact_basis: "contact basis not confirmed",
  no_draft: "no draft",
  not_latest_revision: "not the latest draft revision",
  draft_hash_mismatch: "draft changed after hashing",
  missing_evidence_refresh: "evidence refresh not signed off",
  missing_preview_review: "preview review missing",
  missing_copy_review: "copy review missing",
  missing_message_approval: "Josh's message approval missing",
  no_verified_sender: "no verified Outback Connections sender",
};
