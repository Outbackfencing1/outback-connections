import { describe, expect, it } from "vitest";
import {
  availabilityStatusInfo,
  dealTypeLabel,
  evaluateClaimAutoVerification,
  extractBusinessDomain,
  formatAbn,
  formatPhoneHref,
  insuranceBadgeLabel,
  isAustralianMobile,
  isCustomerTrustTag,
  isValidAvailabilityStatus,
  isValidAustralianAbn,
  isValidDealType,
  isValidInsuranceBadge,
  isValidRoleTag,
  isValidTrustTag,
  normaliseAbn,
  normalisePhoneDigits,
  roleTagLabel,
  trustTagLabel,
} from "@/lib/trust";
import {
  estimateLotSummary,
  parseProofBadges,
  proofBadgeLabel,
} from "@/lib/sale";

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

describe("lib/trust rural tags, availability, and badges", () => {
  it("validates and formats vendor and customer trust tags", () => {
    expect(isValidTrustTag("turned_up_on_time")).toBe(true);
    expect(isValidTrustTag("clear_instructions")).toBe(true);
    expect(isValidTrustTag("good_site_access")).toBe(true);
    expect(isValidTrustTag("not_a_tag")).toBe(false);
    expect(trustTagLabel("turned_up_on_time")).toBe("Turned up on time");
    expect(isCustomerTrustTag("prompt_payment")).toBe(true);
    expect(isCustomerTrustTag("clear_instructions")).toBe(true);
    expect(isCustomerTrustTag("turned_up_on_time")).toBe(false);
  });

  it("formats phone hrefs and detects Australian mobile numbers for 1-click SMS", () => {
    expect(formatPhoneHref("0421 572 245")).toBe("0421572245");
    expect(formatPhoneHref("02 6882 3259")).toBe("0268823259");
    expect(formatPhoneHref("")).toBeNull();
    expect(isAustralianMobile("0421 572 245")).toBe(true);
    expect(isAustralianMobile("+61 421 572 245")).toBe(true);
    expect(isAustralianMobile("02 6882 3259")).toBe(false);
  });

  it("validates and formats deal types, insurances, and role tags", () => {
    expect(isValidDealType("bought_item")).toBe(true);
    expect(dealTypeLabel("bought_item")).toContain("Bought");
    expect(isValidInsuranceBadge("public_liability")).toBe(true);
    expect(insuranceBadgeLabel("public_liability")).toBe("Public Liability Insured");
    expect(isValidRoleTag("fencing_contractor")).toBe(true);
    expect(isValidRoleTag("earthmoving_dam_contractor")).toBe(true);
    expect(isValidRoleTag("bore_water_driller")).toBe(true);
    expect(roleTagLabel("fencing_contractor")).toBe("Fencing Contractor");
  });

  it("validates and returns availability status info", () => {
    expect(isValidAvailabilityStatus("available")).toBe(true);
    expect(isValidAvailabilityStatus("booked_out")).toBe(true);
    expect(isValidAvailabilityStatus("unknown")).toBe(false);
    expect(availabilityStatusInfo("booked_out").shortLabel).toBe("Booked out");
    expect(availabilityStatusInfo(null).shortLabel).toBe("Available now");
  });
});

describe("lib/trust business claim ownership auto-verification", () => {
  it("normalises Australian phone numbers and extracts custom business domains", () => {
    expect(normalisePhoneDigits("+61 421 572 245")).toBe("0421572245");
    expect(normalisePhoneDigits("02 6362 9258")).toBe("0263629258");
    expect(extractBusinessDomain("info@langsfencing.com.au")).toBe(
      "langsfencing.com.au"
    );
    expect(
      extractBusinessDomain("https://www.langsfencing.com.au/contact")
    ).toBe("langsfencing.com.au");
    expect(extractBusinessDomain("contractor@gmail.com")).toBeNull();
  });

  it("auto-approves when login email matches the registered business email or custom domain", () => {
    const exactMatch = evaluateClaimAutoVerification({
      claimantEmail: "admin@centralwestfencing.com.au",
      businessName: "Central West Rural Fencing",
      businessEmail: "admin@centralwestfencing.com.au",
      businessWebsite: "https://centralwestfencing.com.au",
      businessPhone: "0421 572 245",
      businessAbn: null,
      submittedPhone: "",
    });
    expect(exactMatch.autoApprove).toBe(true);
    expect(exactMatch.method).toBe("email_domain");
    expect(exactMatch.emailMatchesFile).toBe(true);

    const domainMatch = evaluateClaimAutoVerification({
      claimantEmail: "dave@langsfencing.com.au",
      businessName: "Langs Rural Fencing Contractors",
      businessEmail: "office@langsfencing.com.au",
      businessWebsite: "https://www.langsfencing.com.au",
      businessPhone: "0428 637 315",
      businessAbn: null,
      submittedPhone: "",
    });
    expect(domainMatch.autoApprove).toBe(true);
    expect(domainMatch.method).toBe("email_domain");
    expect(domainMatch.domainMatchesFile).toBe(true);
  });

  it("auto-approves when valid ABN matches ABR entity name or registered phone number", () => {
    const abnEntityMatch = evaluateClaimAutoVerification({
      claimantEmail: "dave.lang@gmail.com",
      businessName: "Langs Rural Fencing Contractors",
      businessEmail: null,
      businessWebsite: null,
      businessPhone: "0428 637 315",
      businessAbn: null,
      submittedPhone: "0400 000 000",
      submittedAbn: "51 824 753 556",
      abrIsActive: true,
      abrEntityName: "LANGS RURAL FENCING CONTRACTORS PTY LTD",
    });
    expect(abnEntityMatch.autoApprove).toBe(true);
    expect(abnEntityMatch.method).toBe("abn_match");

    const abnPhoneMatch = evaluateClaimAutoVerification({
      claimantEmail: "owner@bigpond.com",
      businessName: "Dubbo Rural Contracting",
      businessEmail: null,
      businessWebsite: null,
      businessPhone: "0428 637 315",
      businessAbn: null,
      submittedPhone: "+61 428 637 315",
      submittedAbn: "51 824 753 556",
      abrIsActive: true,
      abrEntityName: null,
    });
    expect(abnPhoneMatch.autoApprove).toBe(true);
    expect(abnPhoneMatch.method).toBe("abn_match");
    expect(abnPhoneMatch.phoneMatchesFile).toBe(true);
  });

  it("routes unverified free-webmail claims without ABN match to manual admin review", () => {
    const manualReview = evaluateClaimAutoVerification({
      claimantEmail: "someone@gmail.com",
      businessName: "Central West Rural Fencing",
      businessEmail: "office@centralwestfencing.com.au",
      businessWebsite: "https://centralwestfencing.com.au",
      businessPhone: "0421 572 245",
      businessAbn: null,
      submittedPhone: "0499 999 999",
    });
    expect(manualReview.autoApprove).toBe(false);
    expect(manualReview.method).toBe("admin_approval");
  });
});

describe("lib/sale proof badges and lot/truck deck estimator", () => {
  it("parses and labels proof & biosecurity badges", () => {
    expect(parseProofBadges(["pic_available", "nvd_ready", "bogus"])).toEqual([
      "pic_available",
      "nvd_ready",
    ]);
    expect(proofBadgeLabel("shedded_rain_free")).toBe("Shedded / Rain-Free");
  });

  it("estimates total lot value and truck loads for bales, tonnes, and head", () => {
    const bales = estimateLotSummary({
      price_cents: 12000,
      price_type: "per_bale",
      quantity: 80,
      unit: "bales",
    });
    expect(bales.totalLotText).toContain("$9,600");
    expect(bales.truckEstimateText).toContain("B-double");

    const grain = estimateLotSummary({
      price_cents: 35000,
      price_type: "per_tonne",
      quantity: 120,
      unit: "tonnes",
    });
    expect(grain.totalLotText).toContain("$42,000");
    expect(grain.truckEstimateText).toContain("B-double");
  });
});


