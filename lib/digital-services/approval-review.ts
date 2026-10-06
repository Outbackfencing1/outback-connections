// lib/digital-services/approval-review.ts
// What Josh sees before recording a message approval for one pilot draft:
// the exact subject and body, the revision and its hash, the source evidence
// with its age and method, the open uncertainties and sending holds, the
// offer scope, the preview and every review on record. Pure: the owner page
// loads the rows (owner-only, service role) and renders this model.
//
// Approval records the approval only. Nothing here, and nothing the approval
// button does, sends an email: dispatch stays unwired and separately held.
import { APPROVAL_KINDS, HOLD_LABELS, draftHash, firstContactHolds, type ApprovalKind, type Hold, type PilotApproval, type PilotDraft, type PilotEvent } from "./dispatch-guard";
import { OFFERS } from "./offer";
import type { Offer, PilotRow } from "./pilot";

/** Evidence older than this needs a refresh (which adds a new evidence revision) before approval. */
export const EVIDENCE_MAX_AGE_DAYS = 30;

export type PilotEvidence = {
  id: string;
  company_id: string;
  source_url: string;
  source_type: string;
  checked_at: string;
  fact_text: string;
  limitations: string[] | null;
  recorded_by: string;
};
export type ReviewCompany = PilotRow & { evidence_revision?: number | null; uncertainties?: string[] | null };
export type ReviewDraft = PilotDraft & {
  author?: string | null;
  change_reason?: string | null;
  created_at?: string | null;
  offer?: Offer | null;
  preview_token?: string | null;
};

export const SOURCE_METHODS: Record<string, string> = {
  primary_business_website: "Business's own website",
  official_business_social_page: "Business's official social page",
  discovery_only_directory_or_search: "Directory or search result (discovery only)",
  owner_observation: "Owner's own observation",
};

// Characters that can hide or reorder text in a mail client: bidi controls,
// zero-width characters, soft hyphens, byte-order marks and C0/C1 controls
// other than newline and tab.
const HIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/** Make hidden characters visible as ⟦U+XXXX⟧ markers; report which were found. */
export function revealHidden(text: string): { text: string; found: string[] } {
  const found = new Set<string>();
  const out = text.replace(HIDDEN, (c) => {
    const code = `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
    found.add(code);
    return `⟦${code}⟧`;
  });
  return { text: out, found: [...found] };
}

/** Links in the body, each with whether it's a plain https link the reader can see. */
export function bodyLinks(body: string): { url: string; ok: boolean; why: string | null }[] {
  const seen = new Set<string>();
  const links: { url: string; ok: boolean; why: string | null }[] = [];
  for (const m of body.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>()"']+/gi)) {
    const url = m[0].replace(/[.,;:!?]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    let why: string | null = null;
    try {
      const u = new URL(/^www\./i.test(url) ? `https://${url}` : url);
      if (u.protocol !== "https:") why = "not https";
      else if (u.username || u.password) why = "carries credentials";
      else if ([...u.searchParams.keys()].some((k) => /(token|key|secret|sig|signature|password|bypass|session|auth)/i.test(k))) why = "carries a credential-like parameter";
    } catch {
      why = "malformed";
    }
    links.push({ url, ok: !why, why });
  }
  return links;
}

const OFFER_TO_PUBLIC: Partial<Record<Offer, (typeof OFFERS)[number]["key"]>> = {
  website_1990: "website",
  quote_form_490: "quote_form",
  care_149: "care",
};
export function offerScope(offer: Offer | null | undefined): { name: string; price: string; scope: string[]; note: string | null } | null {
  if (!offer) return null;
  if (offer === "one_page_790") {
    return { name: "One-page site (downsell)", price: "A$790", scope: ["Only after the main offer is declined", "Scope set out in writing before any work"], note: null };
  }
  const o = OFFERS.find((x) => x.key === OFFER_TO_PUBLIC[offer]);
  return o ? { name: o.name, price: o.price, scope: o.scope, note: o.note ?? null } : null;
}

export type ReviewStatus = "valid" | "missing" | "earlier_revision" | "changed_copy" | "other_owner";
export type ReviewLine = { kind: ApprovalKind; status: ReviewStatus; actor: string | null; at: string | null; revision: number | null };

export type ApprovalReview =
  | { state: "not_found" }
  | {
      state: "ready";
      company: { id: string; name: string; lane: string; reserved_for: string | null; evidence_revision: number | null };
      draft: {
        id: string;
        revision: number;
        latest_revision: number;
        is_latest: boolean;
        sha256: string;
        hash_ok: boolean;
        evidence_revision: number | null;
        author: string | null;
        created_at: string | null;
        change_reason: string | null;
        subject: { text: string; found: string[] };
        body: { text: string; found: string[] };
        links: ReturnType<typeof bodyLinks>;
      };
      offer: ReturnType<typeof offerScope>;
      preview: { token_ok: boolean; check: string; note: string | null; checked_at: string | null };
      evidence: (Omit<PilotEvidence, "limitations"> & { limitations: string[]; age_days: number | null; stale: boolean; method: string })[];
      evidence_current: boolean;
      uncertainties: string[];
      reviews: ReviewLine[];
      sending_holds: { hold: Hold; label: string }[];
      /** Why the approval button isn't offered (empty when it is). */
      blockers: string[];
      can_approve: boolean;
      already_approved: boolean;
      revisions: { id: string; revision: number; sha256: string; approvals: number }[];
    };

export function buildApprovalReview(input: {
  draftId: string;
  company: ReviewCompany | null;
  drafts: ReviewDraft[];
  approvals: PilotApproval[];
  evidence: PilotEvidence[];
  events: PilotEvent[];
  sender: { address: string; verified: boolean } | null;
  ownerUserId: string;
  now: Date;
}): ApprovalReview {
  const draft = input.drafts.find((d) => d.id === input.draftId);
  const company = input.company;
  if (!draft || !company || draft.company_id !== company.id) return { state: "not_found" };
  const mine = input.drafts.filter((d) => d.company_id === company.id).sort((a, b) => b.revision - a.revision);
  const latest = mine[0].revision;
  const is_latest = draft.revision === latest;
  const hash_ok = draftHash(draft.subject, draft.body) === draft.sha256;
  const evidence_current = draft.evidence_revision != null && company.evidence_revision != null && draft.evidence_revision === company.evidence_revision;
  const now = input.now.getTime();
  const evidence = input.evidence
    .filter((e) => e.company_id === company.id)
    .sort((a, b) => Date.parse(b.checked_at) - Date.parse(a.checked_at) || a.id.localeCompare(b.id))
    .map((e) => {
      const t = Date.parse(e.checked_at);
      const age_days = Number.isNaN(t) ? null : Math.floor((now - t) / 86_400_000);
      return { ...e, limitations: e.limitations ?? [], age_days, stale: age_days === null || age_days > EVIDENCE_MAX_AGE_DAYS, method: SOURCE_METHODS[e.source_type] ?? e.source_type };
    });

  const reviews: ReviewLine[] = APPROVAL_KINDS.map((kind) => {
    const exact = input.approvals.find((a) => a.draft_id === draft.id && a.kind === kind);
    if (exact) {
      const status: ReviewStatus =
        exact.draft_sha256 !== draft.sha256 ? "changed_copy" : kind === "message_approval" && exact.approver_user_id !== input.ownerUserId ? "other_owner" : "valid";
      return { kind, status, actor: exact.actor, at: exact.approved_at, revision: exact.draft_revision ?? draft.revision };
    }
    const older = mine
      .filter((d) => d.revision < draft.revision)
      .map((d) => input.approvals.find((a) => a.draft_id === d.id && a.kind === kind) && d)
      .find(Boolean);
    if (older) {
      const a = input.approvals.find((x) => x.draft_id === older.id && x.kind === kind)!;
      return { kind, status: "earlier_revision", actor: a.actor, at: a.approved_at, revision: older.revision };
    }
    return { kind, status: "missing", actor: null, at: null, revision: null };
  });
  const valid = (k: ApprovalKind) => reviews.find((r) => r.kind === k)?.status === "valid";
  const already_approved = valid("message_approval");

  const subject = revealHidden(draft.subject);
  const body = revealHidden(draft.body);
  const links = bodyLinks(draft.body);
  const blockers: string[] = [];
  if (!is_latest) blockers.push(`Revision ${draft.revision} isn't the latest (revision ${latest} is). Review that one.`);
  if (!hash_ok) blockers.push("The stored hash doesn't match the copy. Don't approve; add a new revision.");
  if (!evidence_current) blockers.push("Evidence changed after this revision was written, so its reviews don't stand. Add a new revision.");
  if (evidence.length === 0) blockers.push("No source evidence is recorded for this company.");
  else if (evidence.some((e) => e.stale)) blockers.push(`Some evidence is older than ${EVIDENCE_MAX_AGE_DAYS} days. Refresh it (which needs a new revision).`);
  if (subject.found.length || body.found.length) blockers.push("The copy contains hidden or control characters (marked ⟦U+…⟧). Fix them in a new revision.");
  if (links.some((l) => !l.ok)) blockers.push("A link in the body isn't a plain https link.");
  for (const k of ["evidence_refresh", "preview_review", "copy_review"] as const) {
    if (!valid(k)) blockers.push(`${k.replace("_", " ")} isn't recorded for this exact revision.`);
  }
  if (already_approved) blockers.push("You've already approved this exact revision.");

  const holds = firstContactHolds({
    lane: company.reserved_for ?? "cowork",
    company,
    drafts: mine,
    draftId: draft.id,
    approvals: input.approvals,
    events: input.events,
    sender: input.sender,
    ownerUserId: input.ownerUserId,
  });

  return {
    state: "ready",
    company: { id: company.id, name: company.company, lane: company.lane, reserved_for: company.reserved_for, evidence_revision: company.evidence_revision ?? null },
    draft: {
      id: draft.id,
      revision: draft.revision,
      latest_revision: latest,
      is_latest,
      sha256: draft.sha256,
      hash_ok,
      evidence_revision: draft.evidence_revision ?? null,
      author: draft.author ?? null,
      created_at: draft.created_at ?? null,
      change_reason: draft.change_reason ?? null,
      subject,
      body,
      links,
    },
    offer: offerScope(draft.offer ?? company.offer),
    preview: {
      token_ok: !!(draft.preview_token ?? company.preview_token) && /^[0-9a-f]{20}$/.test((draft.preview_token ?? company.preview_token)!),
      check: company.preview_check,
      note: company.preview_note,
      checked_at: company.checked_at,
    },
    evidence,
    evidence_current,
    uncertainties: company.uncertainties ?? [],
    reviews,
    sending_holds: holds.map((hold) => ({ hold, label: HOLD_LABELS[hold] ?? hold })),
    blockers,
    can_approve: blockers.length === 0,
    already_approved,
    revisions: mine.map((d) => ({ id: d.id, revision: d.revision, sha256: d.sha256, approvals: input.approvals.filter((a) => a.draft_id === d.id && a.draft_sha256 === d.sha256).length })),
  };
}
