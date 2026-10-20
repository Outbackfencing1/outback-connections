import { describe, expect, it } from "vitest";
import {
  availabilityStatusInfo,
  buildSpecificTrustChecks,
  contractorEquipmentLabel,
  dealTypeLabel,
  evaluateClaimAutoVerification,
  extractBusinessDomain,
  formatAbn,
  formatBelievableAvailability,
  formatPhoneHref,
  insuranceBadgeLabel,
  isAustralianMobile,
  isCompletedWorkReview,
  isCustomerTrustTag,
  isValidAvailabilityStatus,
  isValidAustralianAbn,
  isValidDealType,
  isValidInsuranceBadge,
  isValidRoleTag,
  isValidTrustTag,
  normaliseAbn,
  normalisePhoneDigits,
  partitionReviewsAndVouches,
  preferredJobSizeLabel,
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
    expect(contractorEquipmentLabel("post_driver_hydraulic")).toBe("Hydraulic Post Driver");
    expect(preferredJobSizeLabel("medium_1km_to_5km")).toContain("1–5 km");
  });

  it("validates and returns availability status info", () => {
    expect(isValidAvailabilityStatus("available")).toBe(true);
    expect(isValidAvailabilityStatus("booked_out")).toBe(true);
    expect(isValidAvailabilityStatus("unknown")).toBe(false);
    expect(availabilityStatusInfo("booked_out").shortLabel).toBe("Booked out");
    expect(availabilityStatusInfo(null).shortLabel).toBe("Available now");
  });

  it("formats believable availability with freshness dates and 45-day staleness guard", () => {
    const now = new Date("2026-10-18T10:00:00Z");

    const takingBookings = formatBelievableAvailability({
      availabilityStatus: "available",
      availabilityNote: null,
      availabilityUpdatedAt: "2026-10-15T10:00:00Z",
      ownerConfirmed: true,
      now,
    });
    expect(takingBookings.headline).toBe("Taking bookings");
    expect(takingBookings.isStale).toBe(false);
    expect(takingBookings.updatedText).toContain("15 Oct 2026");

    const bookedUntilNov = formatBelievableAvailability({
      availabilityStatus: "booked_out",
      availabilityNote: "November",
      availabilityUpdatedAt: "2026-10-12T10:00:00Z",
      ownerConfirmed: true,
      now,
    });
    expect(bookedUntilNov.headline).toBe("Booked until November");
    expect(bookedUntilNov.statusKind).toBe("booked_until");
    expect(bookedUntilNov.isStale).toBe(false);

    const stale = formatBelievableAvailability({
      availabilityStatus: "available",
      availabilityNote: null,
      availabilityUpdatedAt: "2026-07-01T10:00:00Z",
      ownerConfirmed: true,
      now,
    });
    expect(stale.headline).toBe("Availability not recently confirmed");
    expect(stale.isStale).toBe(true);
    expect(stale.updatedText).toContain("Last updated");

    const unclaimed = formatBelievableAvailability({
      availabilityStatus: "available",
      availabilityUpdatedAt: "2026-10-15T10:00:00Z",
      ownerConfirmed: false,
      now,
    });
    expect(unclaimed.headline).toBe("Availability not recently confirmed");
    expect(unclaimed.isStale).toBe(true);
  });
});

describe("lib/trust business claim ownership auto-verification (Scamwatch aligned)", () => {
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

  it("does NOT auto-approve an ABN match alone without matching business phone or email/domain (Scamwatch guard)", () => {
    const abnOnlyWithoutPhoneMatch = evaluateClaimAutoVerification({
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
    expect(abnOnlyWithoutPhoneMatch.autoApprove).toBe(false);
    expect(abnOnlyWithoutPhoneMatch.method).toBe("admin_approval");
    expect(abnOnlyWithoutPhoneMatch.abnDetailsChecked).toBe(true);
    expect(abnOnlyWithoutPhoneMatch.reason).toContain("Scamwatch");

    const abnPlusPhoneMatch = evaluateClaimAutoVerification({
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
    expect(abnPlusPhoneMatch.autoApprove).toBe(true);
    expect(abnPlusPhoneMatch.method).toBe("abn_match");
    expect(abnPlusPhoneMatch.phoneMatchesFile).toBe(true);
    expect(abnPlusPhoneMatch.abnDetailsChecked).toBe(true);
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
    expect(manualReview.abnDetailsChecked).toBe(false);
  });
});

describe("lib/trust 4-tier specific trust checks and review vs vouch separation", () => {
  it("separates owner confirmed, ABN details checked, insurance self-declared, and insurance document checked", () => {
    const now = new Date("2026-10-18T10:00:00Z");
    const checks = buildSpecificTrustChecks({
      hasBusinessRecord: true,
      claimStatus: "claimed",
      claimedAt: "2026-10-10T09:00:00Z",
      abn: "51824753556",
      abnVerified: true,
      abnEntityName: "ORANGE FENCING PTY LTD",
      abnVerifiedAt: "2026-10-10T09:00:00Z",
      insurancesHeld: ["public_liability"],
      insuranceVerifiedAt: "2026-10-11T09:00:00Z",
      insuranceExpiryDate: "2027-06-30",
      now,
    });

    expect(checks).toHaveLength(4);
    expect(checks[0].key).toBe("owner_confirmed");
    expect(checks[0].status).toBe("verified");
    expect(checks[1].key).toBe("abn_details_checked");
    expect(checks[1].status).toBe("verified");
    expect(checks[1].detail).toContain("does not by itself prove business control");
    expect(checks[2].key).toBe("insurance_self_declared");
    expect(checks[2].status).toBe("self_declared");
    expect(checks[3].key).toBe("insurance_document_checked");
    expect(checks[3].status).toBe("verified");
    expect(checks[3].detail).toContain("Expires");

    const expiredChecks = buildSpecificTrustChecks({
      hasBusinessRecord: true,
      claimStatus: "unclaimed",
      abn: "51824753556",
      abnVerified: true,
      insurancesHeld: ["public_liability"],
      insuranceVerifiedAt: "2025-05-01T09:00:00Z",
      insuranceExpiryDate: "2026-05-01",
      now,
    });
    expect(expiredChecks[0].status).toBe("unverified");
    expect(expiredChecks[3].status).toBe("expired");
  });

  it("prevents quick neighbour vouches from turning into 5-star completed-work reviews", () => {
    const rows = [
      {
        id: "1",
        created_at: "2026-10-15T00:00:00Z",
        reviewer_display_name: "Tom B.",
        reviewer_postcode: "2800",
        rating: 5,
        would_recommend: true,
        deal_type: "general",
        tags: ["turned_up_on_time"],
        comment: null,
        vendor_reply: null,
        vendor_replied_at: null,
      },
      {
        id: "2",
        created_at: "2026-10-16T00:00:00Z",
        reviewer_display_name: "Sarah M.",
        reviewer_postcode: "2795",
        rating: 4,
        would_recommend: true,
        deal_type: "fencing_service",
        tags: ["quality_fencing", "turned_up_on_time"],
        comment: "Put up 3.2km of hinge joint and strainer assemblies near Bathurst. Very tidy work.",
        vendor_reply: "Thanks Sarah, appreciate the work.",
        vendor_replied_at: "2026-10-17T00:00:00Z",
      },
    ];

    expect(isCompletedWorkReview(rows[0])).toBe(false);
    expect(isCompletedWorkReview(rows[1])).toBe(true);

    const partitioned = partitionReviewsAndVouches(rows);
    expect(partitioned.completedReviewCount).toBe(1);
    expect(partitioned.vouchCount).toBe(1);
    // Star rating must reflect ONLY the completed-work review (4.0), not the 5-star quick vouch!
    expect(partitioned.avgRating).toBe(4);
    expect(partitioned.recommendPct).toBe(100);
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


