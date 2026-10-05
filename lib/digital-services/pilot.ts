// lib/digital-services/pilot.ts
// Status snapshot for the small sales pilot (docs/digital-services/PILOT-READINESS.md).
// This is a read-only view, not a sending tracker: drafts, approvals and any
// send records stay in Cowork's approval workflow until the engine import
// exists. No personal contact details live in source.
export type PilotRow = {
  id: string;
  company: string;
  lane: "email" | "walk-in" | "phone";
  previewToken: string;
  previewCheck: "pass" | "pass-with-note";
  previewNote?: string;
  reservedForCowork: boolean;
};

export const PILOT_CHECKED_AT = "2026-10-05";

export const PILOT: PilotRow[] = [
  { id: "OC-001", company: "Amazing Detail", lane: "email", previewToken: "f9a0ea6a94a87b4d3c83", previewCheck: "pass", reservedForCowork: false },
  { id: "OC-011", company: "Bathurst Detailing Studio", lane: "email", previewToken: "bf1031bb9304aa6f9b5d", previewCheck: "pass", reservedForCowork: false },
  { id: "OC-014", company: "East Coast Car Detail", lane: "email", previewToken: "932b5c0a49eefefd5676", previewCheck: "pass", reservedForCowork: false },
  { id: "OC-002", company: "Dimi Professional Cleaning", lane: "email", previewToken: "960a239e73fa2fda683b", previewCheck: "pass", reservedForCowork: true },
  { id: "OC-017", company: "Diamond Commercial Cleaners Brisbane", lane: "email", previewToken: "6c33998456ed1af20c29", previewCheck: "pass", reservedForCowork: true },
  {
    id: "OC-010",
    company: "Q CLEAN",
    lane: "email",
    previewToken: "f8ac7f548484e0e34e52",
    previewCheck: "pass-with-note",
    previewNote: "'Book a workplace visit' is listed as a service; reads as an action. For Cowork's pre-send review.",
    reservedForCowork: true,
  },
  { id: "OC-007", company: "MeshPro Auto Care", lane: "email", previewToken: "1f5b46299cb2cec194a5", previewCheck: "pass", reservedForCowork: false },
  { id: "OC-003", company: "JCS Commercial Cleaners", lane: "email", previewToken: "062ad8d3c163d569904c", previewCheck: "pass", reservedForCowork: true },
  { id: "OC-004", company: "Mirror Image Cleaning – Car Detailing", lane: "walk-in", previewToken: "77e8b5f25fa816376d34", previewCheck: "pass", reservedForCowork: false },
  { id: "OC-012", company: "Northside Premium Detailing", lane: "phone", previewToken: "8a34b23b00fcba210d21", previewCheck: "pass", reservedForCowork: false },
];

/** What blocks a real send for every email row, until shown otherwise. */
export const PILOT_BLOCKERS = [
  "Josh's approval of the draft (Cowork workflow; drafts not visible to this app yet)",
  "A connected, verified Outback Connections sender with a tested reply route (help@ is the support/transactional address and is not used for outreach)",
];
