import { describe, expect, it } from "vitest";
import {
  buildDirectoryRecord,
  classifyRuralHubCandidate,
} from "@/lib/directory-records";
import { isExcludedMetroPostcode } from "@/lib/rural-postcodes";
import {
  DARYL_HANDOFF_STATES,
  HUB_TASK_STATES,
  OUTREACH_TEMPLATES,
  formatSalesMetaNote,
  mergeDurableOutreachMeta,
  outreachStatusToSalesStage,
  parseSalesMetaFromNote,
} from "@/lib/outreach-statuses";
import {
  OUTBACK_CLIPGUN_BUNDLES,
  OUTBACK_FENCING_AND_ACCESSORY_PRODUCTS,
  buildDarylHandoffSummary,
} from "@/lib/outback-products";
import {
  ALI_DAILY_SCHEDULE,
  ALI_FALLBACK_LADDER,
  ALI_STARTER_QUEUE,
  CENTRAL_WEST_TOWNS,
  HUB_SOURCE_REGISTER,
  evaluateCategoryTownReadiness,
} from "@/lib/hub-growth-queue";
import {
  buildDailyOperatorReport,
  formatDailyReportPlainText,
} from "@/lib/daily-report";
import { parseTradeClick, tradeOfferDestination } from "@/lib/trade-offer";
import { consolidateAndEvaluateCandidates } from "../scraper/dedupe-and-match";
import { buildPrivacySafeImportPayload } from "../scraper/export";
import { normaliseAustralianPhone } from "../scraper/normalise";

const meta = {
  enteredBy: "ali-coordinator",
  enteredVia: "hub_test",
  enteredAt: "2026-10-20T00:00:00.000Z",
};

describe("Audit Fixes & Rural Hub Growth Coordinator Operating System", () => {
  it("1. classifies non-fencing rural services (mechanics, bore drillers, plumbers, carriers) as belonging in the free hub with zero product penalty", () => {
    const mechanic = classifyRuralHubCandidate({
      name: "Central West Mobile Diesel & Ag Repairs",
      vertical: "service",
      categorySlug: "mobile-diesel-mechanic",
      postcode: "2800",
      state: "NSW",
      sourceUrl: "https://cwdieselrepairs.com.au",
      platform: "official_website",
    });
    expect(mechanic.hubBelongs).toBe(true);
    expect(mechanic.evidenceSufficient).toBe(true);
    expect(mechanic.productOpportunity).toBe("none");

    const boreDriller = classifyRuralHubCandidate({
      name: "Lachlan Valley Bore Drilling & Solar Pumps",
      vertical: "service",
      categorySlug: "bore-water-and-pumps",
      postcode: "2871",
      state: "NSW",
      sourceUrl: "https://lachlanbores.com.au",
      platform: "official_website",
    });
    expect(boreDriller.hubBelongs).toBe(true);
    expect(boreDriller.evidenceSufficient).toBe(true);
    expect(boreDriller.productOpportunity).toBe("none");

    const fencer = classifyRuralHubCandidate({
      name: "Molong Boundary & Exclusion Fencing",
      vertical: "service",
      categorySlug: "fencing-contractor",
      postcode: "2866",
      state: "NSW",
      sourceUrl: "https://molongfencing.com.au",
      platform: "official_website",
    });
    expect(fencer.hubBelongs).toBe(true);
    expect(fencer.evidenceSufficient).toBe(true);
    expect(fencer.productOpportunity).toBe("fencing_trade");
  });

  it("2. preserves metro office_postcode and office_suburb separately from rural service_postcode without falsifying office location", () => {
    const res = buildDirectoryRecord(
      {
        name: "Hawkesbury & Tablelands Farm Fencing",
        vertical: "service",
        category_slug: "fencing-contractor",
        postcode: "2750", // Penrith (metro)
        suburb: "Penrith",
        state: "NSW",
        service_postcode: "2795", // Bathurst (rural service area)
        service_suburb: "Bathurst & Central Tablelands",
        platform: "official_website",
        source_url: "https://hawkesburyfarmfencing.com.au",
        phone: "0412 345 678",
        email: "info@hawkesburyfarmfencing.com.au",
      },
      meta
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.record.postcode).toBe("2795");
    expect(res.record.raw_payload.office_postcode).toBe("2750");
    expect(res.record.raw_payload.office_suburb).toBe("Penrith");
    expect(res.record.raw_payload.service_postcode).toBe("2795");
    expect(res.record.raw_payload.location_basis).toBe("service_area_verified_metro_office");
    expect("phone" in res.record).toBe(false);
    expect("email" in res.record).toBe(false);
  });

  it("3. excludes LVR/PO Box ranges (1000-1999, 8000-9999) and capital CBDs regardless of state input", () => {
    expect(isExcludedMetroPostcode("1001", "NSW")).toBe(true);
    expect(isExcludedMetroPostcode("1999", "VIC")).toBe(true);
    expect(isExcludedMetroPostcode("8001", "QLD")).toBe(true);
    expect(isExcludedMetroPostcode("9000", "QLD")).toBe(true);
    expect(isExcludedMetroPostcode("2000", "VIC")).toBe(true);
    expect(isExcludedMetroPostcode("3000", "NSW")).toBe(true);
    expect(isExcludedMetroPostcode("2800", "NSW")).toBe(false); // Orange NSW
    expect(isExcludedMetroPostcode("0870", "NT")).toBe(false); // Alice Springs NT
  });

  it("4. maps 'joined' outreach status to 'Profile claimed' (directory participation), never 'Won'", () => {
    expect(outreachStatusToSalesStage("joined")).toBe("Profile claimed");
    expect(outreachStatusToSalesStage("joined")).not.toBe("Won");
  });

  it("5. durably preserves taskState, consent, and darylHandoff when a plain-text note is appended later", () => {
    const initialNote = formatSalesMetaNote({
      stage: "Contacted",
      taskState: "In progress",
      consent: "prospective_1to1",
      darylHandoff: "handed_to_daryl",
      customerFit: "Buyer + Installer Partner (Fencing Contractor)",
      relevantProduct: "18V Clip Gun — Full Kit ($1,699)",
      nextAction: "Daryl to confirm freight to 2830",
      note: "Contractor asked for Clip Gun Full Kit + 4 boxes of C24 clips.",
    });

    // Simulate staff adding a plain-text follow-up note without re-specifying metadata tags
    const mergedHistory = `${initialNote}\n---\nCalled back to confirm email address.`;
    const parsedFromHistory = parseSalesMetaFromNote(mergedHistory, "contacted");
    expect(parsedFromHistory.taskState).toBe("In progress");
    expect(parsedFromHistory.consent).toBe("prospective_1to1");
    expect(parsedFromHistory.darylHandoff).toBe("handed_to_daryl");
    expect(parsedFromHistory.relevantProduct).toBe("18V Clip Gun — Full Kit ($1,699)");

    // Simulate mergeDurableOutreachMeta when updating only the note text
    const updatedNote = mergeDurableOutreachMeta(
      initialNote,
      {
        note: "Spoke with owner; waiting on Daryl quote.",
      },
      "contacted"
    );
    const reParsed = parseSalesMetaFromNote(updatedNote, "contacted");
    expect(reParsed.taskState).toBe("In progress");
    expect(reParsed.consent).toBe("prospective_1to1");
    expect(reParsed.darylHandoff).toBe("handed_to_daryl");
    expect(reParsed.cleanNote).toBe("Spoke with owner; waiting on Daryl quote.");
  });

  it("6. defaults outreach templates to directory_only (no unsolicited product pitch) and formats Daryl handoffs cleanly", () => {
    expect(OUTREACH_TEMPLATES[0].id).toBe("directory_only");
    expect(OUTREACH_TEMPLATES[0].label).toContain("No Product Pitch");
    expect(HUB_TASK_STATES).toContain("Ready");
    expect(HUB_TASK_STATES).toContain("Needs review");
    expect(DARYL_HANDOFF_STATES.map((s) => s.value)).toEqual([
      "none",
      "handed_to_daryl",
      "quoted_by_sales",
      "order_placed",
      "paid",
      "fulfilled",
    ]);

    const handoffText = buildDarylHandoffSummary({
      customerName: "Mick Taylor",
      businessName: "Taylor Rural Contracting",
      suburbOrTown: "Forbes",
      state: "NSW",
      postcode: "2871",
      phone: "0428 000 111",
      email: "mick@taylorrural.com.au",
      productOrJobNotes: "10 rolls Fixed Knot 16/180/15 (200m) + 400-pack 180cm Bitumen Pickets",
      sourceListingSlugOrPage: "/services/listing/taylor-rural-contracting-2871",
      handedBy: "Ali",
    });
    expect(handoffText).toContain("[PRODUCT HANDOFF TO DARYL");
    expect(handoffText).toContain("Forbes NSW 2871");
    expect(handoffText).toContain("AUD inc GST");
  });

  it("7. centralises Outback Fencing product hierarchy (Full Kit $1,699 first, Skin Only $1,499 last) and live caveats", () => {
    expect(OUTBACK_CLIPGUN_BUNDLES[0].id).toBe("clipgun-full-kit");
    expect(OUTBACK_CLIPGUN_BUNDLES[0].priceAudIncGstDisplay).toBe("$1,699");
    const lastBundle = OUTBACK_CLIPGUN_BUNDLES[OUTBACK_CLIPGUN_BUNDLES.length - 1];
    expect(lastBundle.id).toBe("clipgun-skin-only");
    expect(lastBundle.priceAudIncGstDisplay).toBe("$1,499");

    const adaptor = OUTBACK_FENCING_AND_ACCESSORY_PRODUCTS.find(
      (p) => p.id === "milwaukee-m18-adaptor"
    );
    expect(adaptor?.staffCaveat).toContain("$40");
    expect(adaptor?.staffCaveat).toContain("$45");

    const fixedKnot = OUTBACK_FENCING_AND_ACCESSORY_PRODUCTS.find(
      (p) => p.id === "fixed-knot-16-180-15"
    );
    expect(fixedKnot?.checkoutMode).toBe("quote_via_daryl");
    expect(fixedKnot?.staffCaveat).toContain("DRAFT");
  });

  it("8. supports modest header and footer placements in /go/trade", () => {
    const headerClick = parseTradeClick(new URLSearchParams("to=store&from=header"));
    expect(headerClick).toEqual({
      target: "store",
      placement: "header",
      category: null,
    });
    expect(tradeOfferDestination(headerClick.target, headerClick.placement)).toContain(
      "utm_content=header"
    );

    const footerClick = parseTradeClick(new URLSearchParams("to=store&from=footer"));
    expect(footerClick.placement).toBe("footer");
  });

  it("9. provides Ali's 5-day starter backlog (A01-A06), 6-hour schedule, fallback ladder, source register, and readiness gate", () => {
    expect(ALI_STARTER_QUEUE.map((t) => t.code)).toEqual([
      "A01",
      "A02",
      "A03",
      "A04",
      "A05",
      "A06",
    ]);
    expect(ALI_DAILY_SCHEDULE).toHaveLength(5);
    expect(ALI_FALLBACK_LADDER.length).toBeGreaterThanOrEqual(4);
    expect(CENTRAL_WEST_TOWNS.map((t) => t.town)).toEqual([
      "Orange",
      "Bathurst",
      "Dubbo",
      "Parkes",
      "Forbes",
      "Cowra",
      "Mudgee",
    ]);

    const prohibited = HUB_SOURCE_REGISTER.filter((s) => s.status === "prohibited").map(
      (s) => s.id
    );
    expect(prohibited).toContain("google-maps-places");
    expect(prohibited).toContain("yellow-pages-truelocal");
    expect(prohibited).toContain("major-job-boards");

    const notReady = evaluateCategoryTownReadiness({
      categorySlug: "mobile-diesel-mechanic",
      regionLabel: "Parkes 2870",
      activeVerifiedListingsCount: 1,
      allHaveVerifiedSourceOrClaim: true,
      allRefreshedWithin60Days: true,
      mobileAndEnquiryFlowChecked: true,
    });
    expect(notReady.readyToPromote).toBe(false);
    expect(notReady.blockingGaps[0]).toContain("need at least 3");

    const ready = evaluateCategoryTownReadiness({
      categorySlug: "fencing-contractor",
      regionLabel: "Orange 2800",
      activeVerifiedListingsCount: 5,
      allHaveVerifiedSourceOrClaim: true,
      allRefreshedWithin60Days: true,
      mobileAndEnquiryFlowChecked: true,
    });
    expect(ready.readyToPromote).toBe(true);
  });

  it("10. daily report distinguishes 'reported reply, not job completion' and surfaces query errors/truncation", () => {
    const report = buildDailyOperatorReport({
      now: new Date("2026-10-20T08:00:00Z"),
      enquiries: [
        {
          id: "e1",
          anonymised_id: "ENQ-200",
          listing_title: "Dubbo Rural Fencing",
          customer_name: "Ben Grazier",
          postcode: "2830",
          status: "forwarded",
          outcome: "responded",
          created_at: "2026-10-18T08:00:00Z",
        },
      ],
      pendingClaims: [],
      profiles: [],
      queryErrors: ["profiles: simulated timeout"],
      enquiriesLimit: 1,
      page: 2,
    });

    expect(report.queryStatus.hasErrors).toBe(true);
    expect(report.queryStatus.truncated).toBe(true);
    expect(report.queryStatus.page).toBe(2);

    const text = formatDailyReportPlainText(report);
    expect(text).toContain("reported reply, not job completion");
    expect(text).toContain("DATA READ INCOMPLETE / ERROR");
    expect(text).toContain("profiles: simulated timeout");
  });

  it("11. scraper protects D & S Morgan / cross-state collisions and exports privacy-safe import records without top-level phone/email", async () => {
    const phone = normaliseAustralianPhone("0418 555 999")!;
    const dsMorganSighting = {
      sighting_id: "rotech:dsmorgan",
      source_id: "rotech_rural",
      source_name: "Rotech Rural Fencing Contractors",
      source_url: "https://rotechrural.com.au/fencing-contractors/",
      retrieved_at: "2026-10-20T00:00:00.000Z",
      business_name: "D & S Morgan",
      published_aliases: [],
      contact_names: ["Dave Morgan"],
      phones: [phone],
      public_email: "dave@dsmorgan.com.au",
      had_protected_email_placeholder: false,
      website_url: null,
      social_links: [],
      raw_base_locality: "Enfield",
      raw_base_state: "VIC",
      raw_base_postcode: "3352",
      base_location_established: true,
      published_service_areas: ["Enfield, VIC"],
      explicit_fencing_services: ["Rural fencing"],
      published_abn: null,
      evidence_references: [
        {
          source_name: "Rotech Rural",
          source_url: "https://rotechrural.com.au/fencing-contractors/",
          retrieved_at: "2026-10-20T00:00:00.000Z",
          excerpt: "D & S Morgan — Rural fencing in Enfield, VIC.",
          supports: "rural_relevance" as const,
        },
      ],
      website_check_notes: [],
      website_broken_or_parked: false,
    };

    // Even when DB snapshot is empty (e.g. anon RLS hid the Enfield NSW 2136 deleted_by_admin row),
    // D & S Morgan must be held in review rather than auto-seeded.
    const evalAnon = await consolidateAndEvaluateCandidates([dsMorganSighting], [], {
      useGeminiIfAvailable: false,
      dbCompleteness: "incomplete_anon",
    });
    expect(evalAnon.candidates[0].record_disposition).toBe("review");

    // And when the deleted_by_admin row is visible (even with state='NSW'), protection wins:
    const evalService = await consolidateAndEvaluateCandidates(
      [dsMorganSighting],
      [
        {
          id: "del-1",
          title: "D & S Morgan",
          postcode: "2136",
          state: "NSW",
          status: "deleted_by_admin",
          data_source: "scraped",
          user_id: null,
          business_id: "biz-del-1",
          source_platform: "web",
          source_url: "https://rotechrural.com.au/fencing-contractors/",
        },
      ],
      { useGeminiIfAvailable: false, dbCompleteness: "complete_service_role" }
    );
    expect(evalService.candidates[0].existing_protection_status).toBe(
      "protected_suppressed_or_removed"
    );
    expect(evalService.candidates[0].record_disposition).toBe("exclude");

    // Verify privacy-safe import payload for a valid new candidate
    const cleanSighting = {
      ...dsMorganSighting,
      sighting_id: "rotech:clean",
      business_name: "Molong High Tensile Rural Fencing",
      raw_base_locality: "Molong",
      raw_base_state: "NSW",
      raw_base_postcode: "2866",
      published_service_areas: ["Molong, NSW"],
      evidence_references: [
        {
          source_name: "Rotech Rural",
          source_url: "https://rotechrural.com.au/fencing-contractors/",
          retrieved_at: "2026-10-20T00:00:00.000Z",
          excerpt: "Molong High Tensile Rural Fencing — Rural fencing in Molong, NSW.",
          supports: "rural_relevance" as const,
        },
      ],
    };
    const cleanEval = await consolidateAndEvaluateCandidates([cleanSighting], [], {
      useGeminiIfAvailable: false,
      dbCompleteness: "complete_service_role",
    });
    expect(cleanEval.candidates[0].record_disposition).toBe("seed_new");

    const importRecords = buildPrivacySafeImportPayload(cleanEval.candidates);
    expect(importRecords).toHaveLength(1);
    expect("phone" in importRecords[0]).toBe(false);
    expect("email" in importRecords[0]).toBe(false);
    expect(importRecords[0].raw_payload.phone).toBeDefined();
    expect(importRecords[0].raw_payload.email).toBe("dave@dsmorgan.com.au");
  });
});
