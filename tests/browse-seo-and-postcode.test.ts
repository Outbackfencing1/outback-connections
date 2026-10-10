import { describe, expect, it } from "vitest";
import { browseRobots, hasFilterParams } from "@/lib/seo";
import { checkPostcodeInput, postcodeFilterValue } from "@/lib/postcode-input";
import { postedVerb } from "@/lib/format";

describe("browseRobots", () => {
  it("noindexes (but follows) an empty page", () => {
    expect(browseRobots({ liveCount: 0 })).toEqual({ index: false, follow: true });
  });

  it("noindexes a filtered page even when it has rows", () => {
    expect(browseRobots({ liveCount: 35, filtered: true })).toEqual({ index: false, follow: true });
  });

  it("leaves a clean page with rows indexable", () => {
    expect(browseRobots({ liveCount: 35 })).toBeUndefined();
  });

  it("never noindexes on an unknown count (database error)", () => {
    expect(browseRobots({ liveCount: null })).toBeUndefined();
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
