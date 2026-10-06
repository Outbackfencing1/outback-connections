// /api/cron/adopt-staff-posts — re-files directory entries that staff posted
// through the PUBLIC form (owner-posted by mistake) as honest unclaimed rows.
//
// Scope: service_offering rows with data_source='manual' owned by a staff or
// directory-contributor account (not an admin) and not linked to a business.
// Genuine owner posts and claimed businesses are never touched.
//
// Each run is bounded and resumable (lib/staff-post-cleanup.ts): it clears
// contact from already-closed staff posts first, then fixes quote requests
// left on adopted originals, then adopts a small batch, and stops starting new
// rows or stages at a 35s deadline (each call is capped to the time left), so
// with the reserved count and the bounded team email it always returns a
// receipt inside maxDuration. The receipt
// says what was done, what failed and whether more work remains; it holds
// counts and business names only, never phone/email.
//   adopt -> ingest_scraped_business() exactly like /dashboard/directory/add
//            (Unclaimed badge, source, business record to claim, phone/email
//            only in private listing_sources.raw_payload, 60-day clock), move
//            any quote requests, then close the original with
//            canonical_listing_id so its URL 301s.
//   hold  -> archive its phone/email in a private listing_sources row, then
//            close it (not delete) for a person to decide. Never picked up again.
// Every listing must keep a phone, an email or a source URL
// (listings_contact_required), so clearing contact always sets source_url.
// Nothing is deleted. `?dry=1` reads only and sends nothing.
// Scheduled daily in vercel.json. Authorised by the CRON_SECRET bearer header
// only (a secret in the URL ends up in logs).
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { authoriseCron } from "@/lib/cron-auth";
import { NOTIFY_BUDGET_MS, redact, runCleanup, type CleanupStore, type ContactRow, type CandidateRow, type Receipt } from "@/lib/staff-post-cleanup";
import { DEFAULT_FROM, NOTIFICATION_TO, escapeHtml, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXPIRY_DAYS = 60;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";
const ARCHIVE_PLATFORM = "staff_post";
const UNIQUE_VIOLATION = "23505";

type PgError = { message: string; code?: string } | null;
const check = (error: PgError) => {
  if (error) throw new Error(error.message);
};

function supabaseStore(admin: SupabaseClient): CleanupStore {
  const staffPosts = () =>
    admin.from("listings").select("id", { count: "exact", head: true }).eq("kind", "service_offering").eq("data_source", "manual");

  return {
    async staffIds() {
      const { data, error } = await admin
        .from("user_profiles")
        .select("user_id, is_admin, is_staff, directory_contributor")
        .or("is_staff.eq.true,directory_contributor.eq.true");
      check(error);
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
        .order("created_at", { ascending: true })
        .limit(limit);
      check(error);
      return (data ?? []) as ContactRow[];
    },

    async strandedOriginals(staffIds, limit) {
      const { data: originals, error } = await admin
        .from("listings")
        .select("id, title, canonical_listing_id")
        .eq("kind", "service_offering")
        .eq("data_source", "manual")
        .eq("status", "closed")
        .in("user_id", staffIds)
        .not("canonical_listing_id", "is", null)
        .limit(500);
      check(error);
      const ids = (originals ?? []).map((o) => o.id as string);
      if (ids.length === 0) return [];
      const { data: enq, error: enqErr } = await admin.from("listing_enquiries").select("listing_id").in("listing_id", ids);
      check(enqErr);
      const withEnquiries = new Set((enq ?? []).map((e) => e.listing_id as string));
      return (originals ?? [])
        .filter((o) => withEnquiries.has(o.id as string))
        .slice(0, limit)
        .map((o) => ({ id: o.id as string, title: o.title as string, canonical_listing_id: o.canonical_listing_id as string }));
    },

    async activeCandidates(staffIds, limit) {
      const { data, error } = await admin
        .from("listings")
        .select(
          "id, title, description, postcode, state, contact_phone, contact_email, source_url, created_at, user_id, metadata, category:categories(slug)"
        )
        .eq("kind", "service_offering")
        .eq("data_source", "manual")
        .eq("status", "active")
        .is("canonical_listing_id", null)
        .is("business_id", null)
        .is("metadata->held_from_staff_post", null)
        .in("user_id", staffIds)
        .order("created_at", { ascending: true })
        .limit(limit);
      check(error);
      return (data ?? []).map((r) => {
        const cat = Array.isArray(r.category) ? r.category[0] : r.category;
        const { category: _category, ...rest } = r;
        void _category;
        return {
          ...rest,
          metadata: r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : {},
          category_slug: (cat as { slug?: string } | null)?.slug ?? null,
        } as CandidateRow;
      });
    },

    async remaining(staffIds) {
      const [closed, active, stranded] = await Promise.all([
        staffPosts().eq("status", "closed").in("user_id", staffIds).or("contact_phone.not.is.null,contact_email.not.is.null"),
        staffPosts()
          .eq("status", "active")
          .in("user_id", staffIds)
          .is("canonical_listing_id", null)
          .is("business_id", null)
          .is("metadata->held_from_staff_post", null),
        this.strandedOriginals(staffIds, 500),
      ]);
      check(closed.error);
      check(active.error);
      return {
        closed_with_contact: closed.count ?? 0,
        active_candidates: active.count ?? 0,
        stranded_originals: stranded.length,
      };
    },

    // Keeps a post's phone/email in a private listing_sources row (admin
    // read, service-role write) before they are cleared from the listing. One
    // row per original listing (unique source key); a re-run or an
    // overlapping run finds it and leaves it alone.
    async archiveContact(row, now) {
      if (!row.contact_phone && !row.contact_email) return;
      const externalId = `${ARCHIVE_PLATFORM}:${row.id}`;
      const { data: existing, error: findErr } = await admin
        .from("listing_sources")
        .select("id")
        .eq("source_platform", ARCHIVE_PLATFORM)
        .eq("source_external_id", externalId)
        .maybeSingle();
      check(findErr);
      if (existing) return;
      const { error } = await admin.from("listing_sources").insert({
        listing_id: row.id,
        source_platform: ARCHIVE_PLATFORM,
        source_external_id: externalId,
        raw_payload: {
          phone: row.contact_phone,
          email: row.contact_email,
          entered_by: row.user_id,
          entered_via: "public post form (staff)",
          archived_at: now,
        },
        active: false,
      });
      if (error && error.code !== UNIQUE_VIOLATION) throw new Error(error.message);
    },

    async clearClosedContact(id, sourceUrl) {
      const { data, error } = await admin
        .from("listings")
        .update({ contact_phone: null, contact_email: null, source_url: sourceUrl })
        .eq("id", id)
        .eq("status", "closed")
        .or("contact_phone.not.is.null,contact_email.not.is.null")
        .select("id");
      check(error);
      return (data ?? []).length > 0;
    },

    async ingest(r) {
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
      check(error);
      const out = data as { listing_id?: string; business_id?: string } | null;
      if (!out?.listing_id) throw new Error("no listing id returned");
      return { listing_id: out.listing_id, business_id: out.business_id ?? null };
    },

    async labelSource(listingId, urlKind) {
      const { data: fresh, error } = await admin.from("listings").select("metadata").eq("id", listingId).maybeSingle();
      check(error);
      const meta = fresh?.metadata && typeof fresh.metadata === "object" ? (fresh.metadata as Record<string, unknown>) : {};
      if (meta.source_url_kind === urlKind) return;
      const { error: upErr } = await admin
        .from("listings")
        .update({ metadata: { ...meta, source_url_kind: urlKind } })
        .eq("id", listingId);
      check(upErr);
    },

    async businessOf(listingId) {
      const { data, error } = await admin.from("listings").select("business_id").eq("id", listingId).maybeSingle();
      check(error);
      return (data?.business_id as string | null) ?? null;
    },

    // Quote requests follow the business, so the new row's response stats and
    // the enquiry queue see them.
    async moveEnquiries(fromId, toId, businessId) {
      const { data, error } = await admin
        .from("listing_enquiries")
        .update({ listing_id: toId, business_id: businessId })
        .eq("listing_id", fromId)
        .select("id");
      check(error);
      return (data ?? []).length;
    },

    async closeAdopted(row, newId, sourceUrl, now) {
      const { data, error } = await admin
        .from("listings")
        .update({
          status: "closed",
          closed_at: now,
          canonical_listing_id: newId,
          contact_phone: null,
          contact_email: null,
          source_url: sourceUrl,
          metadata: { ...row.metadata, adopted_from_staff_post: { at: now, into: newId } },
        })
        .eq("id", row.id)
        .eq("status", "active")
        .select("id");
      check(error);
      return (data ?? []).length > 0;
    },

    async closeHeld(row, reasons, sourceUrl, now) {
      const { data, error } = await admin
        .from("listings")
        .update({
          status: "closed",
          closed_at: now,
          contact_phone: null,
          contact_email: null,
          source_url: sourceUrl,
          metadata: { ...row.metadata, held_from_staff_post: { at: now, reasons } },
        })
        .eq("id", row.id)
        .eq("status", "active")
        .select("id");
      check(error);
      return (data ?? []).length > 0;
    },
  };
}

function teamEmail(r: Receipt): string {
  return [
    `Directory clean-up: ${r.adopt.adopted} published as unclaimed entries, ${r.adopt.held} held for a look, ${r.errors.length} errors.`,
    ...(r.sweep.cleared ? [`Cleared phone/email from ${r.sweep.cleared} closed posts (kept privately).`] : []),
    ...(r.recover.enquiries_moved ? [`Moved ${r.recover.enquiries_moved} quote requests left on re-filed posts.`] : []),
    r.more_work ? "More to do: the next run carries on." : "Nothing left to do.",
    ``,
    `These were added through the public "post a listing" form instead of ${BASE_URL}/dashboard/directory/add.`,
    ``,
    ...(r.held.length
      ? [
          `Held (closed, not deleted). To list one, add it at ${BASE_URL}/dashboard/directory/add; its phone/email were moved to a private source record (listing_sources, platform staff_post) an admin can look up.`,
          ...r.held.map((h) => `- ${h.title}: ${h.reasons.join(", ")}`),
          "",
        ]
      : []),
    ...(r.errors.length ? ["Errors:", ...r.errors.map((e) => `- ${e.title ?? "(run)"} [${e.stage}]: ${e.message}`), ""] : []),
    ...(r.adopted_titles.length ? ["Published:", ...r.adopted_titles.map((t) => `- ${t}`)] : []),
  ].join("\n");
}

export async function GET(req: NextRequest) {
  if (!authoriseCron(req, { headerOnly: true })) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "admin_unavailable" }, { status: 500 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const receipt = await runCleanup(supabaseStore(admin), { dry });

  const didSomething =
    receipt.sweep.cleared + receipt.recover.enquiries_moved + receipt.adopt.adopted + receipt.adopt.held + receipt.errors.length > 0;
  if (!dry && didSomething) {
    const text = teamEmail(receipt);
    // Bounded: the email can't hold the route past its reserved window.
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new Error(`no answer within ${NOTIFY_BUDGET_MS / 1000}s`));
        }, NOTIFY_BUDGET_MS);
      });
      const sending = sendEmail({
        signal: abort.signal,
        to: NOTIFICATION_TO,
        from: DEFAULT_FROM,
        subject: `Directory clean-up: ${receipt.adopt.adopted} published, ${receipt.adopt.held} held${receipt.more_work ? ", more to do" : ""}`,
        text,
        html: `<pre style="font-family:-apple-system,system-ui,sans-serif;white-space:pre-wrap;">${escapeHtml(text)}</pre>`,
      });
      const sent = await Promise.race([sending, timedOut]);
      if (!sent.ok) throw new Error("reason" in sent && sent.reason ? String(sent.reason) : "not sent");
    } catch (e) {
      receipt.errors.push({ id: null, title: null, stage: "read", message: `team email not sent: ${redact(String(e))}` });
      receipt.ok = false;
    } finally {
      clearTimeout(timer);
    }
  }

  const { adopted_titles: _titles, ...body } = receipt;
  void _titles;
  return NextResponse.json(body);
}
