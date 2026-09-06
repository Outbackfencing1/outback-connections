// /api/cron/renewal-reminders
// Item 14: emails listing owners 3 days before expiry with a one-click
// signed-token renewal link.
//
// Scheduled via Vercel Cron in vercel.json. Authorised by the
// CRON_SECRET env var (Vercel sends it as the `Authorization: Bearer`
// header for cron jobs by default).
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signToken } from "@/lib/signed-tokens";
import { DEFAULT_FROM, NOTIFICATION_TO, buildHtmlFooter, buildTextFooter, sendEmail } from "@/lib/email";
import { ENQUIRY_OUTCOMES, OUTCOME_LABELS } from "@/lib/enquiry-outcome";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Auth: Vercel Cron sends 'Authorization: Bearer <CRON_SECRET>'.
  // We accept either that or a manual-trigger query param matching the
  // secret, so Josh can run it ad-hoc from the browser if needed.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    const ok =
      auth === `Bearer ${cronSecret}` ||
      new URL(request.url).searchParams.get("k") === cronSecret;
    if (!ok) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "no_admin_client" }, { status: 500 });
  }

  // Directory digest: scraped rows have no owner to email, so tell the team
  // once, 7 days out (each row falls in this 24h window exactly once).
  const digest = await sendDirectoryExpiryDigest(admin);
  const followups = await sendEnquiryFollowUps(admin);

  // Listings expiring in 2.5 to 3.5 days from now AND active
  const lower = new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000).toISOString();
  const upper = new Date(Date.now() + 3.5 * 24 * 60 * 60 * 1000).toISOString();

  const { data: listings } = await admin
    .from("listings")
    .select("id, user_id, title, slug, kind, expires_at")
    .eq("status", "active")
    .not("user_id", "is", null)
    .gte("expires_at", lower)
    .lt("expires_at", upper);

  if (!listings || listings.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "none_due", digest, followups });
  }

  // Pull user emails in one query
  const userIds = Array.from(new Set(listings.map((l) => l.user_id)));
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailByUser = new Map(
    (users?.users ?? []).filter((u) => userIds.includes(u.id) && u.email).map((u) => [u.id, u.email!])
  );

  let sent = 0;
  for (const l of listings) {
    const email = emailByUser.get(l.user_id);
    if (!email) continue;

    const token = signToken({
      p: "renew",
      u: l.user_id,
      l: l.id,
      ttlMs: 5 * 24 * 60 * 60 * 1000, // 5 days
    });
    const renewLink = `${BASE_URL}/listings/${l.id}/renew?t=${encodeURIComponent(token)}`;
    const detailLink = `${BASE_URL}${pathForKind(l.kind, l.slug)}`;
    const expiresStr = new Date(l.expires_at).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const text = [
      `G'day,`,
      ``,
      `Your listing on Outback Connections expires in 3 days (${expiresStr}):`,
      `${l.title}`,
      `${detailLink}`,
      ``,
      `Want to keep it up for another 30 days? Click here to renew:`,
      `${renewLink}`,
      ``,
      `(The renewal link is good for 5 days.)`,
      ``,
      `If the listing's done its job — match found, no longer needed, or you've sorted it elsewhere — you can mark it as filled in your dashboard:`,
      `${BASE_URL}/dashboard/listings`,
      ``,
      `That helps us improve the platform. No action needed if you're happy to let it expire.`,
      ``,
      `— Outback Connections`,
    ].join("\n");

    try {
      await sendEmail({
        to: email,
        from: DEFAULT_FROM,
        subject: `Your listing expires in 3 days`,
        text,
        html: `<pre style="font-family:-apple-system,system-ui,sans-serif;white-space:pre-wrap;">${escapeHtml(text)}</pre>`,
      });
      sent++;
    } catch (e) {
      console.error("[cron renewal] send failed for listing", l.id, e);
    }
  }

  return NextResponse.json({ ok: true, sent, total: listings.length, digest, followups });
}

// "Did they get back to you?" One email per forwarded enquiry, 7 to 30 days
// after it was sent, only when the farmer gave an email. Three signed
// one-click answers; the answer feeds "Responded to N of M" on the listing.
async function sendEnquiryFollowUps(admin: AdminClient): Promise<{ due: number; sent: number }> {
  const oldest = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const newest = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await admin
    .from("listing_enquiries")
    .select("id, anonymised_id, name, email, listing:listings(title)")
    .eq("status", "forwarded")
    .is("followup_sent_at", null)
    .is("outcome", null)
    .not("email", "is", null)
    .gte("created_at", oldest)
    .lte("created_at", newest)
    .limit(100);
  const due = rows?.length ?? 0;
  if (!rows || due === 0) return { due: 0, sent: 0 };

  let sent = 0;
  for (const r of rows) {
    const listing = Array.isArray(r.listing) ? r.listing[0] : r.listing;
    const business = (listing as { title?: string } | null)?.title ?? "the business";
    let links: Record<string, string>;
    try {
      links = Object.fromEntries(
        ENQUIRY_OUTCOMES.map((o) => [
          o,
          `${BASE_URL}/enquiries/outcome?t=${encodeURIComponent(
            signToken({ p: "enq_outcome", u: r.id, l: o, ttlMs: 30 * 24 * 60 * 60 * 1000 })
          )}`,
        ])
      );
    } catch (e) {
      console.error("[cron followup] token signing failed (URL_SIGNING_SECRET?)", e);
      return { due, sent };
    }
    const why = `You asked ${business} for a quote through Outback Connections about a week ago (ref ${r.anonymised_id}). This is the one follow-up we send.`;
    const footer = { reference: r.anonymised_id, whyAreYouGettingThis: why };
    const text = [
      `G'day ${r.name},`,
      ``,
      `About a week ago we passed your quote request on to ${business}. Did they get back to you?`,
      ``,
      ...ENQUIRY_OUTCOMES.map((o) => `${OUTCOME_LABELS[o]}: ${links[o]}`),
      ``,
      `One click is all it takes. Your answer helps the next farmer pick someone who answers, and it's the only follow-up we send.`,
    ].join("\n") + buildTextFooter(footer);
    const button = (o: (typeof ENQUIRY_OUTCOMES)[number], colour: string) =>
      `<a href="${escapeHtml(links[o])}" style="display:inline-block;margin:4px 6px 4px 0;background:${colour};color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(OUTCOME_LABELS[o])}</a>`;
    const html = `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:16px;color:#111;line-height:1.5;">
<p>G'day ${escapeHtml(r.name)},</p>
<p>About a week ago we passed your quote request on to <strong>${escapeHtml(business)}</strong>. Did they get back to you?</p>
<p>${button("responded", "#15803d")}${button("no_response", "#b45309")}${button("done_elsewhere", "#525252")}</p>
<p style="font-size:0.9em;color:#555;">One click is all it takes. Your answer helps the next farmer pick someone who answers, and it's the only follow-up we send.</p>
${buildHtmlFooter(footer)}
</div>`;
    try {
      const res = await sendEmail({
        to: r.email as string,
        from: DEFAULT_FROM,
        subject: `Did ${business} get back to you?`,
        text,
        html,
      });
      if (res.ok) {
        await admin
          .from("listing_enquiries")
          .update({ followup_sent_at: new Date().toISOString() })
          .eq("id", r.id);
        sent++;
      }
    } catch (e) {
      console.error("[cron followup] send failed for enquiry", r.id, e);
    }
  }
  return { due, sent };
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

async function sendDirectoryExpiryDigest(
  admin: AdminClient
): Promise<{ rows: number; sent: boolean }> {
  const lower = new Date(Date.now() + 6.5 * 24 * 60 * 60 * 1000).toISOString();
  const upper = new Date(Date.now() + 7.5 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await admin
    .from("listings")
    .select("id, title, slug, kind, postcode, state, source_platform, expires_at")
    .eq("status", "active")
    .eq("data_source", "scraped")
    .gte("expires_at", lower)
    .lt("expires_at", upper)
    .order("title")
    .limit(500);
  if (!rows || rows.length === 0) return { rows: 0, sent: false };

  const when = new Date(rows[0].expires_at).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const lines = rows.map(
    (r) =>
      `- ${r.title} (${[r.postcode, r.state].filter(Boolean).join(" ")}, via ${r.source_platform ?? "?"}) ${BASE_URL}${pathForKind(r.kind, r.slug)}`
  );
  const text = [
    `${rows.length} directory entr${rows.length === 1 ? "y" : "ies"} expire${rows.length === 1 ? "s" : ""} in 7 days (${when}).`,
    ``,
    `Unclaimed rows drop off unless they're re-sighted. To keep them: re-run the import for their source, or re-add them via ${BASE_URL}/dashboard/directory/add (same name + postcode refreshes the clock). Better still: get them claimed.`,
    ``,
    ...lines,
    ``,
    `Outreach workspace: ${BASE_URL}/dashboard/admin/contractor-outreach`,
  ].join("\n");

  try {
    await sendEmail({
      to: NOTIFICATION_TO,
      from: DEFAULT_FROM,
      subject: `Directory: ${rows.length} entr${rows.length === 1 ? "y" : "ies"} expiring in 7 days`,
      text,
      html: `<pre style="font-family:-apple-system,system-ui,sans-serif;white-space:pre-wrap;">${escapeHtml(text)}</pre>`,
    });
    return { rows: rows.length, sent: true };
  } catch (e) {
    console.error("[cron renewal] directory digest failed", e);
    return { rows: rows.length, sent: false };
  }
}

function pathForKind(kind: string, slug: string): string {
  if (kind === "job") return `/jobs/${slug}`;
  if (kind === "freight") return `/freight/${slug}`;
  if (kind === "for_sale") return `/sale/${slug}`;
  return `/services/listing/${slug}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
