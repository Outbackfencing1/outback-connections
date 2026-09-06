import { describe, expect, it } from "vitest";
import { parseShopifyqlSales } from "@/lib/shopifyql";

describe("parseShopifyqlSales", () => {
  it("maps the analytics table to aggregate rows, dropping blank postcodes and clamping refunds", () => {
    const out = parseShopifyqlSales({
      columns: [
        { name: "month", dataType: "MONTH_TIMESTAMP" },
        { name: "shipping_postal_code", dataType: "STRING" },
        { name: "orders", dataType: "INTEGER" },
        { name: "net_sales", dataType: "MONEY" },
      ],
      rowData: [
        ["2026-06-01", "2820", "2", "8259.77"],
        ["2026-06-01", "", "2", "3217.5"],
        ["2025-10-01", "2440", "0", "-181.82"],
        ["2025-10-01", "0839", "1", "108.96"],
        ["2026-06-01", "2820", "1", "0.23"],
      ],
    });
    expect(out.skipped).toBe(1);
    expect(out.rows).toEqual([
      { month: "2025-10-01", postcode: "0839", orders: 1, revenue_cents: 10896 },
      { month: "2025-10-01", postcode: "2440", orders: 0, revenue_cents: 0 },
      { month: "2026-06-01", postcode: "2820", orders: 3, revenue_cents: 826000 },
    ]);
  });

  it("fails loudly when the columns aren't what the query promised", () => {
    expect(() => parseShopifyqlSales({ columns: [{ name: "day" }], rowData: [] })).toThrow(/columns missing/);
  });
});
