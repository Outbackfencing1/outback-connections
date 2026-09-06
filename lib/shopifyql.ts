// lib/shopifyql.ts
// Pure parser for a ShopifyQL table response into aggregate sales rows.
// The query the sync cron runs:
//   FROM sales SHOW orders, net_sales GROUP BY shipping_postal_code TIMESERIES month SINCE -13m UNTIL today
// Rows arrive as strings: ["2026-06-01", "2820", "2", "8259.77"]. Blank or
// non-Australian postcodes are dropped; refund-only months (negative net
// sales) are clamped to zero so the table's non-negative checks hold.
import type { SalesRow } from "./sales-upload";

export type ShopifyqlTable = {
  columns: { name: string; dataType?: string }[];
  rowData: string[][];
};

export const SALES_BY_POSTCODE_QUERY =
  "FROM sales SHOW orders, net_sales GROUP BY shipping_postal_code TIMESERIES month SINCE -13m UNTIL today";

export function parseShopifyqlSales(table: ShopifyqlTable): { rows: SalesRow[]; skipped: number } {
  const idx = (name: string) => table.columns.findIndex((c) => c.name === name);
  const iMonth = idx("month");
  const iPostcode = idx("shipping_postal_code");
  const iOrders = idx("orders");
  const iSales = idx("net_sales");
  if (iMonth < 0 || iPostcode < 0 || iOrders < 0 || iSales < 0) {
    throw new Error(`ShopifyQL columns missing: got ${table.columns.map((c) => c.name).join(", ")}`);
  }

  const agg = new Map<string, SalesRow>();
  let skipped = 0;
  for (const r of table.rowData) {
    const month = /^(\d{4}-\d{2})/.exec(r[iMonth] ?? "")?.[1];
    const postcode = (r[iPostcode] ?? "").trim();
    const orders = parseInt(r[iOrders] ?? "", 10);
    const sales = parseFloat(r[iSales] ?? "");
    if (!month || !/^[0-9]{4}$/.test(postcode) || !Number.isFinite(orders) || !Number.isFinite(sales)) {
      skipped++;
      continue;
    }
    const key = `${month}-01|${postcode}`;
    const cur = agg.get(key) ?? { month: `${month}-01`, postcode, orders: 0, revenue_cents: 0 };
    cur.orders += Math.max(0, orders);
    cur.revenue_cents += Math.max(0, Math.round(sales * 100));
    agg.set(key, cur);
  }
  return {
    rows: Array.from(agg.values()).sort((a, b) => a.month.localeCompare(b.month) || a.postcode.localeCompare(b.postcode)),
    skipped,
  };
}
