// lib/digital-services/pilot.ts
// The small sales pilot's per-company view. Prospect data is owner-only
// (AGENTS.md), so no company, lane, reservation or preview token lives in
// this public repository: rows come from the owner-only
// digital_services_pilot table (draft migration), read with the service role
// after the owner check. Until that table exists, the private record is the
// oc_planning.agent_updates row "claude-code-pilot-readiness-private-copy-2026-10-05".
export type PilotRow = {
  id: string;
  company: string;
  lane: "email" | "walk-in" | "phone";
  preview_token: string | null;
  preview_check: "pass" | "pass-with-note" | "not-checked";
  preview_note: string | null;
  reserved_for: "cowork" | "engine" | null;
  offer: Offer | null;
  contact_address: string | null;
  contact_basis_confirmed_at: string | null;
  checked_at: string | null;
};

export type Offer = "website_1990" | "quote_form_490" | "care_149" | "one_page_790";
export const OFFER_LABELS: Record<Offer, string> = {
  website_1990: "A$1,990 website",
  quote_form_490: "A$490 guided form",
  care_149: "A$149/month care",
  one_page_790: "A$790 one-page site (downsell)",
};

export const PILOT_DRAFTS_TABLE = "digital_services_pilot_drafts";
export const PILOT_APPROVALS_TABLE = "digital_services_pilot_approvals";
export const PILOT_EVENTS_TABLE = "digital_services_pilot_events";

/**
 * The outreach sender, named explicitly. It counts as verified only once the
 * owned-inbox send/reply test has passed and its date is recorded here.
 */
export function outreachSender(env: Record<string, string | undefined> = process.env): { address: string; verified: boolean } | null {
  const address = env.DIGITAL_SERVICES_OUTREACH_SENDER?.trim();
  if (!address) return null;
  const verified = /^\d{4}-\d{2}-\d{2}$/.test(env.DIGITAL_SERVICES_OUTREACH_SENDER_VERIFIED_ON?.trim() ?? "");
  return { address, verified };
}

export const PILOT_TABLE = "digital_services_pilot";

/** What blocks a real send for every email row, until shown otherwise. */
export const PILOT_BLOCKERS = [
  "Josh's approval of the exact draft revision (evidence refresh, preview review, copy review, message approval)",
  "A connected, verified Outback Connections sender with a tested reply route (help@ is the support/transactional address and is not used for outreach)",
];

/** Preview tokens are 20 lowercase hex characters; anything else isn't linked. */
export function previewHref(site: string, token: string | null): string | null {
  return token && /^[0-9a-f]{20}$/.test(token) ? `${site}/preview/${token}.html` : null;
}
