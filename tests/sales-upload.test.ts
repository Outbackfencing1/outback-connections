import { describe, expect, it } from "vitest";
import { parseSalesCsv } from "@/lib/sales-upload";

describe("parseSalesCsv", () => {
  it("accepts an aggregated sheet and sums duplicates", () => {
    const csv = [
      "month,postcode,orders,revenue",
      "2026-08,2800,3,1250.50",
      "2026-08,2800,2,100",
      '2026-07,2830,1,"$2,000"',
      "bad,2800,1,1",
    ].join("\n");
    const p = parseSalesCsv(csv);
    expect(p.format).toBe("aggregate");
    expect(p.rows).toEqual([
      { month: "2026-07-01", postcode: "2830", orders: 1, revenue_cents: 200000 },
      { month: "2026-08-01", postcode: "2800", orders: 5, revenue_cents: 135050 },
    ]);
    expect(p.skipped).toBe(1);
    expect(p.orders).toBe(6);
  });

  it("collapses a Shopify order export to one count per order, by shipping postcode", () => {
    const csv = [
      "Name,Email,Financial Status,Created at,Total,Shipping Zip,Billing Zip,Lineitem name",
      "#1001,a@example.com,paid,2026-08-03 10:00:00 +1000,1699.00,2800,2800,Clipgun",
      "#1001,,,,,,,C24 clips", // line-item continuation
      "#1002,b@example.com,refunded,2026-08-04 10:00:00 +1000,250.00,2830,2830,Clips",
      "#1003,c@example.com,paid,2026-08-05 10:00:00 +1000,85.00,,2650,Battery",
      "#1004,d@example.com,paid,2026-09-01 10:00:00 +1000,40.00,3000,3000,Adaptor",
    ].join("\n");
    const p = parseSalesCsv(csv);
    expect(p.format).toBe("shopify_export");
    expect(p.rows).toEqual([
      { month: "2026-08-01", postcode: "2650", orders: 1, revenue_cents: 8500 },
      { month: "2026-08-01", postcode: "2800", orders: 1, revenue_cents: 169900 },
      { month: "2026-09-01", postcode: "3000", orders: 1, revenue_cents: 4000 },
    ]);
    expect(p.skipped).toBe(1);
    expect(p.notes.join(" ")).toContain("Shopify order export");
  });

  it("rejects unknown shapes", () => {
    const p = parseSalesCsv("a,b\n1,2\n");
    expect(p.format).toBe("unknown");
    expect(p.rows).toEqual([]);
  });
});
