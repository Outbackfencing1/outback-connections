"use server";

// A farmer asks a listed business for a quote. Works for unclaimed directory
// rows (the team forwards it by phone/email from the admin queue) and for
// claimed listings (the business is emailed directly, and the team is cc'd
// via the queue). No sign-in needed: the whole point is fewer steps.
//
// Safety: honeypot (silent fake success), per-IP rate limit, length caps,
// consent recorded with ip + user agent, PII stored admin-only and purged
// after 12 months. The contractor's private contact is never sent to the
// farmer.

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { NOTIFICATION_TO, buildHtmlFooter, buildTextFooter, sendEmail } from "@/lib/email";
import { logEvent } from "@/lib/analytics";
import { regionsForPostcodes } from "@/lib/regions";
import { validateEnquiry } from "@/lib/enquiries";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 5;

export type EnquiryResult =
  | { ok: true; reference: string; direct: boolean }
  | { ok: false; errors: Record<string, string> };

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function requestMeta(): Promise<{ ip: string | null; ua: string | null }> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    const ip = xff ? xff.split(",")[0]?.trim() || null : h.get("x-real-ip");
    return { ip: ip || null, ua: h.get("user-agent") || null };
  } catch {
    return { ip: null, ua: null };
  }
}

export async function submitEnquiry(formData: FormData): Promise<EnquiryResult> {
  const listingId = str(formData, "listing_id");
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) return { ok: false, errors: { _: "Bad request." } };

  const v = validateEnquiry({
    name: str(formData, "name"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    postcode: str(formData, "postcode"),
    message: str(formData, "message"),
    consent: str(formData, "consent") === "on" || str(formData, "consent") === "true",
    website: str(formData, "website"),
  });
  if (!v.ok) return v;
  // Bots fill the hidden field. Pretend it worked; write nothing.
  if (v.honeypot) return { ok: true, reference: "ENQ-OK", direct: false };

  const admin = createAdminClient();
  if (!admin) return { ok: false, errors: { _: "Enquiries aren't configured on this environment." } };

  const { ip, ua } = await requestMeta();

  // Rate limit per IP. Fails open on a counting error (a rural user must not be
  // blocked by our own bookkeeping), closed on a real burst.
  if (ip) {
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count, error } = await admin
      .from("listing_enquiries")
      .select("id", { count: "exact", head: true })
      .eq("consent_ip", ip)
      .gte("created_at", since);
    if (!error && (count ?? 0) >= RATE_MAX) {
      return { ok: false, errors: { _: "That's a few enquiries in a short time. Try again in an hour, or email help@outbackconnections.com.au." } };
    }
  }

  const { data: listing } = await admin
    .from("listings")
    .select(
      `id, title, slug, kind, vertical, status, expires_at, business_id, user_id, data_source, contact_email,
       category:categories(slug, label),
       business:businesses(claim_status, trading_name)`
    )
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.status !== "active" || new Date(listing.expires_at) <= new Date()) {
    return { ok: false, errors: { _: "That listing isn't live any more." } };
  }
  const cat = Array.isArray(listing.category) ? listing.category[0] : listing.category;
  const biz = Array.isArray(listing.business) ? listing.business[0] : listing.business;
  const claimed = !!biz && biz.claim_status !== "unclaimed";

  let regionState: string | null = null;
  if (v.value.postcode) {
    const map = await regionsForPostcodes([v.value.postcode]);
    regionState = map.get(v.value.postcode)?.state ?? null;
  }

  const { data: inserted, error } = await admin
    .from("listing_enquiries")
    .insert({
      listing_id: listing.id,
      business_id: listing.business_id ?? null,
      vertical: listing.vertical ?? null,
      category_slug: cat?.slug ?? null,
      name: v.value.name,
      email: v.value.email,
      phone: v.value.phone,
      postcode: v.value.postcode,
      region_state: regionState,
      message: v.value.message,
      consent_ip: ip,
      user_agent: ua,
    })
    .select("anonymised_id")
    .maybeSingle();
  if (error || !inserted) {
    console.error("[enquiry] insert failed:", error?.message);
    return { ok: false, errors: { _: "Couldn't send that. Please try again, or email help@outbackconnections.com.au." } };
  }
  const reference = inserted.anonymised_id as string;

  await logEvent({
    eventType: "enquiry",
    entityType: "listing",
    entityId: listing.id,
    vertical: listing.vertical ?? null,
    properties: { category: cat?.slug ?? null, claimed, postcode: v.value.postcode, region_state: regionState },
  });

  const listingPath =
    listing.kind === "job"
      ? `/jobs/${listing.slug}`
      : listing.kind === "freight"
        ? `/freight/${listing.slug}`
        : listing.kind === "for_sale"
          ? `/sale/${listing.slug}`
          : `/services/listing/${listing.slug}`;
  const contactLines = [
    v.value.phone ? `Phone: ${v.value.phone}` : null,
    v.value.email ? `Email: ${v.value.email}` : null,
    v.value.postcode ? `Postcode: ${v.value.postcode}${regionState ? ` (${regionState})` : ""}` : null,
  ].filter(Boolean) as string[];

  // Team copy: always. This is the queue's inbox mirror.
  const teamText = [
    `New enquiry ${reference} for ${listing.title} (${claimed ? "claimed" : "UNCLAIMED, forward it"}).`,
    ``,
    `From: ${v.value.name}`,
    ...contactLines,
    ``,
    `Message:`,
    v.value.message,
    ``,
    `Listing: ${BASE_URL}${listingPath}`,
    `Queue: ${BASE_URL}/dashboard/admin/enquiries`,
  ].join("\n");
  try {
    await sendEmail({
      to: NOTIFICATION_TO,
      subject: `Enquiry ${reference}: ${listing.title}${claimed ? "" : " (forward)"}`,
      text: teamText,
      html: `<pre style="font-family:-apple-system,system-ui,sans-serif;white-space:pre-wrap;">${escapeHtml(teamText)}</pre>`,
      replyTo: v.value.email ?? undefined,
    });
  } catch (e) {
    console.error("[enquiry] team email failed:", e);
  }

  // Direct to the business only when they've claimed the listing and given a
  // confirmed contact email. Unclaimed rows are forwarded by a person.
  let direct = false;
  if (claimed && listing.contact_email) {
    const why = `Someone used the "Get a quote" form on your Outback Connections listing "${listing.title}".`;
    const footer = { reference, whyAreYouGettingThis: why };
    const bodyText = [
      `G'day,`,
      ``,
      `${v.value.name} has asked for a quote through your listing on Outback Connections.`,
      ``,
      ...contactLines,
      ``,
      `Message:`,
      v.value.message,
      ``,
      `They've agreed to us passing their details to you. Please reply to them directly.`,
      `Your listing: ${BASE_URL}${listingPath}`,
    ].join("\n");
    const bodyHtml = `<p>G'day,</p>
<p><strong>${escapeHtml(v.value.name)}</strong> has asked for a quote through your listing on Outback Connections.</p>
<p>${contactLines.map(escapeHtml).join("<br>")}</p>
<p><strong>Message:</strong><br>${escapeHtml(v.value.message).replace(/\n/g, "<br>")}</p>
<p>They've agreed to us passing their details to you. Please reply to them directly.<br>
Your listing: <a href="${BASE_URL}${listingPath}">${BASE_URL}${listingPath}</a></p>`;
    try {
      const sent = await sendEmail({
        to: listing.contact_email,
        subject: `Quote request from ${v.value.name} via Outback Connections`,
        text: bodyText + buildTextFooter(footer),
        html: `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:16px;color:#111;line-height:1.5;">${bodyHtml}${buildHtmlFooter(footer)}</div>`,
        replyTo: v.value.email ?? undefined,
      });
      direct = sent.ok;
      if (sent.ok) {
        await admin
          .from("listing_enquiries")
          .update({ status: "forwarded", forwarded_at: new Date().toISOString(), forwarded_via: "email_direct" })
          .eq("anonymised_id", reference);
      }
    } catch (e) {
      console.error("[enquiry] business email failed:", e);
    }
  }

  return { ok: true, reference, direct };
}
