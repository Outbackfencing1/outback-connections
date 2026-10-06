import { describe, expect, it } from "vitest";
import { APPROVAL_KINDS, draftHash, firstContactHolds, type PilotApproval, type PilotCompany, type PilotDraft } from "@/lib/digital-services/dispatch-guard";

const OWNER = "33333333-3333-4333-8333-333333333333";
const company: PilotCompany = {
  id: "OC-900",
  lane: "email",
  reserved_for: "cowork",
  contact_address: "info@example.test",
  contact_basis_confirmed_at: "2026-10-06T00:00:00Z",
  contact_basis_confirmed_for: "Info@Example.test ",
  evidence_revision: 3,
};
const d1: PilotDraft = { id: "d1", company_id: "OC-900", revision: 1, subject: "Old", body: "Old body", sha256: draftHash("Old", "Old body"), evidence_revision: 3 };
const d2: PilotDraft = { id: "d2", company_id: "OC-900", revision: 2, subject: "New", body: "New body", sha256: draftHash("New", "New body"), evidence_revision: 3 };
const approve = (d: PilotDraft): PilotApproval[] =>
  APPROVAL_KINDS.map((kind) => ({ draft_id: d.id, draft_sha256: d.sha256, kind, actor: "Joshua", approved_at: "2026-10-06", approver_user_id: kind === "message_approval" ? OWNER : null }));
const sender = { address: "josh@outbackconnections.com.au", verified: true };
const base = { lane: "cowork" as const, company, drafts: [d1, d2], draftId: "d2", approvals: approve(d2), events: [], sender, ownerUserId: OWNER };

describe("first-contact dispatch guard", () => {
  it("passes only when every condition holds", () => {
    expect(firstContactHolds(base)).toEqual([]);
  });
  it("a reserved company can't be contacted by the engine lane", () => {
    expect(firstContactHolds({ ...base, lane: "engine" })).toContain("reserved_for_other_lane");
  });
  it("reservation is not contact: it doesn't count as already contacted", () => {
    expect(firstContactHolds(base)).not.toContain("already_contacted");
  });
  it("history and suppression block, at company level", () => {
    expect(firstContactHolds({ ...base, events: [{ company_id: "OC-900", kind: "contacted" }] })).toContain("already_contacted");
    expect(firstContactHolds({ ...base, events: [{ company_id: "OC-900", kind: "opted_out" }] })).toContain("suppressed");
    expect(firstContactHolds({ ...base, events: [{ company_id: "OC-900", kind: "replied" }] })).toContain("replied");
    expect(firstContactHolds({ ...base, events: [{ company_id: "OC-901", kind: "contacted" }] })).toEqual([]);
  });
  it("approvals bind to the exact revision and hash", () => {
    expect(firstContactHolds({ ...base, approvals: approve(d1) })).toEqual(
      expect.arrayContaining(["missing_evidence_refresh", "missing_preview_review", "missing_copy_review", "missing_message_approval"])
    );
    expect(firstContactHolds({ ...base, draftId: "d1", approvals: approve(d1) })).toContain("not_latest_revision");
    const edited = { ...d2, body: "New body, edited after approval" };
    expect(firstContactHolds({ ...base, drafts: [d1, edited] })).toContain("draft_hash_mismatch");
    const unsigned = approve(d2).map((a) => (a.kind === "message_approval" ? { ...a, actor: " " } : a));
    expect(firstContactHolds({ ...base, approvals: unsigned })).toEqual(["missing_message_approval"]);
  });
  it("needs a confirmed contact basis, an address and a verified non-support sender", () => {
    expect(firstContactHolds({ ...base, company: { ...company, contact_basis_confirmed_at: null } })).toContain("no_contact_basis");
    expect(firstContactHolds({ ...base, company: { ...company, contact_address: null } })).toContain("no_contact_address");
    expect(firstContactHolds({ ...base, sender: null })).toContain("no_verified_sender");
    expect(firstContactHolds({ ...base, sender: { address: "josh@outbackconnections.com.au", verified: false } })).toContain("no_verified_sender");
    expect(firstContactHolds({ ...base, sender: { address: "help@outbackconnections.com.au", verified: true } })).toContain("no_verified_sender");
  });
  it("an unreserved company can't be contacted by either lane", () => {
    expect(firstContactHolds({ ...base, company: { ...company, reserved_for: null } })).toContain("no_lane_reservation");
    expect(firstContactHolds({ ...base, lane: "engine", company: { ...company, reserved_for: null } })).toContain("no_lane_reservation");
  });
  it("a confirmation for an old address doesn't cover a new one", () => {
    expect(firstContactHolds({ ...base, company: { ...company, contact_address: "new@example.test" } })).toContain("no_contact_basis");
  });
  it("only Josh's own message approval counts", () => {
    const byOther = approve(d2).map((a) => (a.kind === "message_approval" ? { ...a, actor: "system", approver_user_id: "44444444-4444-4444-8444-444444444444" } : a));
    expect(firstContactHolds({ ...base, approvals: byOther })).toEqual(["missing_message_approval"]);
    const unattributed = approve(d2).map((a) => (a.kind === "message_approval" ? { ...a, approver_user_id: null } : a));
    expect(firstContactHolds({ ...base, approvals: unattributed })).toEqual(["missing_message_approval"]);
    expect(firstContactHolds({ ...base, ownerUserId: null })).toEqual(["missing_message_approval"]);
  });
  it("walk-in and phone lanes never get a dispatched email", () => {
    expect(firstContactHolds({ ...base, company: { ...company, lane: "walk-in" } })).toContain("not_email_lane");
  });
});

describe("evidence revisions", () => {
  it("a draft written against older (or unversioned) evidence is held", () => {
    expect(firstContactHolds({ ...base, company: { ...company, evidence_revision: 4 } })).toContain("evidence_changed");
    expect(firstContactHolds({ ...base, company: { ...company, evidence_revision: null } })).toContain("evidence_changed");
    const unversioned = { ...d2, evidence_revision: undefined };
    expect(firstContactHolds({ ...base, drafts: [d1, unversioned], approvals: approve(unversioned) })).toContain("evidence_changed");
  });
});
