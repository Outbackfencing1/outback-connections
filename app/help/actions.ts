"use server";

import { z } from "zod";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import {
  sendEmail,
  buildHelpAckEmail,
  NOTIFICATION_TO,
} from "@/lib/email";
import { checkHelpRateLimit } from "@/lib/rate-limit";

// ------------------------------------------------------------
// Validation schema
// Enum values MUST match the DB check constraints in supabase-v2.sql.
// ------------------------------------------------------------

const RequestType = z.enum([
  "ripped_off",
  "stuck_mid_project",
  "quote_check",
  "bad_workmanship",
  "contractor_unfinished",
  "other",
]);

const DollarBracket = z.enum([
  "under_1k",
  "1k_5k",
  "5k_20k",
  "20k_50k",
  "over_50k",
  "unknown",
]);

const Urgency = z.enum([
  "emergency",
  "this_week",
  "this_month",
  "no_rush",
]);

// Coerce checkbox inputs ("on" / missing / "true" / boolean) to a boolean.
const checkboxToBool = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean(), z.undefined()])
  .transform((v) => v === true || v === "on" || v === "true");

const HelpSchema = z
  .object({
    request_type: RequestType.or(z.literal("")).refine((v) => v !== "", {
      message: "Pick what's going on",
    }),
    category_id: z
      .string()
      .uuid("Pick a category")
      .or(z.literal(""))
      .refine((v) => v !== "", { message: "Pick a category" }),
    postcode: z.string().regex(/^\d{4}$/, "Postcode must be 4 digits"),
    dollar_value_bracket: DollarBracket.or(z.literal("")).refine((v) => v !== "", {
      message: "Pick a rough dollar range",
    }),
    urgency_bracket: Urgency.or(z.literal("")).refine((v) => v !== "", {
      message: "Tell us how urgent it is",
    }),
    description: z
      .string()
      .trim()
      .min(30, "Tell us a bit more — at least 30 characters")
      .max(2000, "Please keep it under 2000 characters"),
    contractor_name: z.string().trim().max(200).optional().default(""),
    contact_name: z
      .string()
      .trim()
      .min(1, "We need a first name to call you by")
      .max(100),
    contact_email: z
      .string()
      .trim()
      .max(255)
      .optional()
      .default("")
      .refine(
        (v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
        "That email doesn't look right"
      ),
    contact_phone: z.string().trim().max(40).optional().default(""),
    contact_best_time: z.string().trim().max(200).optional().default(""),
    consent_store_data: checkboxToBool,
    consent_of_referral: checkboxToBool,
    consent_share_with_authorities: checkboxToBool,
  })
  .refine((d) => d.contact_email !== "" || d.contact_phone !== "", {
    message: "We need at least an email or a phone number",
    path: ["contact_email"],
  })
  .refine((d) => d.consent_store_data === true, {
    message: "You need to tick the consent box so we can help you",
    path: ["consent_store_data"],
  });

// ------------------------------------------------------------
// Flash cookie — carries errors + field values across the redirect
// so the form can re-render with inline errors without JavaScript.
// ------------------------------------------------------------

const FLASH_COOKIE = "oc_help_flash";

type FlashState = {
  errors: Record<string, string>;
  values: Record<string, string>;
};

function setFlash(state: FlashState) {
  cookies().set(FLASH_COOKIE, JSON.stringify(state), {
    maxAge: 60 * 5,
    httpOnly: true,
    sameSite: "lax",
    path: "/help",
  });
}

function clearFlash() {
  cookies().set(FLASH_COOKIE, "", { maxAge: 0, path: "/help" });
}

function valuesFrom(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  // Don't round-trip these — honeypot leak or consent re-tick surprise.
  delete out.website;
  delete out.consent_store_data;
  delete out.consent_of_referral;
  delete out.consent_share_with_authorities;
  return out;
}

function clientIp(): string | null {
  const h = headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") || null;
}

// ------------------------------------------------------------
// Server action
// ------------------------------------------------------------

export async function submitHelpRequest(formData: FormData): Promise<void> {
  // Clear any stale flash first so a success redirect doesn't leak old errors.
  clearFlash();

  const raw = Object.fromEntries(formData.entries());

  // Silent honeypot: if the hidden 'website' field was filled, pretend success.
  if (typeof raw.website === "string" && raw.website.length > 0) {
    console.warn("[help] honeypot tripped");
    redirect("/help/thanks?case=HR-HONEYPOT");
  }

  const parsed = HelpSchema.safeParse(raw);

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_");
      if (!errors[key]) errors[key] = issue.message;
    }
    setFlash({ errors, values: valuesFrom(formData) });
    redirect("/help");
  }

  const data = parsed.data;
  const ip = clientIp();
  const ua = headers().get("user-agent") ?? null;

  // Rate limit
  const rl = await checkHelpRateLimit(ip);
  if (!rl.ok) {
    setFlash({ errors: { _: rl.message }, values: valuesFrom(formData) });
    redirect("/help");
  }

  const supa = supabaseAdmin();

  // Dev fallback: without Supabase configured, log + fake-redirect so Josh can
  // exercise the client side without needing the DB wired up.
  if (!supa) {
    console.log("[help] DB not configured. Submission payload:", {
      ...data,
      consent_ip: ip,
      consent_user_agent: ua,
    });
    redirect("/help/thanks?case=HR-DEVMODE");
  }

  // Most recent combined/privacy policy
  const { data: policyRow } = await supa
    .from("policy_versions")
    .select("id")
    .in("kind", ["combined", "privacy"])
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!policyRow?.id) {
    console.error("[help] No policy version seeded — refusing submission");
    setFlash({
      errors: {
        _: "The site isn't quite ready to accept submissions. Please try again shortly.",
      },
      values: valuesFrom(formData),
    });
    redirect("/help");
  }

  // Only respect OF-referral consent when the chosen category is of_relevant.
  // Also pull the slug so the notification email is readable at a glance.
  const { data: cat } = await supa
    .from("categories")
    .select("slug, of_relevant")
    .eq("id", data.category_id)
    .maybeSingle();
  const categorySlug = cat?.slug ?? "(unknown)";
  const ofConsentEffective = !!(data.consent_of_referral && cat?.of_relevant);

  const summaryByType: Record<string, string> = {
    ripped_off: "Ripped off",
    stuck_mid_project: "Stuck mid-project",
    quote_check: "Unsure about a quote",
    bad_workmanship: "Bad workmanship",
    contractor_unfinished: "Contractor won't finish",
    other: "Something else",
  };

  const row = {
    source: "web" as const,
    postcode: data.postcode,
    category_id: data.category_id,
    request_type: data.request_type,
    problem_summary: summaryByType[data.request_type] ?? "Help request",
    description: data.description,
    contractor_name: data.contractor_name || null,
    dollar_value_bracket: data.dollar_value_bracket,
    urgency_bracket: data.urgency_bracket,
    contact_name: data.contact_name,
    contact_email: data.contact_email || null,
    contact_phone: data.contact_phone || null,
    contact_best_time: data.contact_best_time || null,
    policy_version_id: policyRow.id,
    consent_store_data: true,
    consent_of_referral: ofConsentEffective,
    consent_share_with_authorities: data.consent_share_with_authorities,
    consent_ip: ip,
    consent_user_agent: ua,
  };

  const { data: inserted, error: insertErr } = await supa
    .from("help_requests")
    .insert(row)
    .select("anonymised_id, postcode")
    .single();

  if (insertErr || !inserted) {
    console.error("[help] Insert failed:", insertErr?.message);
    setFlash({
      errors: { _: "Something went wrong saving your message. Please try again in a minute." },
      values: valuesFrom(formData),
    });
    redirect("/help");
  }

  const caseId = inserted.anonymised_id;

  // Fire-and-forget emails. Failures log but don't fail the user.
  const { data: region } = await supa
    .from("regions")
    .select("state")
    .eq("postcode", inserted.postcode)
    .maybeSingle();

  const ack = buildHelpAckEmail({
    caseId,
    firstName: data.contact_name,
    state: region?.state ?? null,
  });

  if (data.contact_email) {
    await sendEmail({
      to: data.contact_email,
      subject: `We got your message — ${caseId}`,
      text: ack.text,
      html: ack.html,
      replyTo: NOTIFICATION_TO,
    }).catch((e) => console.error("[help] ack email failed:", e));
  }

  const notifyText = buildNotificationText({
    caseId,
    data,
    categorySlug,
    ip,
    ua,
    ofConsentEffective,
  });
  await sendEmail({
    to: NOTIFICATION_TO,
    subject: `[help] ${caseId} · ${data.request_type} · ${categorySlug} · ${data.postcode}`,
    text: notifyText,
    html: `<pre style="font-family:-apple-system,system-ui,monospace;white-space:pre-wrap;">${escapeHtml(
      notifyText
    )}</pre>`,
    replyTo: data.contact_email || undefined,
  }).catch((e) => console.error("[help] notification email failed:", e));

  redirect(`/help/thanks?case=${encodeURIComponent(caseId)}`);
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function buildNotificationText(args: {
  caseId: string;
  data: z.infer<typeof HelpSchema>;
  categorySlug: string;
  ip: string | null;
  ua: string | null;
  ofConsentEffective: boolean;
}): string {
  const { caseId, data, categorySlug, ip, ua, ofConsentEffective } = args;
  return [
    `Case: ${caseId}`,
    `Type: ${data.request_type}`,
    `Category: ${categorySlug}`,
    `Postcode: ${data.postcode}`,
    `Value: ${data.dollar_value_bracket}`,
    `Urgency: ${data.urgency_bracket}`,
    `Contractor (private): ${data.contractor_name || "-"}`,
    ``,
    `Description:`,
    data.description,
    ``,
    `Contact: ${data.contact_name}`,
    `Email: ${data.contact_email || "-"}`,
    `Phone: ${data.contact_phone || "-"}`,
    `Best time: ${data.contact_best_time || "-"}`,
    ``,
    `Consents:`,
    `  store_data: yes (required)`,
    `  of_referral (user ticked): ${data.consent_of_referral ? "yes" : "no"}`,
    `  of_referral (effective, after category check): ${ofConsentEffective ? "yes" : "no"}`,
    `  share_with_authorities: ${data.consent_share_with_authorities ? "yes" : "no"}`,
    ``,
    `IP: ${ip ?? "-"}`,
    `UA: ${ua ?? "-"}`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
