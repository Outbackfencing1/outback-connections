"use server";

// Upsert aggregate monthly sales per postcode. Staff only. Rows are already
// aggregated client-side by lib/sales-upload.ts; lib/sales-store.ts
// re-validates every row and never accepts anything but month / postcode /
// orders / revenue.
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffAccess } from "@/lib/staff-access";
import { upsertSalesRows } from "@/lib/sales-store";
import type { SalesRow } from "@/lib/sales-upload";

export type SalesUploadResult = { ok: true; upserted: number } | { ok: false; message: string };

export async function uploadSalesRows(rows: SalesRow[], source = "shopify"): Promise<SalesUploadResult> {
  const access = await getStaffAccess();
  if (!access.ok) return { ok: false, message: access.message };
  if (!Array.isArray(rows)) return { ok: false, message: "Nothing to upload." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Not configured." };

  const res = await upsertSalesRows(admin, rows, source);
  if (!res.ok) return res;

  revalidatePath("/dashboard/admin/demand");
  revalidatePath("/dashboard/admin/sales-upload");
  return res;
}
