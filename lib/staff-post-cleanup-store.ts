// lib/staff-post-cleanup-store.ts
// The staff-post clean-up's store over the live tables (service role, server
// only). Every write is conditional or idempotent, so the result says whether
// this run changed the row or another run had already done it; a write the
// database refuses is reported as failed, never as done.
import type { SupabaseClient } from "@supabase/supabase-js";
import { closedOriginalSourceUrl } from "./staff-post-adoption";
import type { ActiveRow, AdoptedOriginal, CleanupStore, ContactRow, Write } from "./staff-post-cleanup";
import type { DirectoryImportRecord } from "./directory-records";

const EXPIRY_DAYS = 60;
const ARCHIVE_PLATFORM = "staff_post";
const CHUNK = 100;
/** A PostgREST filter value in double quotes (names can hold commas and brackets). */
const quote = (v: string) => `"${v.replace(/["\\]/g, (c) => `\\${c}`)}"`;

const staffScope = (admin: SupabaseClient, staffIds: string[], status: "active" | "closed") =>
  admin.from("listings").select("id", { count: "exact", head: true }).eq("kind", "service_offering").eq("data_source", "manual").eq("status", status).in("user_id", staffIds);

/** The clean-up store over the live tables (service role, server only). */
export function supabaseCleanupStore(admin: SupabaseClient): CleanupStore {
  const write = (error: { message: string } | null, rows: unknown[] | null): Write =>
    error ? { ok: false, error: error.message } : { ok: true, changed: (rows ?? []).length > 0 };

  /** Quote requests still on a staff post that was adopted (closed and linked to its new row). */
  const stranded = (staffIds: string[], columns: string, head = false) =>
    admin
      .from("listing_enquiries")
      .select(columns, head ? { count: "exact", head: true } : undefined)
      .eq("listing.kind", "service_offering")
      .eq("listing.data_source", "manual")
      .eq("listing.status", "closed")
      .not("listing.canonical_listing_id", "is", null)
      .in("listing.user_id", staffIds);

  const ingestOnce = (r: DirectoryImportRecord) =>
    admin.rpc("ingest_scraped_business", {
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

  const store: CleanupStore = {
    async staffIds() {
      const { data, error } = await admin.from("user_profiles").select("user_id, is_admin, is_staff, directory_contributor").or("is_staff.eq.true,directory_contributor.eq.true");
      if (error) throw new Error(`staff lookup failed: ${error.message}`);
      return (data ?? []).filter((p) => !p.is_admin).map((p) => p.user_id as string);
    },
    async closedWithContact(staffIds, limit) {
      const { data, error } = await admin
        .from("listings")
        .select("id, title, postcode, state, contact_phone, contact_email, source_url, user_id")
        .eq("kind", "service_offering")
        .eq("data_source", "manual")
        .eq("status", "closed")
        .in("user_id", staffIds)
        .or("contact_phone.not.is.null,contact_email.not.is.null")
        .order("id")
        .limit(limit);
      if (error) throw new Error(`closed rows read failed: ${error.message}`);
      return (data ?? []) as ContactRow[];
    },
    async adoptedOriginals(staffIds, limit) {
      // Only originals that still hold quote requests: an inner join, so the
      // repair reaches every stranded enquiry however many originals there are.
      const { data, error } = await stranded(staffIds, "listing_id, listing:listings!inner(canonical_listing_id)").order("listing_id").limit(limit);
      if (error) throw new Error(`adopted originals read failed: ${error.message}`);
      const seen = new Map<string, AdoptedOriginal>();
      for (const r of (data ?? []) as unknown as { listing_id: string; listing: { canonical_listing_id: string } | { canonical_listing_id: string }[] }[]) {
        const l = Array.isArray(r.listing) ? r.listing[0] : r.listing;
        if (l?.canonical_listing_id) seen.set(r.listing_id, { id: r.listing_id, canonical_listing_id: l.canonical_listing_id });
      }
      return [...seen.values()];
    },
    async enquiryCounts(ids) {
      const counts = new Map<string, number>();
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await admin.from("listing_enquiries").select("listing_id").in("listing_id", ids.slice(i, i + CHUNK));
        if (error) throw new Error(`enquiry read failed: ${error.message}`);
        for (const r of (data ?? []) as { listing_id: string }[]) counts.set(r.listing_id, (counts.get(r.listing_id) ?? 0) + 1);
      }
      return counts;
    },
    async activeCandidates(staffIds, limit) {
      const { data, error } = await admin
        .from("listings")
        .select("id, title, description, postcode, state, contact_phone, contact_email, source_url, created_at, user_id, metadata, category:categories(slug)")
        .eq("kind", "service_offering")
        .eq("data_source", "manual")
        .eq("status", "active")
        .is("canonical_listing_id", null)
        .is("metadata->held_from_staff_post", null)
        .in("user_id", staffIds)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`active rows read failed: ${error.message}`);
      return (data ?? []).map((r) => {
        const cat = Array.isArray(r.category) ? r.category[0] : r.category;
        return {
          ...r,
          metadata: r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : {},
          category_slug: (cat as { slug?: string } | null)?.slug ?? null,
        } as ActiveRow;
      });
    },
    async archiveContact(row, now) {
      if (!row.contact_phone && !row.contact_email) return { ok: true, changed: false };
      const externalId = `${ARCHIVE_PLATFORM}:${row.id}`;
      const { data: existing, error: findErr } = await admin.from("listing_sources").select("id").eq("source_platform", ARCHIVE_PLATFORM).eq("source_external_id", externalId).maybeSingle();
      if (findErr) return { ok: false, error: findErr.message };
      if (existing) return { ok: true, changed: false };
      const { error } = await admin.from("listing_sources").insert({
        listing_id: row.id,
        source_platform: ARCHIVE_PLATFORM,
        source_external_id: externalId,
        raw_payload: { phone: row.contact_phone, email: row.contact_email, entered_by: row.user_id, entered_via: "public post form (staff)", archived_at: now },
        active: false,
      });
      // Another run archived it first (unique platform + external id): it's there.
      if (error?.code === "23505") return { ok: true, changed: false };
      return error ? { ok: false, error: error.message } : { ok: true, changed: true };
    },
    async clearClosedContact(row) {
      if (!row.contact_phone && !row.contact_email) return { ok: true, changed: false };
      // Compare-and-swap on the values this run read: a row another run already
      // cleared (or someone edited) no longer matches, so it isn't counted twice.
      // (PostgREST refuses an `or` filter on an update, so match each column.)
      let q = admin
        .from("listings")
        .update({ contact_phone: null, contact_email: null, source_url: row.source_url ?? closedOriginalSourceUrl(row) })
        .eq("id", row.id)
        .eq("status", "closed");
      q = row.contact_phone === null ? q.is("contact_phone", null) : q.eq("contact_phone", row.contact_phone);
      q = row.contact_email === null ? q.is("contact_email", null) : q.eq("contact_email", row.contact_email);
      const { data, error } = await q.select("id");
      return write(error, data);
    },
    async findExisting(r, staffIds) {
      // Case-insensitive exact name match; PostgREST treats * as a wildcard and
      // SQL treats % and _ as wildcards, so escape those (and skip names with *).
      if (r.name.includes("*")) return null;
      const name = r.name.replace(/[\\%_]/g, (c) => `\\${c}`);
      const [biz, own, copy] = await Promise.all([
        admin.from("businesses").select("id").eq("postcode", r.postcode).neq("claim_status", "unclaimed").or(`trading_name.ilike.${quote(name)},legal_name.ilike.${quote(name)}`).limit(1),
        admin
          .from("listings")
          .select("id")
          .eq("postcode", r.postcode)
          .ilike("title", name)
          .eq("status", "active")
          .in("data_source", ["manual", "claimed", "verified"])
          .not("user_id", "in", `(${staffIds.join(",")})`)
          .limit(1),
        admin
          .from("listings")
          .select("id, business_id, source_external_id")
          .eq("postcode", r.postcode)
          .ilike("title", name)
          .eq("status", "active")
          .in("data_source", ["scraped", "imported"])
          .order("created_at", { ascending: true })
          .limit(1),
      ]);
      const err = biz.error ?? own.error ?? copy.error;
      if (err) throw new Error(`existing-business check failed: ${err.message}`);
      if ((biz.data ?? []).length) return { owned: "the business has been claimed by its owner" };
      if ((own.data ?? []).length) return { owned: "the business already has its own listing" };
      const c = (copy.data ?? [])[0] as { id: string; business_id: string | null; source_external_id: string | null } | undefined;
      return c ? { unclaimed: { listing_id: c.id, business_id: c.business_id, source_external_id: c.source_external_id } } : null;
    },
    async ingest(r) {
      let res = await ingestOnce(r);
      // An overlapping run created the same business a moment ago (unique on its
      // source id); ingest is idempotent, so asking again returns that row.
      if (res.error?.code === "23505") res = await ingestOnce(r);
      const { data, error } = res;
      if (error) return { ok: false, error: error.message, claimed: /claimed business/i.test(error.message) };
      const got = data as { listing_id?: string; business_id?: string } | null;
      return got?.listing_id ? { ok: true, listing_id: got.listing_id, business_id: got.business_id ?? null } : { ok: false, error: "no listing id" };
    },
    async labelCopy(listingId, urlKind) {
      const { data: fresh, error: readErr } = await admin.from("listings").select("metadata").eq("id", listingId).maybeSingle();
      if (readErr) return { ok: false, error: readErr.message };
      const meta = fresh?.metadata && typeof fresh.metadata === "object" ? (fresh.metadata as Record<string, unknown>) : {};
      if (meta.source_url_kind === urlKind) return { ok: true, changed: false };
      const { data, error } = await admin.from("listings").update({ metadata: { ...meta, source_url_kind: urlKind } }).eq("id", listingId).select("id");
      return write(error, data);
    },
    async businessOf(listingId) {
      const { data } = await admin.from("listings").select("business_id").eq("id", listingId).maybeSingle();
      return (data as { business_id?: string | null } | null)?.business_id ?? null;
    },
    async moveEnquiries(from, to, businessId) {
      const { data, error } = await admin.from("listing_enquiries").update({ listing_id: to, business_id: businessId }).eq("listing_id", from).select("id");
      return error ? { ok: false, error: error.message } : { ok: true, moved: (data ?? []).length };
    },
    async closeAdopted(row, intoId, sourceUrl, now) {
      const { data, error } = await admin
        .from("listings")
        .update({
          status: "closed",
          closed_at: now,
          canonical_listing_id: intoId,
          contact_phone: null,
          contact_email: null,
          source_url: sourceUrl,
          metadata: { ...row.metadata, adopted_from_staff_post: { at: now, into: intoId } },
        })
        .eq("id", row.id)
        .eq("status", "active")
        .is("canonical_listing_id", null)
        .select("id");
      return write(error, data);
    },
    async closeHeld(row, reasons, now) {
      const { data, error } = await admin
        .from("listings")
        .update({
          status: "closed",
          closed_at: now,
          contact_phone: null,
          contact_email: null,
          source_url: row.source_url ?? closedOriginalSourceUrl(row),
          metadata: { ...row.metadata, held_from_staff_post: { at: now, reasons } },
        })
        .eq("id", row.id)
        .eq("status", "active")
        .is("canonical_listing_id", null)
        .select("id");
      return write(error, data);
    },
    async remaining(staffIds) {
      const [a, c, e] = await Promise.all([
        staffScope(admin, staffIds, "active").is("canonical_listing_id", null).is("metadata->held_from_staff_post", null),
        staffScope(admin, staffIds, "closed").or("contact_phone.not.is.null,contact_email.not.is.null"),
        stranded(staffIds, "id, listing:listings!inner(id)", true),
      ]);
      if (a.error || c.error || e.error || a.count === null || c.count === null || e.count === null) return null;
      return { active: a.count, closedWithContact: c.count, enquiriesOnClosed: e.count };
    },
  };
  return store;
}
