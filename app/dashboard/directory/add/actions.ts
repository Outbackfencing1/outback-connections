"use server";

// /dashboard/directory/add — server actions.
// One business at a time, through the SAME path as the bulk import:
// preview_scraped_import() (dry run) then ingest_scraped_business() (write).
// Every entry lands as scraped / unclaimed with a business record, honest
// source attribution, and phone/email kept in private listing_sources.raw_payload.
// Validation + record shape live in lib/directory-records.ts (shared with CSV).

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDirectoryContributor } from "@/lib/directory-access";
import { listingHref } from "@/lib/format";
import {
  buildDirectoryRecord,
  type DirectoryEntryInput,
  type BuildResult,
} from "@/lib/directory-records";
import type { SourceUrlKind } from "@/lib/source-platforms";

const EXPIRY_DAYS = 60;

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function formToInput(fd: FormData): DirectoryEntryInput {
  return {
    name: str(fd, "name"),
    vertical: str(fd, "vertical"),
    category_slug: str(fd, "category_slug"),
    postcode: str(fd, "postcode"),
    suburb: str(fd, "suburb"),
    state: str(fd, "state"),
    platform: str(fd, "platform"),
    source_url: str(fd, "source_url"),
    website: str(fd, "website"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    notes: str(fd, "notes"),
  };
}

function build(fd: FormData, userId: string): BuildResult {
  return buildDirectoryRecord(formToInput(fd), {
    enteredBy: userId,
    enteredVia: "directory quick-add",
  });
}

type PreviewRowShape = {
  valid?: boolean;
  listing_action?: string | null;
  business_action?: string | null;
  category_input?: string | null;
  category_resolved?: string | null;
  category_label?: string | null;
  existing_listing_slug?: string | null;
  errors?: string[];
  warnings?: string[];
};

export type DirectoryPreview =
  | {
      ok: true;
      valid: boolean;
      action: "create" | "update";
      categoryLabel: string | null;
      categoryInput: string | null;
      categoryResolved: string | null;
      existingSlug: string | null;
      sourceUrl: string;
      urlKind: SourceUrlKind;
      errors: string[];
      warnings: string[];
    }
  | { ok: false; errors: Record<string, string> };

export async function previewDirectoryEntry(formData: FormData): Promise<DirectoryPreview> {
  const gate = await requireDirectoryContributor();
  if (!gate.ok) return { ok: false, errors: { _: gate.message } };
  const built = build(formData, gate.userId);
  if (!built.ok) return built;

  const admin = createAdminClient();
  if (!admin) return { ok: false, errors: { _: "Directory add isn't configured on this environment." } };

  const { data, error } = await admin.rpc("preview_scraped_import", { p_records: [built.record] });
  if (error) return { ok: false, errors: { _: `Preview failed: ${error.message}` } };
  const row = ((data?.rows ?? []) as PreviewRowShape[])[0];
  if (!row) return { ok: false, errors: { _: "Preview returned nothing." } };

  return {
    ok: true,
    valid: !!row.valid,
    action: row.listing_action === "would_update" ? "update" : "create",
    categoryLabel: row.category_label ?? null,
    categoryInput: row.category_input ?? null,
    categoryResolved: row.category_resolved ?? null,
    existingSlug: row.existing_listing_slug ?? null,
    sourceUrl: built.record.source_url,
    urlKind: built.urlKind,
    errors: row.errors ?? [],
    warnings: row.warnings ?? [],
  };
}

export type DirectoryAddResult =
  | { ok: true; listingId: string; href: string | null; action: string; title: string }
  | { ok: false; errors: Record<string, string> };

export async function addDirectoryEntry(formData: FormData): Promise<DirectoryAddResult> {
  const gate = await requireDirectoryContributor();
  if (!gate.ok) return { ok: false, errors: { _: gate.message } };
  const built = build(formData, gate.userId);
  if (!built.ok) return built;

  const admin = createAdminClient();
  if (!admin) return { ok: false, errors: { _: "Directory add isn't configured on this environment." } };

  const r = built.record;
  const { data, error } = await admin.rpc("ingest_scraped_business", {
    p_vertical: r.vertical,
    p_source_platform: r.source_platform,
    p_source_external_id: r.source_external_id,
    p_source_url: r.source_url,
    p_name: r.name,
    p_category_slug: r.category_slug,
    p_postcode: r.postcode,
    p_suburb: r.suburb,
    p_state: r.state,
    p_website: r.website,
    p_geo_lat: null,
    p_geo_lng: null,
    p_raw_payload: r.raw_payload,
    p_expiry_days: EXPIRY_DAYS,
  });
  if (error) return { ok: false, errors: { _: `Couldn't add it: ${error.message}` } };

  const out = (data ?? {}) as { listing_id?: string; listing_action?: string };
  const listingId = out.listing_id;
  if (!listingId) return { ok: false, errors: { _: "The database didn't return a listing id." } };

  // Tell the detail page whether the source link is the exact page or a search.
  const { data: row } = await admin
    .from("listings")
    .select("slug, kind, metadata")
    .eq("id", listingId)
    .maybeSingle();
  const existingMeta =
    row?.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  await admin
    .from("listings")
    .update({ metadata: { ...existingMeta, source_url_kind: built.urlKind } })
    .eq("id", listingId);

  revalidatePath(r.vertical === "service" ? "/services" : r.vertical === "job" ? "/jobs" : "/freight");

  return {
    ok: true,
    listingId,
    href: row?.slug && row?.kind ? listingHref(row.kind, row.slug) : null,
    action: out.listing_action ?? "created",
    title: r.name,
  };
}
