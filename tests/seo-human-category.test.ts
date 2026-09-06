import { describe, expect, it } from "vitest";
import { buildDirectoryDescription, buildTitle, humanCategory } from "@/lib/seo";

describe("humanCategory", () => {
  it("drops the bracketed qualifier and pluralises", () => {
    expect(humanCategory("Fencing contractor (construction)")).toBe("Fencing contractors");
    expect(humanCategory("Rural supplies store")).toBe("Rural supplies stores");
  });

  it("leaves labels that already end in s alone", () => {
    expect(humanCategory("Rural supplies")).toBe("Rural supplies");
    expect(humanCategory("Drone services (agricultural)")).toBe("Drone services");
  });
});

describe("buildTitle", () => {
  it("uses the state with the postcode when known", () => {
    expect(
      buildTitle({ listingTitle: "Boundary Builders", categoryLabel: "Fencing contractor", postcode: "2820", state: "NSW" })
    ).toBe("Boundary Builders · Fencing contractor · NSW 2820 · Outback Connections");
  });

  it("falls back to the bare postcode", () => {
    expect(buildTitle({ listingTitle: "X", categoryLabel: "Y", postcode: "2800" })).toBe(
      "X · Y · Postcode 2800 · Outback Connections"
    );
  });
});

describe("buildDirectoryDescription", () => {
  it("says what and where, and that the row is unclaimed", () => {
    expect(
      buildDirectoryDescription({
        categoryLabel: "Fencing contractor (construction)",
        regionName: "Dubbo",
        state: "NSW",
        postcode: "2830",
        unclaimed: true,
      })
    ).toBe("Fencing contractor in Dubbo, NSW. Unclaimed directory entry on Outback Connections: ask for a quote and we pass it on.");
  });

  it("drops the unclaimed line for claimed rows and copes without a region", () => {
    const d = buildDirectoryDescription({ categoryLabel: "Rural supplies", state: "NSW", postcode: "2800", unclaimed: false });
    expect(d).toBe("Rural supplies in NSW 2800. On Outback Connections, the free rural directory: no lead fees, contact them direct.");
    expect(d).not.toMatch(/unclaimed/i);
  });
});
