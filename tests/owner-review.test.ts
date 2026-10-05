// The owner's draft review screen: what's shown before approval, what blocks
// it, and who can open it. Synthetic fixtures only.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApprovalReview, bodyLinks, revealHidden, type PilotEvidence, type ReviewCompany, type ReviewDraft } from "@/lib/digital-services/approval-review";
import { APPROVAL_KINDS, draftHash, type PilotApproval } from "@/lib/digital-services/dispatch-guard";
import { decideOwnerAccess } from "@/lib/digital-services/owner-access";

const OWNER = "33333333-3333-4333-8333-333333333333";
const MEMBER = "44444444-4444-4444-8444-444444444444";
const ADMIN = "55555555-5555-4555-8555-555555555555"; // a marketplace admin: still not the owner
const D1 = "11111111-1111-4111-8111-111111111111";
const D2 = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-06T00:00:00Z");

const company = (over: Partial<ReviewCompany> = {}): ReviewCompany => ({
  id: "OC-901",
  company: "Fixture Cleaners",
  lane: "email",
  preview_token: "abcdefabcdefabcdef12",
  preview_check: "pass-with-note",
  preview_note: "Hero image is a placeholder",
  reserved_for: "cowork",
  offer: "quote_form_490",
  contact_address: null,
  contact_basis_confirmed_at: null,
  contact_basis_confirmed_for: null,
  checked_at: "2026-10-05",
  evidence_revision: 2,
  uncertainties: ["Form delivery untested"],
  ...over,
});
const draft = (id: string, revision: number, subject: string, body: string, over: Partial<ReviewDraft> = {}): ReviewDraft => ({
  id,
  company_id: "OC-901",
  revision,
  subject,
  body,
  sha256: draftHash(subject, body),
  evidence_revision: 2,
  author: "claude-code",
  created_at: "2026-10-05T10:00:00Z",
  change_reason: null,
  offer: "quote_form_490",
  preview_token: "abcdefabcdefabcdef12",
  ...over,
});
const evidence = (over: Partial<PilotEvidence> = {}): PilotEvidence => ({
  id: "e1",
  company_id: "OC-901",
  source_url: "https://fixture.example/contact",
  source_type: "primary_business_website",
  checked_at: "2026-10-05T07:14:52Z",
  fact_text: "Contact page has a five-field form.",
  limitations: ["Form submission not tested"],
  recorded_by: "claude-code",
  ...over,
});
const reviews = (d: ReviewDraft, kinds: readonly string[] = ["evidence_refresh", "preview_review", "copy_review"]): PilotApproval[] =>
  kinds.map((kind) => ({
    draft_id: d.id,
    draft_sha256: d.sha256,
    kind: kind as PilotApproval["kind"],
    actor: kind === "message_approval" ? "owner" : "reviewer",
    approved_at: "2026-10-05T12:00:00Z",
    approver_user_id: kind === "message_approval" ? OWNER : null,
    draft_revision: d.revision,
    evidence_revision: d.evidence_revision,
  }));

const d2 = draft(D2, 2, "A guided quote step for your site", "Hello,\n\nWe noticed your contact form...\n\nJosh");
const d1 = draft(D1, 1, "Old subject", "Old body");
const base = { draftId: D2, company: company(), drafts: [d1, d2], approvals: [...reviews(d1, APPROVAL_KINDS), ...reviews(d2)], evidence: [evidence()], events: [], sender: null, ownerUserId: OWNER, now: NOW };
const ready = (r: ReturnType<typeof buildApprovalReview>) => {
  if (r.state !== "ready") throw new Error("expected a ready review");
  return r;
};

describe("approval review model", () => {
  it("shows the exact copy, revision, hash, evidence age and method, uncertainties, offer scope and reviews", () => {
    const r = ready(buildApprovalReview(base));
    expect(r.draft).toMatchObject({ revision: 2, latest_revision: 2, is_latest: true, hash_ok: true, sha256: d2.sha256 });
    expect(r.draft.body.text).toBe(d2.body);
    expect(r.evidence[0]).toMatchObject({ age_days: 0, stale: false, method: "Business's own website", limitations: ["Form submission not tested"] });
    expect(r.uncertainties).toEqual(["Form delivery untested"]);
    expect(r.offer).toMatchObject({ price: "A$490" });
    expect(r.reviews.map((x) => x.status)).toEqual(["valid", "valid", "valid", "earlier_revision"]);
    expect(r.can_approve).toBe(true);
    // Sending stays held regardless (no contact basis, no verified sender).
    expect(r.sending_holds.map((h) => h.hold)).toEqual(expect.arrayContaining(["no_contact_basis", "no_verified_sender", "missing_message_approval"]));
  });

  it("an earlier revision's approvals don't carry over and it can't be approved", () => {
    const r = ready(buildApprovalReview({ ...base, draftId: D1 }));
    expect(r.draft.is_latest).toBe(false);
    expect(r.can_approve).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/isn't the latest/);
  });

  it("changed evidence invalidates the revision's reviews", () => {
    const r = ready(buildApprovalReview({ ...base, company: company({ evidence_revision: 3 }) }));
    expect(r.evidence_current).toBe(false);
    expect(r.can_approve).toBe(false);
    expect(r.sending_holds.map((h) => h.hold)).toContain("evidence_changed");
  });

  it("changed copy invalidates: a review against a different hash doesn't count, and a bad stored hash blocks", () => {
    const changed = reviews({ ...d2, sha256: "f".repeat(64) });
    const r = ready(buildApprovalReview({ ...base, approvals: changed }));
    expect(r.reviews[0].status).toBe("changed_copy");
    expect(r.can_approve).toBe(false);
    const tampered = { ...d2, body: "Edited after hashing" };
    expect(ready(buildApprovalReview({ ...base, drafts: [d1, tampered] })).blockers.join(" ")).toMatch(/hash doesn't match/);
  });

  it("missing, stale or absent evidence blocks approval with a useful reason", () => {
    expect(ready(buildApprovalReview({ ...base, evidence: [] })).blockers).toContain("No source evidence is recorded for this company.");
    const old = ready(buildApprovalReview({ ...base, evidence: [evidence({ checked_at: "2026-08-01T00:00:00Z" })] }));
    expect(old.evidence[0].stale).toBe(true);
    expect(old.blockers.join(" ")).toMatch(/older than 30 days/);
  });

  it("missing reviews, an approval already recorded, and another owner's approval are all explained", () => {
    expect(ready(buildApprovalReview({ ...base, approvals: reviews(d2, ["copy_review"]) })).blockers.join(" ")).toMatch(/evidence refresh isn't recorded/);
    const mine = ready(buildApprovalReview({ ...base, approvals: reviews(d2, APPROVAL_KINDS) }));
    expect(mine.already_approved).toBe(true);
    expect(mine.can_approve).toBe(false);
    const other = reviews(d2, APPROVAL_KINDS).map((a) => (a.kind === "message_approval" ? { ...a, approver_user_id: ADMIN } : a));
    expect(ready(buildApprovalReview({ ...base, approvals: other })).reviews[3].status).toBe("other_owner");
  });

  it("hidden characters and unsafe links in model text are made visible and block approval", () => {
    const sneaky = draft(D2, 2, "Quote‮form", "Hi​ there https://x.example/?token=abc http://plain.example");
    const r = ready(buildApprovalReview({ ...base, drafts: [d1, sneaky], approvals: reviews(sneaky) }));
    expect(r.draft.subject.text).toBe("Quote⟦U+202E⟧form");
    expect(r.draft.body.found).toEqual(["U+200B"]);
    expect(r.draft.links.filter((l) => !l.ok).map((l) => l.why)).toEqual(["carries a credential-like parameter", "not https"]);
    expect(r.can_approve).toBe(false);
    expect(revealHidden("plain\ttext\n")).toEqual({ text: "plain\ttext\n", found: [] });
    expect(bodyLinks("see www.fixture.example.")[0]).toMatchObject({ url: "www.fixture.example", ok: true });
  });

  it("an unknown draft, or one for another company, is not found", () => {
    expect(buildApprovalReview({ ...base, draftId: "nope" }).state).toBe("not_found");
    expect(buildApprovalReview({ ...base, company: company({ id: "OC-902" }) }).state).toBe("not_found");
  });
});

// ------------------------------------------------------------- the screen
const persona = vi.hoisted(() => ({ user: null as string | null }));
const store = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, fail: null as string | null, reads: 0, available: true }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { notFound: true });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ rpc: async () => ({ data: null, error: null }) }) }));
vi.mock("@/lib/digital-services/owner", async () => {
  const { decideOwnerAccess: decide } = await import("@/lib/digital-services/owner-access");
  return { getOwnerAccess: async () => decide(persona.user, "33333333-3333-4333-8333-333333333333") };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    store.available
      ? {
          from: (table: string) => {
            const filters: [string, unknown][] = [];
            const result = () => {
              store.reads++;
              if (store.fail === table) return { data: null, error: { message: "boom" } };
              const rows = (store.tables[table] ?? []).filter((r) => filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v));
              return { data: rows, error: null };
            };
            const q = {
              select: () => q,
              eq: (k: string, v: unknown) => (filters.push([k, v]), q),
              maybeSingle: async () => {
                const r = result();
                return { data: r.data ? (r.data[0] ?? null) : null, error: r.error };
              },
              then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad),
            };
            return q;
          },
        }
      : null,
}));

async function open(draftId = D2, sp: Record<string, string> = {}) {
  const { default: Page } = await import("@/app/dashboard/owner/review/[draftId]/page");
  try {
    const el = await Page({ params: Promise.resolve({ draftId }), searchParams: Promise.resolve(sp) });
    return { html: renderToStaticMarkup(el) };
  } catch (e) {
    const err = e as { url?: string; notFound?: boolean };
    return { redirect: err.url, notFound: !!err.notFound };
  }
}

describe("review screen access and states", () => {
  beforeEach(() => {
    store.available = true;
    store.fail = null;
    store.reads = 0;
    store.tables = {
      digital_services_pilot: [company()],
      digital_services_pilot_drafts: [d1, d2],
      digital_services_pilot_approvals: [...reviews(d1, APPROVAL_KINDS), ...reviews(d2)],
      digital_services_pilot_evidence: [evidence({ checked_at: new Date().toISOString() })],
      digital_services_pilot_events: [],
    };
  });

  it("decides access by verified owner id only", () => {
    expect(decideOwnerAccess(ADMIN, OWNER)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("logged out: sent to sign-in, nothing read", async () => {
    persona.user = null;
    expect(await open()).toEqual({ redirect: `/signin?next=${encodeURIComponent(`/dashboard/owner/review/${D2}`)}`, notFound: false });
    expect(store.reads).toBe(0);
  });

  it("a member and another admin get a 404, nothing read", async () => {
    for (const user of [MEMBER, ADMIN]) {
      persona.user = user;
      expect(await open()).toMatchObject({ notFound: true });
    }
    expect(store.reads).toBe(0);
  });

  it("Joshua sees the exact draft, evidence, revision and holds, and an approval that says it doesn't send", async () => {
    persona.user = OWNER;
    const { html } = await open();
    expect(html).toContain("A guided quote step for your site");
    expect(html).toContain("We noticed your contact form...");
    expect(html).toContain(d2.sha256);
    expect(html).toContain("https://fixture.example/contact");
    expect(html).toContain("Business&#x27;s own website");
    expect(html).toContain("Form delivery untested");
    expect(html).toContain("Hero image is a placeholder");
    expect(html).toContain("Record approval of revision 2 (does not send)");
    expect(html).not.toContain("abcdefabcdefabcdef12"); // the preview token isn't printed
  });

  it("model text is rendered as text, never markup", async () => {
    persona.user = OWNER;
    const evil = draft(D2, 2, "<img src=x onerror=alert(1)>", "<script>alert(1)</script>‮");
    store.tables.digital_services_pilot_drafts = [d1, evil];
    store.tables.digital_services_pilot_approvals = reviews(evil);
    const { html } = await open();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;⟦U+202E⟧");
    expect(html).not.toContain("Record approval");
  });

  it("unavailable, read-error and not-found states are explicit", async () => {
    persona.user = OWNER;
    store.available = false;
    expect((await open()).html).toContain("Owner storage isn&#x27;t connected");
    store.available = true;
    store.fail = "digital_services_pilot_evidence";
    const err = (await open()).html!;
    expect(err).toContain("Reading the pilot evidence failed");
    expect(err).not.toContain("Record approval");
    store.fail = null;
    expect(await open("33333333-0000-4000-8000-000000000000")).toMatchObject({ notFound: true });
    expect(await open("not-a-uuid")).toMatchObject({ notFound: true });
  });

  it("an approval outcome is reported, and 'approved' says nothing was sent", async () => {
    persona.user = OWNER;
    expect((await open(D2, { pilot: "approved" })).html).toContain("Nothing was sent");
    expect((await open(D2, { pilot: "stale" })).html).toContain("no longer current");
  });
});
