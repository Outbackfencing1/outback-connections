// /api/cron/adopt-staff-posts — re-files directory entries that staff posted
// through the PUBLIC form (owner-posted by mistake) as honest unclaimed rows.
//
// For each active service_offering with data_source='manual' owned by a
// staff or directory-contributor account (not an admin):
//   adopt -> ingest_scraped_business() exactly like /dashboard/directory/add
//            (Unclaimed badge, source, business record to claim, phone/email
//            only in private listing_sources.raw_payload, 60-day clock), then
//            close the original with canonical_listing_id so its URL 301s.
//   hold  -> close it (not delete) and list it in the team email for a person
//            to decide. Reopen by setting status back to 'active'.
// Nothing is deleted. `?dry=1` returns the plan without writing.
// Scheduled daily in vercel.json. Authorised by CRON_SECRET.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authoriseCron } from "@/lib/cron-auth";
import { buildDirectoryRecord } from "@/lib/directory-records";
import { screenStaffPost, type StaffPostRow } from "@/lib/staff-post-adoption";
import { DEFAULT_FROM, NOTIFICATION_TO, escapeHtml, sendEmail } from "@/lib/email";
import { listingHref } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 60;
const EXPIRY_DAYS = 60;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

type Outcome =
  | { id: string; title: string; verdict: "adopted"; href: string | null }
  | { id: string; title: string; verdict: "held"; reasons: string[] }
  | { id: string; title: string; verdict: "error"; message: string };

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
      "id, title, description, postcode, state, contact_phone, contact_email, created_at, user_id, metadata, category:categories(slug)"
    )
    .eq("kind", "service_offering")
    .eq("data_source", "manual")
    .eq("status", "active")
    .is("canonical_listing_id", null)
    .in("user_id", staffIds)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const originalMeta = new Map<string, Record<string, unknown>>();
  const candidates: StaffPostRow[] = (rows ?? []).map((r) => {
    const cat = Array.isArray(r.category) ? r.category[0] : r.category;
    originalMeta.set(r.id, r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : {});
    return { ...r, category_slug: (cat as { slug?: string } | null)?.slug ?? null } as StaffPostRow;
  });

  const plan = candidates.map((row) => ({ row, screen: screenStaffPost(row) }));
  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      candidates: plan.length,
      adopt: plan.filter((p) => p.screen.verdict === "adopt").map((p) => p.row.title),
      hold: plan
        .filter((p) => p.screen.verdict === "hold")
        .map((p) => ({ title: p.row.title, reasons: p.screen.verdict === "hold" ? p.screen.reasons : [] })),
    });
  }

  const now = new Date().toISOString();
  const outcomes: Outcome[] = [];
  for (const { row, screen } of plan) {
    if (screen.verdict === "hold") {
      const { error: e } = await admin
        .from("listings")
        .update({
          status: "closed",
          closed_at: now,
          metadata: { ...originalMeta.get(row.id), held_from_staff_post: { at: now, reasons: screen.reasons } },
        })
        .eq("id", row.id);
      outcomes.push(
        e
          ? { id: row.id, title: row.title, verdict: "error", message: e.message }
          : { id: row.id, title: row.title, verdict: "held", reasons: screen.reasons }
      );
      continue;
    }

    const built = buildDirectoryRecord(screen.input, {
      enteredBy: row.user_id,
      enteredVia: "adopted from public post form",
      enteredAt: row.created_at,
    });
    if (!built.ok) {
      outcomes.push({ id: row.id, title: row.title, verdict: "error", message: Object.values(built.errors).join("; ") });
      continue;
    }
    const r = built.record;
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
    const newId = (data as { listing_id?: string } | null)?.listing_id;
    if (ingErr || !newId) {
      outcomes.push({ id: row.id, title: row.title, verdict: "error", message: ingErr?.message ?? "no listing id" });
      continue;
    }

    const { data: fresh } = await admin.from("listings").select("slug, kind, metadata").eq("id", newId).maybeSingle();
    const meta = fresh?.metadata && typeof fresh.metadata === "object" ? (fresh.metadata as Record<string, unknown>) : {};
    await admin.from("listings").update({ metadata: { ...meta, source_url_kind: built.urlKind } }).eq("id", newId);

    // Close the owner-posted original; its URL now 301s to the new row.
    const { error: closeErr } = await admin
      .from("listings")
      .update({
        status: "closed",
        closed_at: now,
        canonical_listing_id: newId,
        contact_phone: null,
        contact_email: null,
        metadata: { ...originalMeta.get(row.id), adopted_from_staff_post: { at: now, into: newId } },
      })
      .eq("id", row.id);
    outcomes.push(
      closeErr
        ? { id: row.id, title: row.title, verdict: "error", message: `adopted but original not closed: ${closeErr.message}` }
        : {
            id: row.id,
            title: row.title,
            verdict: "adopted",
            href: fresh?.slug && fresh?.kind ? listingHref(fresh.kind, fresh.slug) : null,
          }
    );
  }

  const adopted = outcomes.filter((o) => o.verdict === "adopted");
  const held = outcomes.filter((o): o is Extract<Outcome, { verdict: "held" }> => o.verdict === "held");
  const errors = outcomes.filter((o): o is Extract<Outcome, { verdict: "error" }> => o.verdict === "error");

  if (outcomes.length > 0) {
    const text = [
      `Directory clean-up: ${adopted.length} published as unclaimed entries, ${held.length} held for a look, ${errors.length} errors.`,
      ``,
      `These were added through the public "post a listing" form instead of ${BASE_URL}/dashboard/directory/add.`,
      ``,
      ...(held.length
        ? ["Held (closed, not deleted; reopen by setting status to active):", ...held.map((h) => `- ${h.title}: ${h.reasons.join(", ")}`), ""]
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
    held: held.map((h) => ({ title: h.title, reasons: h.reasons })),
    errors,
  });
}
