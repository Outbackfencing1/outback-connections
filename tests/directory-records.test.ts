import { describe, expect, it } from "vitest";
import {
  buildDirectoryRecord,
  csvRowToInput,
  detectNonRuralFencingWarning,
  normalisePlatform,
} from "@/lib/directory-records";
import { SOURCE_PLATFORM_OPTIONS } from "@/lib/source-platforms";
import { formatSalesMetaNote, parseSalesMetaFromNote } from "@/lib/outreach-statuses";

const meta = { enteredBy: "user-1", enteredVia: "test", enteredAt: "2026-09-06T00:00:00.000Z" };

describe("buildDirectoryRecord", () => {
  it("builds a scraped-style record with private contact and a search URL fallback", () => {
    const r = buildDirectoryRecord(
      {
        name: "Kings Fencing & Gates",
        vertical: "service",
        category_slug: "fencing-contractor",
        postcode: "2800",
        suburb: "Orange",
        state: "nsw",
        platform: "Facebook",
        phone: "0401 616 004",
        email: "kings@example.com",
      },
      meta
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.urlKind).toBe("search");
    expect(r.record.source_platform).toBe("facebook");
    expect(r.record.source_external_id).toBe("facebook:kings-fencing-and-gates:2800");
    expect(r.record.source_url).toContain("facebook.com/search");
    expect(r.record.state).toBe("NSW");
    expect(r.record.raw_payload.phone).toBe("0401 616 004");
    expect(r.record.raw_payload.email).toBe("kings@example.com");
    expect(r.record.raw_payload.source_url_kind).toBe("search");
    // Nothing that could leak into public columns is on the record itself.
    expect("phone" in r.record).toBe(false);
    expect("email" in r.record).toBe(false);
  });

  it("rejects excluded NSW metro postcodes automatically", () => {
    for (const metroPostcode of ["2000", "2100", "2160", "2200", "2290", "2500", "2560", "2770"]) {
      const r = buildDirectoryRecord(
        {
          name: "Sydney Metro Contractor",
          vertical: "service",
          category_slug: "fencing-contractor",
          postcode: metroPostcode,
          suburb: "Metro",
          state: "NSW",
          platform: "Facebook",
        },
        meta
      );
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.postcode).toContain("Metro postcode excluded");
      }
    }
  });

  it("uses the given page URL as the exact source and website for official sites", () => {
    const r = buildDirectoryRecord(
      {
        name: "Storco",
        vertical: "service",
        postcode: "2800",
        platform: "official website",
        source_url: "https://storco.com.au/",
      },
      meta
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.urlKind).toBe("site");
    expect(r.record.source_url).toBe("https://storco.com.au/");
    expect(r.record.website).toBe("https://storco.com.au/");
  });

  it("rejects bad input with field-level errors", () => {
    const r = buildDirectoryRecord(
      {
        name: "X",
        vertical: "cars",
        postcode: "28",
        platform: "google maps",
        email: "nope",
        phone: "abc",
      },
      meta
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      ["email", "name", "phone", "postcode", "source_url", "vertical"].sort()
    );
  });
});

describe("normalisePlatform", () => {
  it("accepts values, labels and shorthand", () => {
    expect(normalisePlatform("yellow pages")).toBe("yellow_pages");
    expect(normalisePlatform("FB")).toBe("facebook");
    expect(normalisePlatform("website")).toBe("official_website");
    expect(normalisePlatform("online")).toBe("web");
    expect(normalisePlatform("")).toBeNull();
    expect(normalisePlatform("carrier pigeon")).toBeNull();
  });
});

describe("csvRowToInput", () => {
  it("maps common spreadsheet headers", () => {
    const input = csvRowToInput({
      business: "Fence Pro Rural",
      town: "Dubbo",
      post_code: "2830",
      found_on: "Facebook",
      mobile: "0439 970 814",
      e_mail: "james@example.com",
      link: "https://www.facebook.com/fenceprorural",
    });
    expect(input.name).toBe("Fence Pro Rural");
    expect(input.suburb).toBe("Dubbo");
    expect(input.postcode).toBe("2830");
    expect(input.platform).toBe("Facebook");
    expect(input.phone).toBe("0439 970 814");
    expect(input.email).toBe("james@example.com");
    expect(input.source_url).toBe("https://www.facebook.com/fenceprorural");
    expect(input.vertical).toBe("service");
  });
});

describe("metro-based rural service area override & non-rural fencing warning", () => {
  it("allows a metro-office contractor when a genuine rural service_postcode is provided", () => {
    const r = buildDirectoryRecord(
      {
        name: "Tablelands Acreage & Rural Fencing",
        vertical: "service",
        category_slug: "fencing-contractor",
        postcode: "2570", // Camden (Outer SW Sydney metro range)
        suburb: "Camden",
        state: "NSW",
        service_postcode: "2577", // Moss Vale / Southern Highlands (regional)
        service_suburb: "Moss Vale / Southern Highlands",
        platform: "Yellow Pages / Public Directory",
      },
      meta
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.postcode).toBe("2577");
    expect(r.record.suburb).toBe("Moss Vale / Southern Highlands");
    expect(r.record.raw_payload.office_postcode).toBe("2570");
    expect(r.record.raw_payload.service_postcode).toBe("2577");
    expect(String(r.record.raw_payload.notes)).toContain("Base office postcode: 2570");
  });

  it("keeps Yellow Pages visible in SOURCE_PLATFORM_OPTIONS", () => {
    const yp = SOURCE_PLATFORM_OPTIONS.find((o) => o.value === "yellow_pages");
    expect(yp?.label).toContain("Yellow Pages");
  });

  it("warns when adding pool fencing, handrails, or temporary barricades under fencing-contractor", () => {
    expect(detectNonRuralFencingWarning("Coffs Coast Pool Fencing", "", "fencing-contractor")).toContain(
      "pool fencing"
    );
    expect(detectNonRuralFencingWarning("Quality Handrails", "", "fencing-contractor")).toContain(
      "handrails"
    );
    expect(
      detectNonRuralFencingWarning("Rob Lee's Temporary Barricades For Hire", "", "fencing-contractor")
    ).toContain("barricades");
    expect(detectNonRuralFencingWarning("Central West Rural Fencing", "Hinge joint and exclusion", "fencing-contractor")).toBeNull();
  });
});

describe("sales queue metadata helpers", () => {
  it("round-trips stage, customer fit, relevant product, consent and next action in note", () => {
    const formatted = formatSalesMetaNote({
      stage: "Quote needed",
      customerFit: "Buyer + Installer Partner (Fencing Contractor)",
      relevantProduct: "Fixed Knot 16/180/15 Exclusion Mesh ($6/m)",
      consent: "prospective_1to1",
      nextAction: "Ask Daryl to quote 10 rolls to Dubbo",
      note: "Spoke to owner, pricing 2.5km boundary job.",
    });
    const parsed = parseSalesMetaFromNote(formatted, "interested");
    expect(parsed.stage).toBe("Quote needed");
    expect(parsed.customerFit).toBe("Buyer + Installer Partner (Fencing Contractor)");
    expect(parsed.relevantProduct).toBe("Fixed Knot 16/180/15 Exclusion Mesh ($6/m)");
    expect(parsed.consent).toBe("prospective_1to1");
    expect(parsed.nextAction).toBe("Ask Daryl to quote 10 rolls to Dubbo");
    expect(parsed.cleanNote).toBe("Spoke to owner, pricing 2.5km boundary job.");
    expect(parsed.needsJoshua).toBe(true);
  });
});
