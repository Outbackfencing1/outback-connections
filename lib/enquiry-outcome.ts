// lib/enquiry-outcome.ts
// The three answers a farmer can give a week after we forwarded their
// enquiry. Pure; used by the follow-up email, the outcome route and tests.

export const ENQUIRY_OUTCOMES = ["responded", "no_response", "done_elsewhere"] as const;
export type EnquiryOutcome = (typeof ENQUIRY_OUTCOMES)[number];

export const OUTCOME_LABELS: Record<EnquiryOutcome, string> = {
  responded: "Yes, they got back to me",
  no_response: "No, I never heard from them",
  done_elsewhere: "Sorted it another way",
};

export function isEnquiryOutcome(v: unknown): v is EnquiryOutcome {
  return typeof v === "string" && (ENQUIRY_OUTCOMES as readonly string[]).includes(v);
}

/** "Responded to 3 of 4 quote requests" or null when there's nothing honest to say. */
export function responseLine(stats: { answered?: number; responded?: number } | null | undefined): string | null {
  const answered = stats?.answered ?? 0;
  const responded = stats?.responded ?? 0;
  if (answered < 1) return null;
  return `Responded to ${responded} of ${answered} quote request${answered === 1 ? "" : "s"} farmers told us about`;
}
