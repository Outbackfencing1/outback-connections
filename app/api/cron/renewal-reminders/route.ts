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
import { DEFAULT_FROM, sendEmail } from "@/lib/email";

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

  // Listings expiring in 2.5 to 3.5 days from now AND active
  const lower = new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000).toISOString();
  const upper = new Date(Date.now() + 3.5 * 24 * 60 * 60 * 1000).toISOString();

  const { data: listings } = await admin
    .from("listings")
    .select("id, user_id, title, slug, kind, expires_at")
    .eq("status", "active")
    .gte("expires_at", lower)
    .lt("expires_at", upper);

  if (!listings || listings.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "none_due" });
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

  return NextResponse.json({ ok: true, sent, total: listings.length });
}

function pathForKind(kind: string, slug: string): string {
  if (kind === "job") return `/jobs/${slug}`;
  if (kind === "freight") return `/freight/${slug}`;
  return `/services/listing/${slug}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
