// /api/cron/adopt-staff-posts — re-files directory entries that staff posted
// through the PUBLIC form (owner-posted by mistake) as honest unclaimed rows.
//
// For each active service_offering with data_source='manual' owned by a
// staff or directory-contributor account (not an admin):
//   adopt -> ingest_scraped_business() exactly like /dashboard/directory/add
//            (Unclaimed badge, source, business record to claim, phone/email
//            only in private listing_sources.raw_payload, 60-day clock), then
//            close the original with canonical_listing_id so its URL 301s, and
//            move any quote requests on it to the new row.
//   hold  -> close it (not delete), move its phone/email into a private
//            listing_sources row, and list it in the team email for a person
//            to decide. A held row is never picked up again.
// Then sweep: any already-closed staff post still carrying phone/email has
// them moved into listing_sources and cleared from the listing.
// Every listing must keep a phone, an email or a source URL
// (listings_contact_required), so clearing contact always sets source_url.
// Nothing is deleted. `?dry=1` returns the plan without writing.
// Scheduled daily in vercel.json. Authorised by CRON_SECRET.
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { authoriseCron } from "@/lib/cron-auth";
import { closedOriginalSourceUrl, planStaffPost, type StaffPostRow } from "@/lib/staff-post-adoption";
import { DEFAULT_FROM, NOTIFICATION_TO, escapeHtml, sendEmail } from "@/lib/email";
import { listingHref } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 60;
const SWEEP_BATCH = 100;
const EXPIRY_DAYS = 60;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";
const ARCHIVE_PLATFORM = "staff_post";

type Outcome =
  | { id: string; title: string; verdict: "adopted"; href: string | null }
  | { id: string; title: string; verdict: "held"; reasons: string[] }
  | { id: string; title: string; verdict: "error"; message: string };

type ContactRow = Pick<StaffPostRow, "id" | "title" | "postcode" | "state" | "contact_phone" | "contact_email" | "user_id"> & {
  source_url: string | null;
};

/**
 * Keeps a post's phone/email in a private listing_sources row (admin read,
 * service-role write) before they are cleared from the listing. One row per
 * original listing; re-runs leave it alone.
 */
async function archiveContact(admin: SupabaseClient, row: ContactRow, now: string): Promise<string | null> {
  if (!row.contact_phone && !row.contact_email) return null;
  const externalId = `${ARCHIVE_PLATFORM}:${row.id}`;
  const { data: existing, error: findErr } = await admin
    .from("listing_sources")
    .select("id")
    .eq("source_platform", ARCHIVE_PLATFORM)
    .eq("source_external_id", externalId)
    .maybeSingle();
  if (findErr) return findErr.message;
  if (existing) return null;
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
  return error?.message ?? null;
}

export async function GET(req: NextRequest) {
  if (!authoriseCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "admin_unavailable" }, { status: 500 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const { data: staff, error: staffErr } = await admin
    .from("user_profiles")
    .select("user_id, is_admin, is_staff, directory_contributor")
    .or("is_staff.eq.true,directory_contributor.eq.true");
  if (staffErr) return NextResponse.json({ ok: false, error: staffErr.message }, { status: 500 });
  const staffIds = (staff ?? []).filter((p) => !p.is_admin).map((p) => p.user_id as string);
  if (staffIds.length === 0) return NextResponse.json({ ok: true, candidates: 0, reason: "no_staff" });

  const { data: rows, error } = await admin
    .from("listings")
    .select(
      "id, title, description, postcode, state, contact_phone, contact_email, source_url, created_at, user_id, metadata, category:categories(slug)"
    )
    .eq("kind", "service_offering")
    .eq("data_source", "manual")
    .eq("status", "active")
    .is("canonical_listing_id", null)
    .is("metadata->held_from_staff_post", null)
    .in("user_id", staffIds)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Closed staff posts that still hold phone/email (held rows, and originals
  // closed before the clean-up cleared contact).
  const { data: leftovers, error: sweepErr } = await admin
    .from("listings")
    .select("id, title, postcode, state, contact_phone, contact_email, source_url, user_id")
    .eq("kind", "service_offering")
    .eq("data_source", "manual")
    .eq("status", "closed")
    .in("user_id", staffIds)
    .or("contact_phone.not.is.null,contact_email.not.is.null")
    .limit(SWEEP_BATCH);
  if (sweepErr) return NextResponse.json({ ok: false, error: sweepErr.message }, { status: 500 });

  const originalMeta = new Map<string, Record<string, unknown>>();
  const candidates = (rows ?? []).map((r) => {
    const cat = Array.isArray(r.category) ? r.category[0] : r.category;
    originalMeta.set(r.id, r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : {});
    return { ...r, category_slug: (cat as { slug?: string } | null)?.slug ?? null } as StaffPostRow & {
      source_url: string | null;
    };
  });

  const plan = candidates.map((row) => ({ row, p: planStaffPost(row) }));
  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      candidates: plan.length,
      adopt: plan.flatMap(({ row, p }) =>
        p.verdict === "adopt" ? [{ title: row.title, found_on: p.record.source_platform, state: p.record.state }] : []
      ),
      hold: plan.flatMap(({ row, p }) => (p.verdict === "hold" ? [{ title: row.title, reasons: p.reasons }] : [])),
      closed_rows_to_clear_contact: (leftovers ?? []).length,
    });
  }

  const now = new Date().toISOString();
  const outcomes: Outcome[] = [];
  for (const { row, p } of plan) {
    if (p.verdict === "hold") {
      const archiveErr = await archiveContact(admin, row, now);
      if (archiveErr) {
        outcomes.push({ id: row.id, title: row.title, verdict: "error", message: `contact not archived: ${archiveErr}` });
        continue;
      }
      const { error: e } = await admin
        .from("listings")
        .update({
          status: "closed",
          closed_at: now,
          contact_phone: null,
          contact_email: null,
          source_url: row.source_url ?? closedOriginalSourceUrl(row),
          metadata: { ...originalMeta.get(row.id), held_from_staff_post: { at: now, reasons: p.reasons } },
        })
        .eq("id", row.id);
      outcomes.push(
        e
          ? { id: row.id, title: row.title, verdict: "error", message: e.message }
          : { id: row.id, title: row.title, verdict: "held", reasons: p.reasons }
      );
      continue;
    }

    const r = p.record;
    const { data, error: ingErr } = await admin.rpc("ingest_scraped_business", {
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
    const ingested = data as { listing_id?: string; business_id?: string } | null;
    const newId = ingested?.listing_id;
    if (ingErr || !newId) {
      outcomes.push({ id: row.id, title: row.title, verdict: "error", message: ingErr?.message ?? "no listing id" });
      continue;
    }

    const { data: fresh } = await admin.from("listings").select("slug, kind, metadata").eq("id", newId).maybeSingle();
    const meta = fresh?.metadata && typeof fresh.metadata === "object" ? (fresh.metadata as Record<string, unknown>) : {};
    const { error: metaErr } = await admin
      .from("listings")
      .update({ metadata: { ...meta, source_url_kind: p.urlKind } })
      .eq("id", newId);

    // Close the owner-posted original; its URL now 301s to the new row. The
    // new row's raw_payload has the phone/email the builder accepted; the
    // archive keeps them exactly as posted.
    const archiveErr = await archiveContact(admin, row, now);
    if (archiveErr) {
      outcomes.push({ id: row.id, title: row.title, verdict: "error", message: `adopted but contact not archived: ${archiveErr}` });
      continue;
    }
    const { error: closeErr } = await admin
      .from("listings")
      .update({
        status: "closed",
        closed_at: now,
        canonical_listing_id: newId,
        contact_phone: null,
        contact_email: null,
        source_url: r.source_url,
        metadata: { ...originalMeta.get(row.id), adopted_from_staff_post: { at: now, into: newId } },
      })
      .eq("id", row.id);
    if (closeErr) {
      outcomes.push({ id: row.id, title: row.title, verdict: "error", message: `adopted but original not closed: ${closeErr.message}` });
      continue;
    }

    // Quote requests follow the business, so the new row's response stats
    // and the enquiry queue see them.
    const { error: enqErr } = await admin
      .from("listing_enquiries")
      .update({ listing_id: newId, business_id: ingested?.business_id ?? null })
      .eq("listing_id", row.id);

    if (metaErr || enqErr) {
      outcomes.push({
        id: row.id,
        title: row.title,
        verdict: "error",
        message: `adopted, but ${[metaErr && `source label not saved (${metaErr.message})`, enqErr && `quote requests not moved (${enqErr.message})`]
          .filter(Boolean)
          .join("; ")}`,
      });
      continue;
    }
    outcomes.push({
      id: row.id,
      title: row.title,
      verdict: "adopted",
      href: fresh?.slug && fresh?.kind ? listingHref(fresh.kind, fresh.slug) : null,
    });
  }

  let cleared = 0;
  for (const row of (leftovers ?? []) as ContactRow[]) {
    const archiveErr = await archiveContact(admin, row, now);
    const { error: e } = archiveErr
      ? { error: { message: `contact not archived: ${archiveErr}` } }
      : await admin
          .from("listings")
          .update({ contact_phone: null, contact_email: null, source_url: row.source_url ?? closedOriginalSourceUrl(row) })
          .eq("id", row.id);
    if (e) outcomes.push({ id: row.id, title: row.title, verdict: "error", message: `closed row contact not cleared: ${e.message}` });
    else cleared += 1;
  }

  const adopted = outcomes.filter((o) => o.verdict === "adopted");
  const held = outcomes.filter((o): o is Extract<Outcome, { verdict: "held" }> => o.verdict === "held");
  const errors = outcomes.filter((o): o is Extract<Outcome, { verdict: "error" }> => o.verdict === "error");

  if (outcomes.length > 0 || cleared > 0) {
    const text = [
      `Directory clean-up: ${adopted.length} published as unclaimed entries, ${held.length} held for a look, ${errors.length} errors.`,
      ...(cleared ? [`Cleared phone/email from ${cleared} closed posts (kept privately).`] : []),
      ``,
      `These were added through the public "post a listing" form instead of ${BASE_URL}/dashboard/directory/add.`,
      ``,
      ...(held.length
        ? [
            `Held (closed, not deleted). To list one, add it at ${BASE_URL}/dashboard/directory/add; its phone/email were moved to a private source record (listing_sources, platform staff_post) an admin can look up.`,
            ...held.map((h) => `- ${h.title}: ${h.reasons.join(", ")}`),
            "",
          ]
        : []),
      ...(errors.length ? ["Errors:", ...errors.map((e) => `- ${e.title}: ${e.message}`), ""] : []),
      ...(adopted.length ? ["Published:", ...adopted.map((a) => `- ${a.title}${a.verdict === "adopted" && a.href ? ` ${BASE_URL}${a.href}` : ""}`)] : []),
    ].join("\n");
    await sendEmail({
      to: NOTIFICATION_TO,
      from: DEFAULT_FROM,
      subject: `Directory clean-up: ${adopted.length} published, ${held.length} held`,
      text,
      html: `<pre style="font-family:-apple-system,system-ui,sans-serif;white-space:pre-wrap;">${escapeHtml(text)}</pre>`,
    });
  }

  return NextResponse.json({
    ok: errors.length === 0,
    candidates: plan.length,
    adopted: adopted.length,
    cleared,
    held: held.map((h) => ({ title: h.title, reasons: h.reasons })),
    errors,
  });
}
