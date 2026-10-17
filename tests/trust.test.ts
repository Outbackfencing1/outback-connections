import { describe, expect, it } from "vitest";
import {
  dealTypeLabel,
  formatAbn,
  insuranceBadgeLabel,
  isValidAustralianAbn,
  isValidDealType,
  isValidInsuranceBadge,
  isValidRoleTag,
  isValidTrustTag,
  normaliseAbn,
  roleTagLabel,
  trustTagLabel,
} from "@/lib/trust";

describe("lib/trust ABN validation & formatting", () => {
  it("validates official ATO modulus-89 11-digit ABNs", () => {
    // 51 824 753 556 is the official ATO test ABN example
    expect(isValidAustralianAbn("51 824 753 556")).toBe(true);
    expect(isValidAustralianAbn("51824753556")).toBe(true);
    // Telstra ABN: 33 051 775 556
    expect(isValidAustralianAbn("33 051 775 556")).toBe(true);
  });

  it("rejects invalid checksums or wrong lengths", () => {
    expect(isValidAustralianAbn("51 824 753 557")).toBe(false);
    expect(isValidAustralianAbn("12345678901")).toBe(false);
    expect(isValidAustralianAbn("12345")).toBe(false);
    expect(isValidAustralianAbn("")).toBe(false);
    expect(isValidAustralianAbn(null)).toBe(false);
  });

  it("normalises and formats valid ABNs", () => {
    expect(normaliseAbn("51 824 753 556")).toBe("51824753556");
    expect(formatAbn("51824753556")).toBe("51 824 753 556");
    expect(formatAbn("invalid")).toBeNull();
  });
});

describe("lib/trust rural tags and badges", () => {
  it("validates and formats trust tags", () => {
    expect(isValidTrustTag("turned_up_on_time")).toBe(true);
    expect(isValidTrustTag("not_a_tag")).toBe(false);
    expect(trustTagLabel("turned_up_on_time")).toBe("Turned up on time");
  });

  it("validates and formats deal types, insurances, and role tags", () => {
    expect(isValidDealType("bought_item")).toBe(true);
    expect(dealTypeLabel("bought_item")).toContain("Bought");
    expect(isValidInsuranceBadge("public_liability")).toBe(true);
    expect(insuranceBadgeLabel("public_liability")).toBe("Public Liability Insured");
    expect(isValidRoleTag("fencing_contractor")).toBe(true);
    expect(roleTagLabel("fencing_contractor")).toBe("Fencing Contractor");
  });
});
