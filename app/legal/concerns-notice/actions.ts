"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendThrottledEmail } from "@/lib/email-throttle";
import { NOTIFICATION_TO } from "@/lib/email";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

const NoticeSchema = z.object({
  notice_type: z.enum([
    "concerns_notice",
    "copyright",
    "illegal_content",
    "general_concern",
  ]),
  complainant_name: z.string().trim().min(2, "Enter your name").max(200),
  complainant_email: z
    .string()
    .trim()
    .min(1, "Enter your email")
    .email("That email doesn't look right")
    .max(255),
  complainant_phone: z.string().trim().max(40).optional().default(""),
  complainant_address: z.string().trim().max(300).optional().default(""),
  listing_url: z.string().trim().min(3, "Paste the listing URL or ID").max(500),
  statement_at_issue: z
    .string()
    .trim()
    .min(10, "Quote the words at issue")
    .max(4000),
  reputation_harm_narrative: z
    .string()
    .trim()
    .min(20, "Explain the harm")
    .max(6000),
  evidence_urls: z.string().trim().max(3000).optional().default(""),
  serious_harm_acknowledged: z.string().optional(),
});

export type SubmitResult =
  | { ok: true; message: string; reference: string }
  | { ok: false; message: string };

function tryResolveListingId(input: string): string | null {
  // Accept either a slug-bearing URL or an LST-XXXX anonymised id or a UUID.
  const trimmed = input.trim();
  // UUID
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(trimmed)) return trimmed;
  return null;
}

function tryResolveListingSlug(input: string): { kind: string; slug: string } | null {
  // /jobs/the-slug · /freight/the-slug · /services/listing/the-slug
  try {
    const u = new URL(input.startsWith("http") ? input : `${BASE_URL}${input}`);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "jobs" && parts[1]) return { kind: "job", slug: parts[1] };
    if (parts[0] === "freight" && parts[1]) return { kind: "freight", slug: parts[1] };
    if (parts[0] === "services" && parts[1] === "listing" && parts[2])
      return { kind: "service", slug: parts[2] };
  } catch {
    // not a URL
  }
  return null;
}

export async function submitConcernsNotice(formData: FormData): Promise<SubmitResult> {
  const raw = {
    notice_type: formData.get("notice_type") as string,
    complainant_name: formData.get("complainant_name") as string,
    complainant_email: formData.get("complainant_email") as string,
    complainant_phone: (formData.get("complainant_phone") as string) ?? "",
    complainant_address: (formData.get("complainant_address") as string) ?? "",
    listing_url: formData.get("listing_url") as string,
    statement_at_issue: formData.get("statement_at_issue") as string,
    reputation_harm_narrative: formData.get("reputation_harm_narrative") as string,
    evidence_urls: (formData.get("evidence_urls") as string) ?? "",
    serious_harm_acknowledged:
      (formData.get("serious_harm_acknowledged") as string) ?? "",
  };

  const parsed = NoticeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }
  const data = parsed.data;

  if (data.notice_type === "concerns_notice" && data.serious_harm_acknowledged !== "yes") {
    return {
      ok: false,
      message:
        "Tick the serious harm acknowledgement to submit a defamation concerns notice.",
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      message:
        "Service temporarily unavailable. Please email help@outbackconnections.com.au directly.",
    };
  }

  // Resolve listing if possible
  let listingId: string | null = tryResolveListingId(data.listing_url);
  let listingTitle: string | null = null;
  if (!listingId) {
    const slugMatch = tryResolveListingSlug(data.listing_url);
    if (slugMatch) {
      const supabase = createClient();
      const { data: l } = await supabase
        .from("listings")
        .select("id, title, user_id")
        .eq("slug", slugMatch.slug)
        .maybeSingle();
      if (l) {
        listingId = l.id;
        listingTitle = l.title;
      }
    }
  }

  const evidenceList = data.evidence_urls
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Map the sub-types into the constrained type_of_concern column.
  const typeOfConcern =
    data.notice_type === "copyright"
      ? "copyright"
      : data.notice_type === "illegal_content"
        ? "illegal_content"
        : data.notice_type === "concerns_notice"
          ? "defamation"
          : "other";

  const { data: inserted, error } = await admin
    .from("defamation_complaints")
    .insert({
      listing_id: listingId,
      listing_title_snapshot: listingTitle,
      listing_url_snapshot: data.listing_url,
      complainant_name: data.complainant_name,
      complainant_email: data.complainant_email,
      complainant_phone: data.complainant_phone || null,
      complainant_address: data.complainant_address || null,
      type_of_concern: typeOfConcern,
      notice_type: data.notice_type,
      details: `${data.statement_at_issue}\n\n---\n\n${data.reputation_harm_narrative}`,
      statement_at_issue: data.statement_at_issue,
      reputation_harm_narrative: data.reputation_harm_narrative,
      evidence_urls: evidenceList.length > 0 ? evidenceList : null,
      serious_harm_acknowledged: data.serious_harm_acknowledged === "yes",
    })
    .select("anonymised_id")
    .single();

  if (error || !inserted) {
    console.error("[concerns] insert failed:", error?.message);
    return {
      ok: false,
      message:
        "Couldn't record your notice. Please email help@outbackconnections.com.au directly.",
    };
  }

  const reference = inserted.anonymised_id;

  // Mark listing under_review when it's a defamation/illegal claim with a known target.
  if (
    listingId &&
    (data.notice_type === "concerns_notice" || data.notice_type === "illegal_content")
  ) {
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await admin
      .from("listings")
      .update({
        under_review: true,
        under_review_reason: data.notice_type,
        under_review_since: new Date().toISOString(),
      })
      .eq("id", listingId);
    await admin
      .from("defamation_complaints")
      .update({ owner_response_deadline: deadline })
      .eq("anonymised_id", reference);
  }

  // Acknowledgement to complainant
  const ackText = `Thank you for submitting a concerns notice to Outback Connections.

Reference: ${reference}
Type: ${data.notice_type}
Listing: ${data.listing_url}

What happens next:
1. We've logged your notice and will review it within 5 business days.
2. If the listing is a known target and the notice is for defamation or illegal content, we hide it from public view immediately and notify the listing owner who has 7 days to respond.
3. We'll contact you with our decision: dismiss, uphold (permanent removal), or require modification.

You can reply to this email with additional information at any time.

Why am I getting this?
You submitted a notice via ${BASE_URL}/legal/concerns-notice.

If you didn't submit this, contact help@outbackconnections.com.au immediately.

— Outback Connections
Outback Fencing & Steel Supplies Pty Ltd
76 Astill Drive, Orange NSW 2800
Privacy: ${BASE_URL}/privacy
Terms: ${BASE_URL}/terms`;

  void sendThrottledEmail({
    to: data.complainant_email,
    subject: `Concerns notice received — Reference ${reference}`,
    text: ackText,
    html: `<p>Thank you for submitting a concerns notice.</p>
<p>Reference: <strong>${reference}</strong><br>Type: ${data.notice_type}<br>Listing: ${data.listing_url}</p>
<p><strong>What happens next:</strong></p>
<ol>
<li>We've logged your notice and will review it within 5 business days.</li>
<li>If the listing is identified and the notice is for defamation or illegal content, we hide it from public view immediately and notify the listing owner who has 7 days to respond.</li>
<li>We'll contact you with our decision.</li>
</ol>
<p>You can reply to this email with additional information at any time.</p>
<hr>
<p style="font-size: 12px; color: #666;">Outback Connections — Outback Fencing & Steel Supplies Pty Ltd<br>
76 Astill Drive, Orange NSW 2800<br>
<a href="${BASE_URL}/privacy">Privacy</a> · <a href="${BASE_URL}/terms">Terms</a></p>`,
  });

  // Admin alert
  const adminBody = `New concerns notice ${reference}

Type: ${data.notice_type}
Complainant: ${data.complainant_name} <${data.complainant_email}>
Phone: ${data.complainant_phone || "(not given)"}
Address: ${data.complainant_address || "(not given)"}
Listing: ${data.listing_url}${listingId ? ` (resolved id ${listingId})` : " (could not resolve)"}
Serious harm acknowledged: ${data.serious_harm_acknowledged === "yes" ? "yes" : "no"}

Statement at issue:
---
${data.statement_at_issue}
---

Reputation harm:
---
${data.reputation_harm_narrative}
---

Evidence:
${evidenceList.length > 0 ? evidenceList.join("\n") : "(none)"}

Admin queue: ${BASE_URL}/dashboard/admin/flags`;

  void sendThrottledEmail({
    to: NOTIFICATION_TO,
    subject: `[CONCERNS] ${reference} — ${data.notice_type}`,
    text: adminBody,
    html: `<pre style="font-family: monospace; white-space: pre-wrap;">${adminBody.replace(/</g, "&lt;")}</pre>`,
    replyTo: data.complainant_email,
  });

  // Light-touch capture of submitter context (not stored on the row to keep
  // the table free of incidental PII; logged only at request time)
  const h = headers();
  console.info("[concerns] notice", reference, "from", h.get("x-forwarded-for") ?? "?");

  return {
    ok: true,
    reference,
    message:
      "We've logged your notice and emailed an acknowledgement. We'll respond substantively within 5 business days.",
  };
}
