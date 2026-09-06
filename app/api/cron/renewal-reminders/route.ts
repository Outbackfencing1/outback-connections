// /api/cron/renewal-reminders
// Item 14: emails listing owners 3 days before expiry with a one-click
// signed-token renewal link, and sends the team ONE digest per scraped
// directory row 7 days before it expires (those rows have no owner).
// Farmer follow-ups live in /api/cron/enquiry-followups.
//
// Scheduled via Vercel Cron in vercel.json. Authorised by CRON_SECRET
// (lib/cron-auth.ts).
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authoriseCron } from "@/lib/cron-auth";
import { signToken } from "@/lib/signed-tokens";
import { DEFAULT_FROM, NOTIFICATION_TO, escapeHtml, sendEmail } from "@/lib/email";
import { listingHref } from "@/lib/format";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export async function GET(request: NextRequest) {
  if (!authoriseCron(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "no_admin_client" }, { status: 500 });
  }

  // Directory digest: scraped rows have no owner to email, so tell the team
  // once, 7 days out (each row falls in this 24h window exactly once).
  const digest = await sendDirectoryExpiryDigest(admin);

  // Owner-posted listings expiring in 2.5 to 3.5 days from now AND active
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
    return NextResponse.json({ ok: true, sent: 0, reason: "none_due", digest });
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
    const detailLink = `${BASE_URL}${listingHref(l.kind, l.slug)}`;
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

  return NextResponse.json({ ok: true, sent, total: listings.length, digest });
}

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
      `- ${r.title} (${[r.postcode, r.state].filter(Boolean).join(" ")}, via ${r.source_platform ?? "?"}) ${BASE_URL}${listingHref(r.kind, r.slug)}`
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
