// lib/sales-upload.ts
// Turns a spreadsheet into aggregate monthly sales rows per postcode. Two
// shapes are accepted:
//   1. Already aggregated: month, postcode, orders, revenue (dollars).
//   2. A raw Shopify "Export orders" CSV: one row per line item, order-level
//      fields (Total, Shipping Zip, Created at, Financial Status) on the
//      first row of each order. We keep one row per order Name and bin by
//      month + shipping postcode (billing as fallback).
// Nothing personal survives: no names, emails, addresses or order ids.
import { csvToObjects } from "./csv";

export type SalesRow = {
  month: string; // YYYY-MM-01
  postcode: string;
  orders: number;
  revenue_cents: number;
};

export type SalesParse = {
  format: "aggregate" | "shopify_export" | "unknown";
  rows: SalesRow[];
  orders: number;
  revenue_cents: number;
  skipped: number;
  notes: string[];
};

const AU_POSTCODE = /^[0-9]{4}$/;

function monthKey(v: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const mm = parseInt(m[2], 10);
  if (mm < 1 || mm > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

function cents(v: string): number | null {
  const s = v.replace(/[$,\s]/g, "");
  if (s === "") return 0;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

function normalisePostcode(v: string | undefined): string | null {
  const s = (v ?? "").trim().replace(/^['’"]+/, "").replace(/\s+/g, "");
  return AU_POSTCODE.test(s) ? s : null;
}

export function parseSalesCsv(text: string): SalesParse {
  const rows = csvToObjects(text);
  const notes: string[] = [];
  if (rows.length === 0) return { format: "unknown", rows: [], orders: 0, revenue_cents: 0, skipped: 0, notes: ["No rows found."] };
  const headers = Object.keys(rows[0]);
  const has = (h: string) => headers.includes(h);

  const agg = new Map<string, SalesRow>();
  const add = (month: string, postcode: string, orders: number, revenue: number) => {
    const key = `${month}|${postcode}`;
    const cur = agg.get(key) ?? { month, postcode, orders: 0, revenue_cents: 0 };
    cur.orders += orders;
    cur.revenue_cents += revenue;
    agg.set(key, cur);
  };
  let skipped = 0;

  if (has("month") && has("postcode") && has("orders")) {
    for (const r of rows) {
      const month = monthKey(r.month);
      const postcode = normalisePostcode(r.postcode);
      const orders = parseInt(r.orders, 10);
      const rev = cents(r.revenue ?? r.revenue_dollars ?? r.total ?? "0");
      if (!month || !postcode || !Number.isFinite(orders) || orders < 0 || rev === null || rev < 0) {
        skipped++;
        continue;
      }
      add(month, postcode, orders, rev);
    }
    return finish("aggregate", agg, skipped, notes);
  }

  if (has("name") && has("created_at") && (has("shipping_zip") || has("billing_zip"))) {
    const seen = new Set<string>();
    for (const r of rows) {
      const name = (r.name ?? "").trim();
      if (!name || seen.has(name)) continue; // line-item continuation rows
      const total = r.total ?? "";
      if (total.trim() === "") continue; // not the order-level row
      seen.add(name);
      const status = (r.financial_status ?? "").toLowerCase();
      if (status === "voided" || status === "refunded") {
        skipped++;
        continue;
      }
      const month = monthKey(r.created_at ?? r.paid_at ?? "");
      const postcode = normalisePostcode(r.shipping_zip) ?? normalisePostcode(r.billing_zip);
      const rev = cents(total);
      if (!month || !postcode || rev === null || rev < 0) {
        skipped++;
        continue;
      }
      add(month, postcode, 1, rev);
    }
    notes.push("Shopify order export detected: one count per order, binned by month and shipping postcode.");
    return finish("shopify_export", agg, skipped, notes);
  }

  return {
    format: "unknown",
    rows: [],
    orders: 0,
    revenue_cents: 0,
    skipped: rows.length,
    notes: [
      `Unrecognised columns (${headers.slice(0, 8).join(", ")}). Expected month, postcode, orders, revenue, or a Shopify order export.`,
    ],
  };
}

function finish(format: SalesParse["format"], agg: Map<string, SalesRow>, skipped: number, notes: string[]): SalesParse {
  const out = Array.from(agg.values()).sort((a, b) => a.month.localeCompare(b.month) || a.postcode.localeCompare(b.postcode));
  const orders = out.reduce((s, r) => s + r.orders, 0);
  const revenue_cents = out.reduce((s, r) => s + r.revenue_cents, 0);
  if (skipped > 0) notes.push(`${skipped} row(s) skipped (bad month, non-AU postcode, or refunded/voided).`);
  return { format, rows: out, orders, revenue_cents, skipped, notes };
}
