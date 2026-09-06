// lib/request-notify.ts
// When a farmer posts a job request, tell the listed businesses that could
// do it. Only CLAIMED businesses with a confirmed contact email are told
// (they opted in by claiming); unclaimed rows are never emailed
// automatically. Same region first, then same state. Capped. Best-effort:
// a notification failure never blocks the post.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildHtmlFooter, buildTextFooter, sendEmail } from "@/lib/email";
import { regionsForPostcodes } from "@/lib/regions";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";
const MAX_NOTIFY = 20;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function notifyProvidersOfRequest(args: {
  categoryId: string;
  categoryLabel: string;
  postcode: string;
  title: string;
  slug: string;
  reference: string;
}): Promise<{ notified: number }> {
  const admin = createAdminClient();
  if (!admin) return { notified: 0 };

  const { data: offerings } = await admin
    .from("listings")
    .select(
      `id, postcode, contact_email, title,
       business:businesses!inner(claim_status)`
    )
    .eq("kind", "service_offering")
    .eq("category_id", args.categoryId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .not("contact_email", "is", null)
    .neq("business.claim_status", "unclaimed")
    .limit(500);
  const rows = (offerings ?? []) as { id: string; postcode: string; contact_email: string | null; title: string }[];
  if (rows.length === 0) return { notified: 0 };

  const regionMap = await regionsForPostcodes([args.postcode, ...rows.map((r) => r.postcode)]);
  const target = regionMap.get(args.postcode);
  const sameRegion = rows.filter((r) => {
    const reg = regionMap.get(r.postcode);
    return !!target && !!reg && reg.region_name === target.region_name && reg.state === target.state;
  });
  const sameState = rows.filter((r) => {
    const reg = regionMap.get(r.postcode);
    return !!target && !!reg && reg.state === target.state && !sameRegion.includes(r);
  });
  const chosen = [...sameRegion, ...sameState].slice(0, MAX_NOTIFY);
  const seen = new Set<string>();

  const requestUrl = `${BASE_URL}/services/listing/${args.slug}`;
  const where = target ? `${target.region_name}, ${target.state}` : `postcode ${args.postcode}`;
  const why = `Your business has a claimed ${args.categoryLabel.toLowerCase()} listing on Outback Connections, and a job request was posted in your area.`;
  const footer = { reference: args.reference, whyAreYouGettingThis: why };

  let notified = 0;
  for (const r of chosen) {
    const to = r.contact_email;
    if (!to || seen.has(to.toLowerCase())) continue;
    seen.add(to.toLowerCase());
    const text = [
      `G'day,`,
      ``,
      `A job request just went up near ${where}:`,
      `${args.title}`,
      ``,
      `See the details and contact them here (sign in to see their contact details):`,
      requestUrl,
      ``,
      `You're getting this because ${r.title} is listed in ${args.categoryLabel}. Requests go to the listed businesses in the same region first.`,
    ].join("\n") + buildTextFooter(footer);
    const html = `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:16px;color:#111;line-height:1.5;">
<p>G'day,</p>
<p>A job request just went up near <strong>${escapeHtml(where)}</strong>:</p>
<p><strong>${escapeHtml(args.title)}</strong></p>
<p><a href="${escapeHtml(requestUrl)}" style="display:inline-block;background:#15803d;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">See the request</a><br>
<span style="font-size:0.9em;color:#555;">Sign in to see their contact details.</span></p>
<p style="font-size:0.9em;color:#555;">You're getting this because ${escapeHtml(r.title)} is listed in ${escapeHtml(args.categoryLabel)}. Requests go to the listed businesses in the same region first.</p>
${buildHtmlFooter(footer)}
</div>`;
    try {
      const sent = await sendEmail({
        to,
        subject: `Job request near ${where}: ${args.title}`,
        text,
        html,
      });
      if (sent.ok) notified++;
    } catch (e) {
      console.error("[request-notify] send failed:", e);
    }
  }
  return { notified };
}
