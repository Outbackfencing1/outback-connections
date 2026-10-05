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
  reserved_for_cowork: boolean;
  checked_at: string | null;
};

export const PILOT_TABLE = "digital_services_pilot";

/** What blocks a real send for every email row, until shown otherwise. */
export const PILOT_BLOCKERS = [
  "Josh's approval of the draft (Cowork workflow; drafts not visible to this app yet)",
  "A connected, verified Outback Connections sender with a tested reply route (help@ is the support/transactional address and is not used for outreach)",
];

/** Preview tokens are 20 lowercase hex characters; anything else isn't linked. */
export function previewHref(site: string, token: string | null): string | null {
  return token && /^[0-9a-f]{20}$/.test(token) ? `${site}/preview/${token}.html` : null;
}
