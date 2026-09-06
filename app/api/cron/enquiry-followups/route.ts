// /api/cron/enquiry-followups — "Did they get back to you?"
// One email per forwarded enquiry, 7 to 30 days after it was FORWARDED (not
// submitted), only when the farmer gave an email, only for enquiries made
// after the consent copy started disclosing this follow-up. Three signed
// one-click answers land on a confirm page (never committed on a bare GET,
// so mail-scanner prefetches can't answer for the farmer). `?dry=1` lists
// what would be sent. Scheduled daily in vercel.json.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authoriseCron } from "@/lib/cron-auth";
import { DEFAULT_FROM, buildHtmlFooter, buildTextFooter, escapeHtml, sendEmail } from "@/lib/email";
import { signToken } from "@/lib/signed-tokens";
import { ENQUIRY_OUTCOMES, OUTCOME_LABELS } from "@/lib/enquiry-outcome";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";
// The consent tick on the enquiry form has disclosed this email since the
// 6 Sep 2026 deploy; anything submitted before that is never followed up.
const CONSENT_DISCLOSED_FROM = "2026-09-07T00:00:00Z";
const BATCH = 50;

export async function GET(req: NextRequest) {
  if (!authoriseCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "admin_unavailable" }, { status: 500 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const oldest = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const newest = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("listing_enquiries")
    .select("id, anonymised_id, name, email, created_at, forwarded_at, listing:listings(title)")
    .eq("status", "forwarded")
    .is("followup_sent_at", null)
    .is("outcome", null)
    .not("email", "is", null)
    .not("forwarded_at", "is", null)
    .gte("created_at", CONSENT_DISCLOSED_FROM)
    .gte("forwarded_at", oldest)
    .lte("forwarded_at", newest)
    .order("forwarded_at", { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const due = rows?.length ?? 0;
  if (dry) {
    return NextResponse.json({ ok: true, dry: true, due, sample: (rows ?? []).slice(0, 5).map((r) => ({ ref: r.anonymised_id, forwarded_at: r.forwarded_at })) });
  }
  if (!rows || due === 0) return NextResponse.json({ ok: true, due: 0, sent: 0 });

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
      console.error("[enquiry-followups] token signing failed (URL_SIGNING_SECRET?)", e);
      return NextResponse.json({ ok: false, error: "signing_unavailable", due, sent }, { status: 500 });
    }
    const why = `You asked ${business} for a quote through Outback Connections about a week ago (ref ${r.anonymised_id}). This is the one follow-up we send.`;
    const footer = { reference: r.anonymised_id, whyAreYouGettingThis: why };
    const text =
      [
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
      const res = await sendEmail({ to: r.email as string, from: DEFAULT_FROM, subject: `Did ${business} get back to you?`, text, html });
      if (res.ok) {
        await admin.from("listing_enquiries").update({ followup_sent_at: new Date().toISOString() }).eq("id", r.id);
        sent++;
      }
    } catch (e) {
      console.error("[enquiry-followups] send failed for enquiry", r.id, e);
    }
  }
  return NextResponse.json({ ok: true, due, sent });
}
