import { describe, expect, it } from "vitest";
import { classifyCandidateDeterministic, verifyClassificationOutput } from "../scraper/classifier.ts";
import {
  consolidateAndEvaluateCandidates,
  type ExistingDatabaseListing,
} from "../scraper/dedupe-and-match.ts";
import { buildUnclaimedFencerDescription, isDescriptionCompliant } from "../scraper/descriptions.ts";
import {
  extractPublicEmail,
  formatPostcode4,
  normaliseAustralianPhone,
  validateAndResolveLocation,
} from "../scraper/normalise.ts";
import { isValidAbnChecksum, verifyCandidateAbn } from "../scraper/abn.ts";
import { parseWestonfenceHtml } from "../scraper/sources/westonfence.ts";
import { parseRotechRuralHtml } from "../scraper/sources/rotech-rural.ts";
import type { ClassificationResult, RawCandidateSighting } from "../scraper/types.ts";

function makeSighting(overrides: Partial<RawCandidateSighting>): RawCandidateSighting {
  const defaultPhone = normaliseAustralianPhone("0412 345 678", {
    contactName: "John Citizen",
    sourceUrl: "https://rotechrural.com.au/fencing-contractors/",
  })!;
  const businessName = overrides.business_name ?? "Example Rural Fencing";
  const excerpt =
    overrides.evidence_references?.[0]?.excerpt ??
    `${businessName} | Location: DUBBO, NSW | Contact: John Citizen | Phone: 0412 345 678`;

  return {
    sighting_id: "test:1",
    source_id: "rotech_rural",
    source_name: "Rotech Rural Fencing Contractors",
    source_url: "https://rotechrural.com.au/fencing-contractors/",
    retrieved_at: "2026-10-18T00:00:00.000Z",
    business_name: businessName,
    published_aliases: [],
    contact_names: ["John Citizen"],
    phones: [defaultPhone],
    public_email: null,
    had_protected_email_placeholder: false,
    website_url: null,
    social_links: [],
    raw_base_locality: "Dubbo",
    raw_base_state: "NSW",
    raw_base_postcode: "2830",
    base_location_established: true,
    published_service_areas: ["Dubbo, NSW"],
    explicit_fencing_services: [],
    published_abn: null,
    evidence_references: [
      {
        source_name: "Rotech Rural Fencing Contractors",
        source_url: "https://rotechrural.com.au/fencing-contractors/",
        retrieved_at: "2026-10-18T00:00:00.000Z",
        excerpt,
        supports: "rural_relevance",
      },
    ],
    website_check_notes: [],
    website_broken_or_parked: false,
    ...overrides,
  };
}

describe("Rural Fencing Contractor Pipeline — Section 9 Verification Suite", () => {
  it("1. includes a metro-based contractor that explicitly offers farm/rural fencing", () => {
    const metroFarmFencer = makeSighting({
      source_id: "official_website",
      business_name: "Hawkesbury & Sydney Acreage Farm Fencing",
      raw_base_locality: "Penrith",
      raw_base_state: "NSW",
      raw_base_postcode: "2750",
      published_service_areas: ["Hawkesbury", "Blue Mountains", "Central Tablelands"],
      explicit_fencing_services: ["Farm boundary fencing", "Cattle yards", "Post and rail fencing"],
      evidence_references: [
        {
          source_name: "Official Website",
          source_url: "https://hawkesburyfarmfencing.com.au/",
          retrieved_at: "2026-10-18T00:00:00.000Z",
          excerpt:
            "Hawkesbury & Sydney Acreage Farm Fencing installs farm boundary fencing, cattle yards, and post and rail fencing across rural properties.",
          supports: "rural_relevance",
        },
      ],
    });

    const classification = classifyCandidateDeterministic(metroFarmFencer);
    expect(classification.decision).toBe("include");
    expect(classification.supported_rural_specialties).toContain("Rural fencing");
    expect(classification.supported_rural_specialties).toContain(
      "Boundary & internal paddock fencing"
    );
    expect(classification.supported_rural_specialties).toContain("Cattle & sheep yards");
    expect(classification.supported_rural_specialties).toContain("Post and rail fencing");
  });

  it("2. excludes a regional pool-only or urban balustrade-only installer", () => {
    const regionalPoolFencer = makeSighting({
      source_id: "official_website",
      business_name: "Dubbo Glass Pool Fencing & Balustrades",
      raw_base_locality: "Dubbo",
      raw_base_state: "NSW",
      raw_base_postcode: "2830",
      explicit_fencing_services: [
        "Frameless glass pool fencing",
        "Aluminium pool panels",
        "Stair balustrades",
      ],
      evidence_references: [
        {
          source_name: "Official Website",
          source_url: "https://dubbopoolfencing.com.au/",
          retrieved_at: "2026-10-18T00:00:00.000Z",
          excerpt:
            "Dubbo Glass Pool Fencing & Balustrades specialises in frameless glass pool fencing and residential stair balustrades in Dubbo NSW.",
          supports: "rural_relevance",
        },
      ],
    });

    const classification = classifyCandidateDeterministic(regionalPoolFencer);
    expect(classification.decision).toBe("exclude");
    expect(classification.supported_rural_specialties).toEqual([]);
  });

  it("3. includes a mixed residential/rural operator with only supported rural specialties", () => {
    const mixedFencer = makeSighting({
      source_id: "official_website",
      business_name: "Riverina Rural & Residential Fencing",
      raw_base_locality: "Wagga Wagga",
      raw_base_state: "NSW",
      raw_base_postcode: "2650",
      explicit_fencing_services: [
        "Colorbond residential fences",
        "Hinge joint sheep and cattle fencing",
        "Exclusion fencing for wild dogs",
      ],
      evidence_references: [
        {
          source_name: "Official Website",
          source_url: "https://riverinafencing.com.au/",
          retrieved_at: "2026-10-18T00:00:00.000Z",
          excerpt:
            "Riverina Rural & Residential Fencing builds Colorbond residential fences as well as hinge joint sheep and cattle fencing and exclusion fencing for wild dogs across the Riverina.",
          supports: "rural_relevance",
        },
      ],
    });

    const classification = classifyCandidateDeterministic(mixedFencer);
    expect(classification.decision).toBe("include");
    expect(classification.supported_rural_specialties).toContain(
      "High tensile & plain/barbed wire fencing"
    );
    expect(classification.supported_rural_specialties).toContain("Exclusion fencing");
    expect(classification.supported_rural_specialties).toContain(
      "Livestock, cattle, sheep & horse fencing"
    );
    // Must not fabricate unsupported rural specialties
    expect(classification.supported_rural_specialties).not.toContain("Cattle & sheep yards");
    expect(classification.supported_rural_specialties).not.toContain("Post and rail fencing");
  });

  it("4. routes a generic fencing or contracting listing without explicit rural evidence to review", () => {
    const genericFencer = makeSighting({
      source_id: "web_directory",
      business_name: "Forbes General Fencing",
      raw_base_locality: "Forbes",
      raw_base_state: "NSW",
      raw_base_postcode: "2871",
      explicit_fencing_services: [],
      evidence_references: [
        {
          source_name: "Local Directory",
          source_url: "https://example.org/forbes-fencing",
          retrieved_at: "2026-10-18T00:00:00.000Z",
          excerpt: "Forbes General Fencing — Contact Sam on 0412 345 678 in Forbes NSW.",
          supports: "rural_relevance",
        },
      ],
    });

    const classification = classifyCandidateDeterministic(genericFencer);
    expect(classification.decision).toBe("review");
  });

  it("5. does not accept a materials-only supplier or retail warehouse as an installer", () => {
    const materialsSupplier = makeSighting({
      source_id: "official_website",
      business_name: "Central West Fencing Warehouse",
      raw_base_locality: "Orange",
      raw_base_state: "NSW",
      raw_base_postcode: "2800",
      explicit_fencing_services: ["Fencing supplies only", "Wholesale wire and pickets"],
      evidence_references: [
        {
          source_name: "Official Website",
          source_url: "https://cwfencingwarehouse.com.au/",
          retrieved_at: "2026-10-18T00:00:00.000Z",
          excerpt:
            "Central West Fencing Warehouse is a fencing supplies only and materials supplier store with no installation service.",
          supports: "rural_relevance",
        },
      ],
    });

    const classification = classifyCandidateDeterministic(materialsSupplier);
    expect(classification.decision).toBe("exclude");
    expect(classification.supported_rural_specialties).toEqual([]);
  });

  it("6. does not automatically merge conflicting distinct businesses that share a phone number", async () => {
    const sharedPhone = normaliseAustralianPhone("0411 222 333")!;
    const sightingA = makeSighting({
      sighting_id: "s:a",
      business_name: "Lachlan Valley Rural Fencing",
      raw_base_locality: "Forbes",
      raw_base_state: "NSW",
      raw_base_postcode: "2871",
      phones: [sharedPhone],
    });
    const sightingB = makeSighting({
      sighting_id: "s:b",
      business_name: "Macquarie Plains Earthmoving & Rural Fencing",
      raw_base_locality: "Bathurst",
      raw_base_state: "NSW",
      raw_base_postcode: "2795",
      phones: [sharedPhone],
    });

    const { candidates } = await consolidateAndEvaluateCandidates([sightingA, sightingB], [], {
      useGeminiIfAvailable: false,
    });
    expect(candidates.length).toBe(2);
    expect(candidates[0].record_disposition).toBe("review");
    expect(candidates[1].record_disposition).toBe("review");
    expect(candidates[0].disposition_reasons.join(" ")).toContain(
      "Phone number is shared with another distinct business name"
    );
  });

  it("7. identifies likely matching businesses with different phones or conflicting towns for review", async () => {
    const wimmeraWeston = makeSighting({
      sighting_id: "weston:wimmera",
      source_id: "westonfence",
      source_name: "Westonfence Accredited Installers",
      source_url: "https://westonfence.com.au/accredited-installers/",
      business_name: "Wimmera Rural Fencing",
      contact_names: ["Dan Gibson"],
      phones: [normaliseAustralianPhone("0429 111 066", { contactName: "Dan Gibson" })!],
      website_url: "https://wimmerarural.com/",
      raw_base_locality: "Murtoa",
      raw_base_state: "VIC",
      raw_base_postcode: "3390",
      base_location_established: true,
      published_service_areas: ["Murtoa", "Horsham", "Rupanyup"],
      explicit_fencing_services: ["Rural fencing", "Exclusion fencing"],
    });
    const wimmeraRotech = makeSighting({
      sighting_id: "rotech:wimmera",
      source_id: "rotech_rural",
      source_name: "Rotech Rural Fencing Contractors",
      source_url: "https://rotechrural.com.au/fencing-contractors/",
      business_name: "Wimmera Rural Fencing",
      contact_names: ["Dan Gibson"],
      phones: [normaliseAustralianPhone("0493 149 294", { contactName: "Dan Gibson" })!],
      website_url: "https://wimmerarural.com/",
      raw_base_locality: "Kellalac",
      raw_base_state: "VIC",
      raw_base_postcode: "3393",
      base_location_established: true,
      published_service_areas: ["Kellalac, VIC"],
      explicit_fencing_services: ["Rural fencing"],
    });

    const { candidates } = await consolidateAndEvaluateCandidates(
      [wimmeraWeston, wimmeraRotech],
      [],
      { useGeminiIfAvailable: false }
    );
    expect(candidates.length).toBe(1);
    expect(candidates[0].record_disposition).toBe("review");
    expect(candidates[0].phones.map((p) => p.normalised_e164).sort()).toEqual([
      "+61429111066",
      "+61493149294",
    ]);
    expect(candidates[0].disposition_reasons.join(" ")).toContain("conflicting");
  });

  it("8. verifier strips any unsupported specialties or non-verbatim evidence quotes", () => {
    const sighting = makeSighting({
      business_name: "Monaro Rural Fencing",
      raw_base_locality: "Cooma",
      raw_base_state: "NSW",
      raw_base_postcode: "2630",
      explicit_fencing_services: ["Exclusion fencing"],
      evidence_references: [
        {
          source_name: "Westonfence Accredited Installers",
          source_url: "https://westonfence.com.au/accredited-installers/",
          retrieved_at: "2026-10-18T00:00:00.000Z",
          excerpt:
            "Monaro Rural Fencing in Cooma NSW specialises in electric fencing and pest exclusion fencing.",
          supports: "specialty",
        },
      ],
    });

    const rawClassification: ClassificationResult = {
      decision: "include",
      reason: "Test LLM classification",
      supported_rural_specialties: [
        "Exclusion fencing",
        "Electric livestock fencing",
        "Cattle & sheep yards", // Hallucinated specialty not in source text
      ],
      evidence_references: [
        {
          source_url: sighting.source_url,
          excerpt: "specialises in electric fencing and pest exclusion fencing.",
        },
        {
          source_url: sighting.source_url,
          excerpt: "We also build heavy steel cattle yards across NSW.", // Non-verbatim hallucination
        },
      ],
      unresolved_questions: [],
      classifier_mode: "gemini",
    };

    const verified = verifyClassificationOutput(rawClassification, sighting);
    expect(verified.supported_rural_specialties).toContain("Exclusion fencing");
    expect(verified.supported_rural_specialties).toContain("Electric livestock fencing");
    expect(verified.supported_rural_specialties).not.toContain("Cattle & sheep yards");
    expect(verified.evidence_references.length).toBe(1);
    expect(verified.evidence_references[0].excerpt).toBe(
      "specialises in electric fencing and pest exclusion fencing."
    );
  });

  it("9. protects claimed and suppressed database listings from being overwritten", async () => {
    const candidateSighting = makeSighting({
      business_name: "Outback Boundary Rural Fencing",
      raw_base_locality: "Dubbo",
      raw_base_state: "NSW",
      raw_base_postcode: "2830",
      website_url: "https://outbackboundaryfencing.com.au/",
      explicit_fencing_services: ["Rural fencing", "Boundary fencing"],
    });

    const claimedDbListing: ExistingDatabaseListing = {
      id: "11111111-2222-3333-4444-555555555555",
      slug: "outback-boundary-rural-fencing-2830",
      title: "Outback Boundary Rural Fencing",
      postcode: "2830",
      state: "NSW",
      status: "active",
      data_source: "claimed",
      user_id: "99999999-8888-7777-6666-555555555555",
      business_id: "88888888-7777-6666-5555-444444444444",
      source_platform: "official_website",
      source_url: "https://outbackboundaryfencing.com.au/",
      business: {
        id: "88888888-7777-6666-5555-444444444444",
        claim_status: "claimed",
        website_url: "https://outbackboundaryfencing.com.au/",
        suburb: "Dubbo",
      },
    };

    const { candidates } = await consolidateAndEvaluateCandidates(
      [candidateSighting],
      [claimedDbListing],
      { useGeminiIfAvailable: false }
    );
    expect(candidates.length).toBe(1);
    expect(candidates[0].existing_protection_status).toBe("protected_claimed_profile");
    expect(candidates[0].record_disposition).toBe("exclude");

    const suppressedDbListing: ExistingDatabaseListing = {
      ...claimedDbListing,
      status: "deleted_by_admin",
      data_source: "scraped",
      user_id: null,
      business: null,
    };
    const suppressedRun = await consolidateAndEvaluateCandidates(
      [candidateSighting],
      [suppressedDbListing],
      { useGeminiIfAvailable: false }
    );
    expect(suppressedRun.candidates[0].existing_protection_status).toBe(
      "protected_suppressed_or_removed"
    );
    expect(suppressedRun.candidates[0].record_disposition).toBe("exclude");
  });

  it("10. preserves leading-zero postcodes (0800 Darwin NT, 0870 Alice Springs NT) as 4-character strings", () => {
    expect(formatPostcode4(800)).toBe("0800");
    expect(formatPostcode4(870)).toBe("0870");
    expect(formatPostcode4("0800")).toBe("0800");

    const darwin = validateAndResolveLocation({
      locality: "Darwin",
      state: "NT",
      postcode: "0800",
      baseLocationEstablished: true,
    });
    expect(darwin.status).toBe("valid_confirmed");
    expect(darwin.postcode).toBe("0800");
    expect(darwin.postcode?.length).toBe(4);

    const alice = validateAndResolveLocation({
      locality: "Alice Springs",
      state: "NT",
      postcode: null,
      baseLocationEstablished: true,
    });
    expect(alice.status).toBe("valid_confirmed");
    expect(alice.postcode).toBe("0870");
    expect(alice.postcode?.length).toBe(4);
  });

  it("11. is idempotent: rerunning the same input produces no duplicate candidates", async () => {
    const s1 = makeSighting({
      business_name: "Goulburn Valley Rural Fencing",
      raw_base_locality: "Echuca",
      raw_base_state: "VIC",
      raw_base_postcode: "3564",
      explicit_fencing_services: ["Rural fencing"],
    });

    const firstRun = await consolidateAndEvaluateCandidates([s1], [], {
      useGeminiIfAvailable: false,
    });
    const secondRun = await consolidateAndEvaluateCandidates([s1, { ...s1 }], [], {
      useGeminiIfAvailable: false,
    });

    expect(firstRun.candidates.length).toBe(1);
    expect(secondRun.candidates.length).toBe(1);
    expect(secondRun.exactRepeatSightingsDropped).toBe(1);
    expect(secondRun.candidates[0].candidate_id).toBe(firstRun.candidates[0].candidate_id);
  });

  it("12. never treats ABN API failure, missing GUID, or website timeout as business closure", async () => {
    expect(isValidAbnChecksum("32 674 471 115")).toBe(true);
    expect(isValidAbnChecksum("32 674 471 116")).toBe(false);

    const noGuidResult = await verifyCandidateAbn({
      publishedAbn: "32 674 471 115",
      businessName: "Rigg Contracting",
      guid: "",
    });
    expect(noGuidResult.status).toBe("unchecked_no_guid");
    expect(noGuidResult.status).not.toBe("confirmed_cancelled");

    const noAbnResult = await verifyCandidateAbn({
      publishedAbn: null,
      businessName: "Rigg Contracting",
      guid: "",
    });
    expect(noAbnResult.status).toBe("unchecked_no_abn");
  });

  it("rejects protected-email placeholders and CSS font-author comments while extracting genuine public emails", () => {
    expect(extractPublicEmail("*protected email*").email).toBeNull();
    expect(extractPublicEmail("*protected email*").hadProtectedPlaceholder).toBe(true);
    expect(extractPublicEmail("[email protected]").email).toBeNull();
    expect(
      extractPublicEmail('<a href="/cdn-cgi/l/email-protection" data-cfemail="1234">email</a>')
        .email
    ).toBeNull();
    expect(
      extractPublicEmail(
        "<!-- Author: lemonad@jovanny.ru --><style>/* micah@micahrich.com */</style><p>Call us today</p>"
      ).email
    ).toBeNull();
    expect(
      extractPublicEmail(
        "<!-- Author: lemonad@jovanny.ru --><p>Email us at office@riggcontracting.com.au</p>"
      ).email
    ).toBe("office@riggcontracting.com.au");
  });

  it("keeps Westonfence service areas separate from unestablished base locations and strips supplier artifacts", () => {
    const sampleHtml = `
      <div id="main-content">
        <div class="et_pb_text_inner">
          <h2>Our Accredited Installers</h2>
          <p>Westonfence™ works with a trusted network of accredited installers across Australia, experienced in installing electric fencing for livestock containment and invasive pest exclusion.</p>
        </div>
        <div class="et_pb_text_inner">
          <p><strong>J &amp; L Rigg Contracting</strong></p>
          <p>Jackson Rigg – 0428 749 233<br />Lauren Rigg – 0427 943 063</p>
          <p>Email: <a href="javascript:;" data-enc-email="bssvpr[at]evttpbagenpvat.pbz.nh">*protected email*</a></p>
          <p>Area: Central West NSW</p>
          <p><a href="https://www.riggcontracting.com.au">Website</a></p>
        </div>
      </div>
    `;
    const parsed = parseWestonfenceHtml(sampleHtml, "2026-10-18T00:00:00.000Z");
    expect(parsed.length).toBe(1);
    expect(parsed[0].business_name).toBe("J & L Rigg Contracting");
    expect(parsed[0].contact_names).toEqual(["Jackson Rigg", "Lauren Rigg"]);
    expect(parsed[0].phones.map((p) => p.normalised_e164)).toEqual([
      "+61428749233",
      "+61427943063",
    ]);
    expect(parsed[0].public_email).toBeNull();
    expect(parsed[0].had_protected_email_placeholder).toBe(true);
    expect(parsed[0].base_location_established).toBe(false);
    expect(parsed[0].raw_base_locality).toBeNull();
    expect(parsed[0].published_service_areas).toEqual(["Central West NSW"]);
  });

  it("ignores Rotech Rural <script> template placeholders and parses contractor cards cleanly", () => {
    const sampleHtml = `
      <script id="card-tpl" type="text/template">
        <div class="rr-contractor-card__body">
          <h3 class="rr-card-title">{{name}}</h3>
          <p class="rr-city">{{city}}, {{state}}</p>
        </div>
      </script>
      <div id="contractor-cards">
        <div class="rr-contractor-card">
          <div class="rr-contractor-card__body">
            <span class="rr-advocate-badge">Rotech Rural Advocate</span>
            <h3 class="rr-card-title">Goodlet Rural Fencing</h3>
            <p class="rr-city">COOLAH, NSW</p>
            <p><b>Contact:</b> Tim Goodlet</p>
            <p><b>Phone:</b> 0429 359 595</p>
            <p><b>Email:</b> <a href="/cdn-cgi/l/email-protection#1234">[email&#160;protected]</a></p>
            <div class="rr-card-links"><a href="https://goodletrural.com">Website</a></div>
          </div>
        </div>
      </div>
    `;
    const parsed = parseRotechRuralHtml(sampleHtml, "2026-10-18T00:00:00.000Z");
    expect(parsed.length).toBe(1);
    expect(parsed[0].business_name).toBe("Goodlet Rural Fencing");
    expect(parsed[0].raw_base_locality).toBe("COOLAH");
    expect(parsed[0].raw_base_state).toBe("NSW");
    expect(parsed[0].public_email).toBeNull();
    expect(parsed[0].had_protected_email_placeholder).toBe(true);
    expect(parsed[0].website_url).toBe("https://goodletrural.com/");
  });

  it("generates factual, non-promotional unclaimed descriptions that pass compliance checks", () => {
    const desc = buildUnclaimedFencerDescription({
      business_name: "Goodlet Rural Fencing",
      base_locality: "Coolah",
      base_state: "NSW",
      base_postcode: "2843",
      base_location_established: true,
      locality_validation_status: "valid_confirmed",
      published_service_areas: ["Coolah, NSW"],
      supported_rural_specialties: ["Exclusion fencing", "High tensile & plain/barbed wire fencing"],
      sources: [{ source_name: "Rotech Rural Fencing Contractors" }],
    });
    const check = isDescriptionCompliant(desc, true);
    expect(check.valid).toBe(true);
    expect(desc).toContain("Goodlet Rural Fencing is based in Coolah, NSW 2843");
    expect(desc).toContain("exclusion fencing, high tensile & plain/barbed wire fencing");
    expect(desc).toContain("Unclaimed directory listing — not posted by the business.");
  });
});
