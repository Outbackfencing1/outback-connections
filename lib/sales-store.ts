// lib/sales-store.ts
// The one writer for sales_by_postcode_monthly, used by the staff CSV upload
// and the Shopify sync cron. Re-validates every row; chunked upsert on the
// (source, month, postcode) key.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesRow } from "./sales-upload";

export const SALES_MAX_ROWS = 5000;

export function validateSalesRow(r: SalesRow): boolean {
  return (
    typeof r.month === "string" && /^\d{4}-\d{2}-01$/.test(r.month) &&
    typeof r.postcode === "string" && /^[0-9]{4}$/.test(r.postcode) &&
    Number.isInteger(r.orders) && r.orders >= 0 &&
    Number.isInteger(r.revenue_cents) && r.revenue_cents >= 0
  );
}

export async function upsertSalesRows(
  admin: SupabaseClient,
  rows: SalesRow[],
  source = "shopify"
): Promise<{ ok: true; upserted: number } | { ok: false; message: string }> {
  if (!/^[a-z_]{2,30}$/.test(source)) return { ok: false, message: "Bad source." };
  if (rows.length === 0) return { ok: false, message: "Nothing to upload." };
  if (rows.length > SALES_MAX_ROWS) return { ok: false, message: `Too many rows (${rows.length}). Keep it under ${SALES_MAX_ROWS}.` };
  const now = new Date().toISOString();
  const clean: Array<SalesRow & { source: string; updated_at: string }> = [];
  for (const r of rows) {
    if (!validateSalesRow(r)) return { ok: false, message: "A row failed validation; re-parse the file and try again." };
    clean.push({ source, month: r.month, postcode: r.postcode, orders: r.orders, revenue_cents: r.revenue_cents, updated_at: now });
  }
  let upserted = 0;
  for (let i = 0; i < clean.length; i += 500) {
    const chunk = clean.slice(i, i + 500);
    const { error } = await admin.from("sales_by_postcode_monthly").upsert(chunk, { onConflict: "source,month,postcode" });
    if (error) return { ok: false, message: `Upload failed at row ${i + 1}: ${error.message}` };
    upserted += chunk.length;
  }
  return { ok: true, upserted };
}

/** Four scalars for the coverage box, without pulling rows. */
export async function salesCoverage(admin: SupabaseClient): Promise<{
  rows: number;
  first: string | null;
  last: string | null;
  updated: string | null;
}> {
  const [count, first, last, updated] = await Promise.all([
    admin.from("sales_by_postcode_monthly").select("id", { count: "exact", head: true }),
    admin.from("sales_by_postcode_monthly").select("month").order("month", { ascending: true }).limit(1).maybeSingle(),
    admin.from("sales_by_postcode_monthly").select("month").order("month", { ascending: false }).limit(1).maybeSingle(),
    admin.from("sales_by_postcode_monthly").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    rows: count.count ?? 0,
    first: first.data?.month ? String(first.data.month).slice(0, 7) : null,
    last: last.data?.month ? String(last.data.month).slice(0, 7) : null,
    updated: updated.data?.updated_at ? String(updated.data.updated_at) : null,
  };
}
