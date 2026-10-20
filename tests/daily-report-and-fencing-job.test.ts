import { describe, expect, it } from "vitest";
import {
  detectStreetAddressInPublicText,
  formatFencingJobSpecSummary,
  redactStreetAddressForPublicDisplay,
  sanitisePublicFarmLocation,
} from "@/lib/fencing-job";
import {
  buildDailyOperatorReport,
  formatDailyReportPlainText,
  runDataQualityChecks,
} from "@/lib/daily-report";

describe("lib/fencing-job structured brief & private farm address guard", () => {
  it("formats a structured fencing job brief", () => {
    const brief = formatFencingJobSpecSummary({
      fenceType: "hinge_joint",
      approxLength: "2km_to_5km",
      timing: "within_1_month",
      materialsStatus: "materials_on_farm",
      terrainNotes: "Undulating basalt country near Cargo",
      photoUrls: ["https://example.com/fence.jpg"],
    });

    expect(brief).toContain("[Fencing Job Brief]");
    expect(brief).toContain("Hinge Joint");
    expect(brief).toContain("2 km – 5 km");
    expect(brief).toContain("Within the next month");
    expect(brief).toContain("Materials on farm");
    expect(brief).toContain("https://example.com/fence.jpg");
  });

  it("detects and redacts exact farm street/road addresses while keeping town & postcode", () => {
    const sample =
      "Need 3km boundary fence at 1425 Cargo Road near Orange 2800 before November.";
    expect(detectStreetAddressInPublicText(sample)).toBe(true);

    const redacted = redactStreetAddressForPublicDisplay(sample);
    expect(redacted).not.toContain("1425 Cargo Road");
    expect(redacted).toContain("[Private property address redacted]");
    expect(redacted).toContain("Orange 2800");

    expect(
      sanitisePublicFarmLocation({
        suburbOrTown: "76 Astill Drive Orange",
        postcode: "2800",
        state: "NSW",
      })
    ).toBe("Astill NSW 2800");
  });
});

describe("lib/daily-report data-quality checks and daily operator report", () => {
  const now = new Date("2026-10-18T08:00:00Z");

  it("flags duplicate phones, duplicate ABNs, state/postcode mismatches, and expired insurance", () => {
    const issues = runDataQualityChecks(
      [
        {
          id: "biz-1",
          trading_name: "Orange Rural Fencing",
          postcode: "2800",
          state: "NSW",
          abn: "51 824 753 556",
          contact_phone: "0428 637 315",
          claim_status: "claimed",
          insurance_verified_at: "2025-01-10T00:00:00Z",
          insurance_expiry_date: "2026-01-10",
        },
        {
          id: "biz-2",
          trading_name: "Central West Fencing Co",
          postcode: "2795",
          state: "QLD", // mismatch: 2795 is Bathurst NSW
          abn: "51824753556", // duplicate ABN
          contact_phone: "+61 428 637 315", // duplicate phone
          claim_status: "unclaimed",
        },
      ],
      now
    );

    const kinds = issues.map((i) => i.kind);
    expect(kinds).toContain("duplicate_phone");
    expect(kinds).toContain("duplicate_abn");
    expect(kinds).toContain("postcode_state_mismatch");
    expect(kinds).toContain("expired_insurance");
  });

  it("builds the daily operator report with >48h unanswered enquiries, stale availability, and Central West milestone", () => {
    const report = buildDailyOperatorReport({
      now,
      enquiries: [
        {
          id: "e1",
          anonymised_id: "ENQ-101",
          listing_title: "Bathurst Fencing",
          customer_name: "Tom Grazier",
          postcode: "2795",
          status: "new",
          created_at: "2026-10-14T08:00:00Z", // >48h old
        },
        {
          id: "e2",
          anonymised_id: "ENQ-102",
          listing_title: "Orange Fencing",
          customer_name: "Sarah Pastoral",
          postcode: "2800",
          status: "forwarded",
          outcome: "responded",
          created_at: "2026-10-10T08:00:00Z",
        },
      ],
      pendingClaims: [
        {
          id: "c1",
          business_name: "Molong Fencing",
          claimant_email: "dave@gmail.com",
          verification_method: "admin_approval",
          created_at: "2026-10-17T08:00:00Z",
        },
      ],
      profiles: [
        {
          id: "p1",
          trading_name: "Orange Fencing",
          postcode: "2800",
          state: "NSW",
          claim_status: "claimed",
          availability_updated_at: "2026-10-15T00:00:00Z", // fresh
        },
        {
          id: "p2",
          trading_name: "Bathurst Fencing",
          postcode: "2795",
          state: "NSW",
          claim_status: "claimed",
          availability_updated_at: "2026-07-01T00:00:00Z", // stale (>45d)
        },
      ],
    });

    expect(report.unansweredEnquiries).toHaveLength(1);
    expect(report.confirmedMatches).toHaveLength(1);
    expect(report.pendingClaims).toHaveLength(1);
    expect(report.staleAvailabilityProfiles).toHaveLength(1);
    expect(report.localMilestone.orangeBathurstConfirmedContractors).toBe(2);
    expect(report.localMilestone.confirmedHelpfulMatches).toBe(1);

    const text = formatDailyReportPlainText(report);
    expect(text).toContain("Owner-confirmed profiles:     2 / 10");
    expect(text).toContain("Enquirer-reported responses:  1 / 5 (reported reply, not job completion)");
    expect(text).toContain("ENQ-101");
  });
});
