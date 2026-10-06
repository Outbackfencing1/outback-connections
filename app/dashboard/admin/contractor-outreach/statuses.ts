// Outreach statuses and their labels, shared by the server page and the
// client row actions. A plain module (no "use client"): a server component
// can't use runtime values exported from a client module, because it only
// receives a client reference there, not the array.
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
