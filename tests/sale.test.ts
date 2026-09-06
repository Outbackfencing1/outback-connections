import { describe, expect, it } from "vitest";
import { dollarsToCents, priceLine, quantityLine } from "@/lib/sale";

describe("dollarsToCents", () => {
  it("parses everyday inputs", () => {
    expect(dollarsToCents("1,250")).toBe(125000);
    expect(dollarsToCents("$85.50")).toBe(8550);
    expect(dollarsToCents(" 12 ")).toBe(1200);
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents(undefined)).toBeNull();
  });
  it("rejects junk", () => {
    expect(dollarsToCents("-5")).toBe("invalid");
    expect(dollarsToCents("twelve")).toBe("invalid");
    expect(dollarsToCents("1.234")).toBe("invalid");
  });
});

describe("priceLine", () => {
  it("says the honest thing for each price type", () => {
    expect(priceLine({ price_cents: 125000, price_type: "fixed" })).toBe("$1,250");
    expect(priceLine({ price_cents: 8550, price_type: "per_bale" })).toBe("$85.50 per bale");
    expect(priceLine({ price_cents: 210000, price_type: "per_head" })).toBe("$2,100 per head");
    expect(priceLine({ price_cents: 90000, price_type: "negotiable" })).toBe("$900 negotiable");
    expect(priceLine({ price_cents: null, price_type: "negotiable" })).toBe("Price negotiable");
    expect(priceLine({ price_cents: null, price_type: "poa" })).toBe("Price on application");
    expect(priceLine({ price_cents: 0, price_type: "free" })).toBe("Free");
    expect(priceLine({ price_cents: 4500, price_type: "per_unit", unit: "roll" })).toBe("$45 each (roll)");
  });
});

describe("quantityLine", () => {
  it("formats quantity with its unit", () => {
    expect(quantityLine({ quantity: 120, unit: "bales" })).toBe("120 bales");
    expect(quantityLine({ quantity: 12.5, unit: "tonnes" })).toBe("12.5 tonnes");
    expect(quantityLine({ quantity: null })).toBeNull();
  });
});
