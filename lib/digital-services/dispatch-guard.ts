// lib/digital-services/dispatch-guard.ts
// The server-side check any first-contact dispatch must pass
// (lib/digital-services/outreach/dispatch.ts calls it before sending), and the
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
  contact_basis_confirmed_for: string | null; // the address the confirmation was for
  /** Bumped by the database whenever the company's evidence or uncertainties change. */
  evidence_revision?: number | null;
};
export type PilotDraft = {
  id: string;
  company_id: string;
  revision: number;
  subject: string;
  body: string;
  sha256: string;
  /** The company's evidence revision when this draft was written (set by the database). */
  evidence_revision?: number | null;
};
export type PilotApproval = {
  draft_id: string;
  draft_sha256: string;
  kind: ApprovalKind;
  actor: string;
  approved_at: string;
  approver_user_id?: string | null; // message_approval: the owner's auth user id
  draft_revision?: number | null; // frozen by the database from the draft
  evidence_revision?: number | null;
};
export type PilotEventKind = "send_attempt" | "send_handoff" | "send_failed" | "contacted" | "replied" | "opted_out" | "suppressed" | "bounced";
export type PilotEvent = { company_id: string; kind: PilotEventKind; rfc822_message_id?: string | null };

export type Hold =
  | "not_email_lane"
  | "no_lane_reservation"
  | "reserved_for_other_lane"
  | "suppressed"
  | "already_contacted"
  | "unresolved_attempt"
  | "replied"
  | "no_contact_address"
  | "no_contact_basis"
  | "no_draft"
  | "not_latest_revision"
  | "draft_hash_mismatch"
  | "evidence_changed"
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
  ownerUserId: string | null; // Josh's auth id; only his message approval counts
}): Hold[] {
  const { lane, company, drafts, approvals, events, sender } = input;
  const holds: Hold[] = [];
  const mine = events.filter((e) => e.company_id === company.id);
  if (company.lane !== "email") holds.push("not_email_lane");
  // A company must be reserved for exactly the dispatching lane; an
  // unreserved company belongs to no lane, so neither can contact it.
  if (!company.reserved_for) holds.push("no_lane_reservation");
  else if (company.reserved_for !== lane) holds.push("reserved_for_other_lane");
  if (mine.some((e) => (STOP_EVENTS as readonly string[]).includes(e.kind))) holds.push("suppressed");
  if (mine.some((e) => e.kind === "contacted")) holds.push("already_contacted");
  // An attempt with no recorded outcome may have been delivered: reconcile, never resend.
  const resolved = new Set(mine.filter((e) => e.kind === "contacted" || e.kind === "send_failed").map((e) => e.rfc822_message_id));
  if (mine.some((e) => e.kind === "send_attempt" && !resolved.has(e.rfc822_message_id))) holds.push("unresolved_attempt");
  if (mine.some((e) => e.kind === "replied")) holds.push("replied");
  if (!company.contact_address) holds.push("no_contact_address");
  const norm = (v: string | null) => (v ?? "").trim().toLowerCase();
  if (!company.contact_basis_confirmed_at || !company.contact_address || norm(company.contact_basis_confirmed_for) !== norm(company.contact_address)) {
    holds.push("no_contact_basis");
  }

  const ours = drafts.filter((d) => d.company_id === company.id);
  const draft = ours.find((d) => d.id === input.draftId);
  if (!draft) {
    holds.push("no_draft");
  } else {
    if (draft.revision !== Math.max(...ours.map((d) => d.revision))) holds.push("not_latest_revision");
    if (draftHash(draft.subject, draft.body) !== draft.sha256) holds.push("draft_hash_mismatch");
    // Written against older evidence (or unversioned): reviews and approvals of it don't stand.
    if (draft.evidence_revision == null || company.evidence_revision == null || draft.evidence_revision !== company.evidence_revision) {
      holds.push("evidence_changed");
    }
    for (const kind of APPROVAL_KINDS) {
      const counts = (a: PilotApproval) =>
        a.draft_id === draft.id &&
        a.draft_sha256 === draft.sha256 &&
        a.kind === kind &&
        !!a.actor.trim() &&
        (kind !== "message_approval" || (!!input.ownerUserId && a.approver_user_id === input.ownerUserId));
      if (!approvals.some(counts)) {
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
  no_lane_reservation: "not reserved for a lane",
  reserved_for_other_lane: "reserved for another lane",
  suppressed: "suppressed or opted out",
  already_contacted: "already contacted",
  unresolved_attempt: "an earlier send attempt is unresolved (reconcile it from the mailbox)",
  replied: "has replied (a person handles it)",
  no_contact_address: "no contact address",
  no_contact_basis: "contact basis not confirmed for the current address",
  no_draft: "no draft",
  not_latest_revision: "not the latest draft revision",
  draft_hash_mismatch: "draft changed after hashing",
  evidence_changed: "evidence changed since this revision was written (add a new revision)",
  missing_evidence_refresh: "evidence refresh not signed off",
  missing_preview_review: "preview review missing",
  missing_copy_review: "copy review missing",
  missing_message_approval: "Josh's message approval missing",
  no_verified_sender: "no verified Outback Connections sender",
};
