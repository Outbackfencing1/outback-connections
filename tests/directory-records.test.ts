import { describe, expect, it } from "vitest";
import { buildDirectoryRecord, csvRowToInput, normalisePlatform } from "@/lib/directory-records";

const meta = { enteredBy: "user-1", enteredVia: "test", enteredAt: "2026-09-06T00:00:00.000Z" };

describe("buildDirectoryRecord", () => {
  it("builds a scraped-style record with private contact and a search URL fallback", () => {
    const r = buildDirectoryRecord(
      {
        name: "Kings Fencing & Gates",
        vertical: "service",
        category_slug: "fencing-contractor",
        postcode: "2560",
        suburb: "Appin",
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
    expect(r.record.source_external_id).toBe("facebook:kings-fencing-and-gates:2560");
    expect(r.record.source_url).toContain("facebook.com/search");
    expect(r.record.state).toBe("NSW");
    expect(r.record.raw_payload.phone).toBe("0401 616 004");
    expect(r.record.raw_payload.email).toBe("kings@example.com");
    expect(r.record.raw_payload.source_url_kind).toBe("search");
    // Nothing that could leak into public columns is on the record itself.
    expect("phone" in r.record).toBe(false);
    expect("email" in r.record).toBe(false);
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
