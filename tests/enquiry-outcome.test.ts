import { describe, expect, it } from "vitest";
import { isEnquiryOutcome, responseLine } from "@/lib/enquiry-outcome";

describe("enquiry outcomes", () => {
  it("accepts only the three known answers", () => {
    expect(isEnquiryOutcome("responded")).toBe(true);
    expect(isEnquiryOutcome("no_response")).toBe(true);
    expect(isEnquiryOutcome("done_elsewhere")).toBe(true);
    expect(isEnquiryOutcome("great")).toBe(false);
    expect(isEnquiryOutcome(null)).toBe(false);
  });

  it("only speaks when at least one farmer has answered", () => {
    expect(responseLine(null)).toBeNull();
    expect(responseLine({ answered: 0, responded: 0 })).toBeNull();
    expect(responseLine({ answered: 1, responded: 1 })).toBe(
      "Responded to 1 of 1 quote request farmers told us about"
    );
    expect(responseLine({ answered: 4, responded: 3 })).toBe(
      "Responded to 3 of 4 quote requests farmers told us about"
    );
  });
});
