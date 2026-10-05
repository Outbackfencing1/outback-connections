import { describe, expect, it } from "vitest";
import { APPROVAL_KINDS, draftHash, firstContactHolds, type PilotApproval, type PilotCompany, type PilotDraft } from "@/lib/digital-services/dispatch-guard";

const company: PilotCompany = { id: "OC-900", lane: "email", reserved_for: "cowork", contact_address: "info@example.test", contact_basis_confirmed_at: "2026-10-06T00:00:00Z" };
const d1: PilotDraft = { id: "d1", company_id: "OC-900", revision: 1, subject: "Old", body: "Old body", sha256: draftHash("Old", "Old body") };
const d2: PilotDraft = { id: "d2", company_id: "OC-900", revision: 2, subject: "New", body: "New body", sha256: draftHash("New", "New body") };
const approve = (d: PilotDraft): PilotApproval[] => APPROVAL_KINDS.map((kind) => ({ draft_id: d.id, draft_sha256: d.sha256, kind, actor: "Joshua", approved_at: "2026-10-06" }));
const sender = { address: "josh@outbackconnections.com.au", verified: true };
const base = { lane: "cowork" as const, company, drafts: [d1, d2], draftId: "d2", approvals: approve(d2), events: [], sender };

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
  it("walk-in and phone lanes never get a dispatched email", () => {
    expect(firstContactHolds({ ...base, company: { ...company, lane: "walk-in" } })).toContain("not_email_lane");
  });
});
