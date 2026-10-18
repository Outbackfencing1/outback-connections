import { describe, expect, it } from "vitest";
import {
  browseRobots,
  buildUnclaimedListingCopy,
  faqPageJsonLd,
  formatListingDescription,
  hasFilterParams,
  humanCategory,
  itemListJsonLd,
  jobPostingJsonLd,
  localBusinessJsonLd,
  socialMeta,
} from "@/lib/seo";
import { checkPostcodeInput, postcodeFilterValue } from "@/lib/postcode-input";
import { postedVerb } from "@/lib/format";
import { isRuralPostcode } from "@/lib/rural-postcodes";

describe("browseRobots", () => {
  it("noindexes (but follows) an empty page", () => {
    expect(browseRobots({ liveCount: 0 })).toEqual({ index: false, follow: true });
  });

  it("noindexes a filtered page even when it has rows", () => {
    expect(browseRobots({ liveCount: 35, filtered: true })).toEqual({ index: false, follow: true });
  });

  it("outputs index, follow when liveCount >= 1 and unfiltered", () => {
    expect(browseRobots({ liveCount: 35 })).toEqual({ index: true, follow: true });
  });

  it("never noindexes on an unknown count (database error)", () => {
    expect(browseRobots({ liveCount: null })).toBeUndefined();
  });
});

describe("isRuralPostcode", () => {
  it("excludes NSW metro postcodes (Sydney, Central Coast, Newcastle, Wollongong, Outer SW & Western Sydney)", () => {
    expect(isRuralPostcode("2000", "NSW")).toBe(false); // Sydney CBD
    expect(isRuralPostcode("2100", "NSW")).toBe(false); // Beacon Hill
    expect(isRuralPostcode("2160", "NSW")).toBe(false); // Merrylands / Fairfield
    expect(isRuralPostcode("2200", "NSW")).toBe(false); // Bankstown
    expect(isRuralPostcode("2250", "NSW")).toBe(false); // Gosford / Central Coast
    expect(isRuralPostcode("2290", "NSW")).toBe(false); // Newcastle Metro
    expect(isRuralPostcode("2500", "NSW")).toBe(false); // Wollongong Metro
    expect(isRuralPostcode("2560", "NSW")).toBe(false); // Campbelltown / Outer SW Sydney
    expect(isRuralPostcode("2770", "NSW")).toBe(false); // Mt Druitt / Western Sydney
  });

  it("allows genuine regional and rural NSW postcodes", () => {
    expect(isRuralPostcode("2800", "NSW")).toBe(true); // Orange
    expect(isRuralPostcode("2830", "NSW")).toBe(true); // Dubbo
    expect(isRuralPostcode("2870", "NSW")).toBe(true); // Parkes
    expect(isRuralPostcode("2871", "NSW")).toBe(true); // Forbes
    expect(isRuralPostcode("2795", "NSW")).toBe(true); // Bathurst
    expect(isRuralPostcode("2650", "NSW")).toBe(true); // Wagga Wagga
    expect(isRuralPostcode("2340", "NSW")).toBe(true); // Tamworth
    expect(isRuralPostcode("2400", "NSW")).toBe(true); // Moree
  });
});

describe("buildUnclaimedListingCopy & formatListingDescription", () => {
  it("replaces Yellow Pages and boilerplate unclaimed strings with dynamic regional copy", () => {
    const out = formatListingDescription({
      description:
        "Lachlan Valley Fencing is a fencing contractor we found listed on Yellow Pages in Forbes, NSW. This is an UNCLAIMED directory listing -- it was not posted by the business.",
      businessName: "Lachlan Valley Fencing",
      categoryName: "Fencing Contractor",
      suburb: "Forbes",
      postcode: "2871",
      state: "NSW",
      unclaimed: true,
    });
    expect(out).not.toContain("Yellow Pages");
    expect(out).not.toContain("UNCLAIMED directory listing");
    expect(out).toContain("Lachlan Valley Fencing");
    expect(out).toContain("Forbes");
    expect(out).toContain("2871");
  });

  it("generates unique descriptions across businesses and towns", () => {
    const a = buildUnclaimedListingCopy({
      businessName: "Central West Earthmoving",
      categoryName: "Earthworks",
      suburb: "Orange",
      postcode: "2800",
      state: "NSW",
    });
    const b = buildUnclaimedListingCopy({
      businessName: "Macquarie Bore Drilling",
      categoryName: "Bore / pump / water",
      suburb: "Dubbo",
      postcode: "2830",
      state: "NSW",
    });
    expect(a).not.toEqual(b);
  });
});

describe("Schema.org JSON-LD helpers", () => {
  it("builds HomeAndConstructionBusiness JSON-LD for fencing contractors", () => {
    const ld = localBusinessJsonLd({
      name: "Central West Rural Fencing",
      url: "https://www.outbackconnections.com.au/services/listing/central-west-rural-fencing-2800-lst123",
      postcode: "2800",
      suburb: "Orange",
      state: "NSW",
      categoryLabel: "Fencing contractor",
      telephone: "0400 123 456",
    });
    expect(ld["@type"]).toBe("HomeAndConstructionBusiness");
    expect(ld.telephone).toBe("0400 123 456");
    expect(ld.address).toMatchObject({
      addressLocality: "Orange",
      addressRegion: "NSW",
      postalCode: "2800",
      addressCountry: "AU",
    });
  });

  it("builds JobPosting JSON-LD and ItemList / FAQPage schemas", () => {
    const job = jobPostingJsonLd({
      title: "Experienced Station Hand",
      description: "Mustering and fencing near Dubbo.",
      slug: "station-hand-2830-lst999",
      baseUrl: "https://www.outbackconnections.com.au",
      createdAt: "2026-10-01T00:00:00Z",
      expiresAt: "2026-10-31T00:00:00Z",
      postcode: "2830",
      suburb: "Dubbo",
      state: "NSW",
      workType: "full_time",
    });
    expect(job["@type"]).toBe("JobPosting");
    const list = itemListJsonLd({
      name: "Fencing Contractors in Orange",
      url: "/services/fencing-contractor/orange-nsw",
      items: [{ name: "Contractor A", url: "/services/listing/contractor-a" }],
    });
    expect(list["@type"]).toBe("ItemList");
    const faq = faqPageJsonLd([{ question: "Is it free?", answer: "Yes, 100% free." }]);
    expect(faq["@type"]).toBe("FAQPage");
  });
});

describe("hasFilterParams", () => {
  it("ignores paging and empty values", () => {
    expect(hasFilterParams({})).toBe(false);
    expect(hasFilterParams({ page: "2" })).toBe(false);
    expect(hasFilterParams({ postcode: "", direction: "  " })).toBe(false);
  });

  it("spots a real filter, including array values", () => {
    expect(hasFilterParams({ postcode: "2800" })).toBe(true);
    expect(hasFilterParams({ direction: ["offering"] })).toBe(true);
  });
});

describe("checkPostcodeInput", () => {
  it("accepts a full four-digit postcode", () => {
    expect(checkPostcodeInput(" 2800 ")).toEqual({ kind: "postcode", value: "2800" });
  });

  it("keeps a deliberate starts-with search", () => {
    expect(checkPostcodeInput("28")).toEqual({ kind: "prefix", value: "28" });
  });

  it("flags typos instead of searching for them", () => {
    expect(checkPostcodeInput("abc")).toEqual({ kind: "invalid", raw: "abc" });
    expect(checkPostcodeInput("28000")).toEqual({ kind: "invalid", raw: "28000" });
    expect(postcodeFilterValue(checkPostcodeInput("abc"))).toBe("");
  });

  it("treats blank as no filter", () => {
    expect(checkPostcodeInput("")).toEqual({ kind: "none" });
    expect(checkPostcodeInput(undefined)).toEqual({ kind: "none" });
    expect(postcodeFilterValue(checkPostcodeInput("2800"))).toBe("2800");
  });
});

describe("postedVerb", () => {
  it("says Added for rows we found online or imported", () => {
    expect(postedVerb("scraped")).toBe("Added");
    expect(postedVerb("imported")).toBe("Added");
  });

  it("says Posted for owner-posted rows", () => {
    expect(postedVerb("manual")).toBe("Posted");
    expect(postedVerb("claimed")).toBe("Posted");
    expect(postedVerb(null)).toBe("Posted");
  });
});

describe("humanCategory on compound labels", () => {
  it("doesn't pluralise labels with a slash or ampersand", () => {
    expect(humanCategory("Bore / pump / water")).toBe("Bore / pump / water");
    expect(humanCategory("Truck tyre & specialty repair")).toBe("Truck tyre & specialty repair");
    expect(humanCategory("Earthworks (dams, roads, clearing)")).toBe("Earthworks");
  });
});

describe("socialMeta", () => {
  it("gives Facebook and Twitter the page's own title, URL and the card image", () => {
    const m = socialMeta({ title: "T", description: "D", path: "/services/fencing-contractor" });
    expect(m.openGraph).toMatchObject({
      title: "T",
      description: "D",
      url: "/services/fencing-contractor",
      siteName: "Outback Connections",
      locale: "en_AU",
    });
    expect(JSON.stringify(m.openGraph)).toContain("/opengraph-image");
    expect(m.twitter).toMatchObject({ card: "summary_large_image", title: "T" });
  });
});
