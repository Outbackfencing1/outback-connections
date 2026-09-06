"use server";

// Upsert aggregate monthly sales per postcode. Staff only. Rows are already
// aggregated client-side by lib/sales-upload.ts; this re-validates every row
// and never accepts anything but month / postcode / orders / revenue.
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffAccess } from "@/lib/staff-access";
import type { SalesRow } from "@/lib/sales-upload";

const MAX_ROWS = 5000;

export type SalesUploadResult = { ok: true; upserted: number } | { ok: false; message: string };

export async function uploadSalesRows(rows: SalesRow[], source = "shopify"): Promise<SalesUploadResult> {
  const access = await getStaffAccess();
  if (!access.ok) return { ok: false, message: access.message };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, message: "Nothing to upload." };
  if (rows.length > MAX_ROWS) return { ok: false, message: `Too many rows (${rows.length}). Keep it under ${MAX_ROWS}.` };
  if (!/^[a-z_]{2,30}$/.test(source)) return { ok: false, message: "Bad source." };

  const clean: { source: string; month: string; postcode: string; orders: number; revenue_cents: number; updated_at: string }[] = [];
  const now = new Date().toISOString();
  for (const r of rows) {
    if (
      typeof r.month !== "string" || !/^\d{4}-\d{2}-01$/.test(r.month) ||
      typeof r.postcode !== "string" || !/^[0-9]{4}$/.test(r.postcode) ||
      !Number.isInteger(r.orders) || r.orders < 0 ||
      !Number.isInteger(r.revenue_cents) || r.revenue_cents < 0
    ) {
      return { ok: false, message: "A row failed validation; re-parse the file and try again." };
    }
    clean.push({ source, month: r.month, postcode: r.postcode, orders: r.orders, revenue_cents: r.revenue_cents, updated_at: now });
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Not configured." };

  let upserted = 0;
  for (let i = 0; i < clean.length; i += 500) {
    const chunk = clean.slice(i, i + 500);
    const { error } = await admin
      .from("sales_by_postcode_monthly")
      .upsert(chunk, { onConflict: "source,month,postcode" });
    if (error) return { ok: false, message: `Upload failed at row ${i + 1}: ${error.message}` };
    upserted += chunk.length;
  }

  revalidatePath("/dashboard/admin/demand");
  revalidatePath("/dashboard/admin/sales-upload");
  return { ok: true, upserted };
}
