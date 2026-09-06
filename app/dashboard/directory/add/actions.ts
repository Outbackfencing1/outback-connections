"use server";

// /dashboard/directory/add — server actions.
// One business at a time, through the SAME path as the bulk import:
// preview_scraped_import() (dry run) then ingest_scraped_business() (write).
// Every entry lands as scraped / unclaimed with a business record, honest
// source attribution, and phone/email kept in private listing_sources.raw_payload.

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDirectoryContributor } from "@/lib/directory-access";
import { listingHref } from "@/lib/format";
import {
  buildSearchUrl,
  directoryExternalId,
  isSourcePlatform,
  SOURCE_PLATFORM_OPTIONS,
  type SourcePlatform,
  type SourceUrlKind,
} from "@/lib/source-platforms";

const VERTICALS = ["service", "job", "freight"] as const;
type Vertical = (typeof VERTICALS)[number];
const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];
const EXPIRY_DAYS = 60;

type ImportRecord = {
  vertical: Vertical;
  source_platform: SourcePlatform;
  source_external_id: string;
  source_url: string;
  name: string;
  postcode: string;
  category_slug: string | null;
  suburb: string | null;
  state: string | null;
  website: string | null;
  raw_payload: Record<string, unknown>;
};

type Built =
  | { ok: true; record: ImportRecord; urlKind: SourceUrlKind }
  | { ok: false; errors: Record<string, string> };

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function isHttpUrl(v: string): boolean {
  return /^https?:[/][/][^ ]+$/i.test(v);
}

function buildRecord(fd: FormData, userId: string): Built {
  const errors: Record<string, string> = {};
  const name = str(fd, "name");
  const vertical = str(fd, "vertical") as Vertical;
  const categorySlug = str(fd, "category_slug");
  const postcode = str(fd, "postcode");
  const suburb = str(fd, "suburb");
  const state = str(fd, "state").toUpperCase();
  const platform = str(fd, "platform");
  const url = str(fd, "source_url");
  const website = str(fd, "website");
  const phone = str(fd, "phone");
  const email = str(fd, "email");
  const notes = str(fd, "notes");

  if (name.length < 2 || name.length > 120) errors.name = "Business name: 2 to 120 characters.";
  if (!VERTICALS.includes(vertical)) errors.vertical = "Pick which directory it belongs in.";
  if (!/^[0-9]{4}$/.test(postcode)) errors.postcode = "Postcode: 4 digits.";
  if (suburb.length > 80) errors.suburb = "Town or area: under 80 characters.";
  if (state && !STATES.includes(state)) errors.state = "Pick a state.";
  if (!isSourcePlatform(platform)) errors.platform = "Tell us where you found it.";
  const opt = SOURCE_PLATFORM_OPTIONS.find((o) => o.value === platform);
  if (url && !isHttpUrl(url)) errors.source_url = "Paste a full URL starting with http:// or https://.";
  if (opt?.needsUrl && !url) errors.source_url = `${opt.label}: paste the page URL.`;
  if (website && !isHttpUrl(website)) errors.website = "Website must start with http:// or https://.";
  if (email && !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(email)) errors.email = "That email doesn't look right.";
  if (phone && !/^[0-9 ()+-]{6,20}$/.test(phone)) errors.phone = "Phone: digits, spaces and brackets only.";
  if (notes.length > 2000) errors.notes = "Notes: keep under 2000 characters.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const p = platform as SourcePlatform;
  const urlKind: SourceUrlKind = url ? "site" : "search";
  const sourceUrl = url || buildSearchUrl(p, name, postcode, state || "NSW");
  const site = website || (p === "official_website" ? url : "");

  const record: ImportRecord = {
    vertical,
    source_platform: p,
    source_external_id: directoryExternalId(p, name, postcode),
    source_url: sourceUrl,
    name,
    postcode,
    category_slug: categorySlug || null,
    suburb: suburb || null,
    state: state || null,
    website: site || null,
    // Private. Phone/email never reach the public contact columns.
    raw_payload: {
      type: categorySlug || null,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
      found_on: p,
      source_url_kind: urlKind,
      entered_by: userId,
      entered_via: "directory quick-add",
      entered_at: new Date().toISOString(),
    },
  };
  return { ok: true, record, urlKind };
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
  const built = buildRecord(formData, gate.userId);
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
  const built = buildRecord(formData, gate.userId);
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
