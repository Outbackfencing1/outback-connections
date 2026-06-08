"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ------------------------------------------------------------
// Admin Import Preview / Commit server actions.
// Preview is a DRY RUN (read-only); commit writes via ingest_scraped_business.
// Both are admin-gated app-side, then call the service-role-only RPCs.
// ------------------------------------------------------------

const MAX_BATCH = 500;

async function requireAdmin(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "Sign in." };
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) return { ok: false, message: "Admins only." };
  return { ok: true };
}

function parseBatch(
  jsonText: string
): { ok: true; records: Record<string, unknown>[] } | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, message: "That isn't valid JSON." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, message: "Expected a JSON array of import records." };
  }
  if (parsed.length === 0) return { ok: false, message: "The array is empty." };
  if (parsed.length > MAX_BATCH) {
    return { ok: false, message: `Batch too large (${parsed.length}). Keep it under ${MAX_BATCH} per run.` };
  }
  return { ok: true, records: parsed as Record<string, unknown>[] };
}

export type PreviewRow = {
  name: string | null;
  vertical: string | null;
  side: string | null;
  postcode: string | null;
  state: string | null;
  category_input: string | null;
  category_resolved: string | null;
  category_label: string | null;
  business_action: string | null;
  listing_action: string | null;
  existing_listing_slug: string | null;
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type PreviewSummary = {
  total: number;
  valid: number;
  invalid: number;
  would_create: number;
  would_update: number;
  intra_batch_duplicates: number;
};

export type PreviewResult =
  | { ok: true; summary: PreviewSummary; rows: PreviewRow[] }
  | { ok: false; message: string };

export async function previewImport(jsonText: string): Promise<PreviewResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };

  const parsed = parseBatch(jsonText);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Import isn't configured on this environment." };

  const { data, error } = await admin.rpc("preview_scraped_import", { p_records: parsed.records });
  if (error) return { ok: false, message: `Preview failed: ${error.message}` };

  return {
    ok: true,
    summary: data.summary as PreviewSummary,
    rows: (data.rows ?? []) as PreviewRow[],
  };
}

export type CommitResult =
  | { ok: true; created: number; updated: number; failed: number; skipped: number; total: number }
  | { ok: false; message: string };

// Writes the batch via ingest_scraped_business (idempotent). Only valid rows are
// sent; the DB function validates again + enforces the trust guards.
export async function commitImport(jsonText: string): Promise<CommitResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };

  const parsed = parseBatch(jsonText);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Import isn't configured on this environment." };

  let created = 0,
    updated = 0,
    failed = 0,
    skipped = 0;

  for (const r of parsed.records) {
    const vertical = r.vertical as string | undefined;
    const postcode = (r.postcode as string | undefined) ?? "";
    if (
      (vertical !== "job" && vertical !== "freight") ||
      !r.source_external_id ||
      !r.source_url ||
      !r.source_platform ||
      !r.name ||
      !/^\d{4}$/.test(postcode)
    ) {
      skipped++;
      continue;
    }
    const { data, error } = await admin.rpc("ingest_scraped_business", {
      p_vertical: vertical,
      p_source_platform: r.source_platform,
      p_source_external_id: r.source_external_id,
      p_source_url: r.source_url,
      p_name: r.name,
      p_category_slug: r.category_slug ?? null,
      p_postcode: postcode,
      p_suburb: r.suburb ?? null,
      p_state: r.state ?? null,
      p_website: r.website ?? null,
      p_geo_lat: r.geo_lat ?? null,
      p_geo_lng: r.geo_lng ?? null,
      p_raw_payload: r.raw_payload ?? {},
      p_expiry_days: 45,
    });
    if (error) {
      failed++;
      continue;
    }
    if ((data as { listing_action?: string })?.listing_action === "created") created++;
    else updated++;
  }

  revalidatePath("/jobs");
  revalidatePath("/freight");

  return { ok: true, created, updated, failed, skipped, total: parsed.records.length };
}
