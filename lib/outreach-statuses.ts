// lib/outreach-statuses.ts
// The contractor outreach statuses, shared by the server page and the client
// row actions. Plain module (no "use client"): a server component can only
// render a client module's exports, not call methods on them, so importing
// this array from OutreachRowActions.tsx made the page throw on .map/.find.
export const OUTREACH_STATUSES = [
  { value: "not_contacted", label: "Not contacted" },
  { value: "attempted", label: "Attempted" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "invite_sent", label: "Invite sent" },
  { value: "follow_up", label: "Follow up" },
  { value: "joined", label: "Joined" },
  { value: "not_interested", label: "Not interested" },
  { value: "invalid_duplicate", label: "Invalid / duplicate" },
  { value: "do_not_contact", label: "Do not contact" },
] as const;

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]["value"];
