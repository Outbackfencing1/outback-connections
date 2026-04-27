// lib/email.ts
// Thin Resend wrapper. Uses plain fetch to avoid pulling in a new dep.
// If RESEND_API_KEY is missing we log the email and return ok:false, logged:true
// so the caller can treat it as "delivered for dev" without crashing.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export const DEFAULT_FROM =
  process.env.FROM_EMAIL ||
  "Outback Connections <help@outbackconnections.com.au>";

export const NOTIFICATION_TO =
  process.env.NOTIFICATION_EMAIL || "help@outbackconnections.com.au";

export type EmailSendInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  from?: string;
};

export type EmailResult =
  | { ok: true; id?: string }
  | { ok: false; logged: true; reason: "no_api_key" }
  | { ok: false; logged: false; reason: "api_error"; status?: number; error: string };

export async function sendEmail(opts: EmailSendInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = opts.from ?? DEFAULT_FROM;

  if (!apiKey) {
    console.log(
      "[email] RESEND_API_KEY not set — logging instead of sending.",
      {
        from,
        to: opts.to,
        subject: opts.subject,
        textPreview: opts.text.slice(0, 400),
      }
    );
    return { ok: false, logged: true, reason: "no_api_key" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        reply_to: opts.replyTo,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[email] Resend API error:", res.status, errText);
      return { ok: false, logged: false, reason: "api_error", status: res.status, error: errText };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email] unexpected error:", msg);
    return { ok: false, logged: false, reason: "api_error", error: msg };
  }
}

// ------------------------------------------------------------
// Referral copy used in auto-ack emails.
// State-specific Fair Trading links. Falls back to a generic pointer.
// ------------------------------------------------------------

type FairTrading = { name: string; url: string; phone?: string };

const FAIR_TRADING: Record<string, FairTrading> = {
  NSW: { name: "NSW Fair Trading", url: "https://www.fairtrading.nsw.gov.au/", phone: "13 32 20" },
  VIC: { name: "Consumer Affairs Victoria", url: "https://www.consumer.vic.gov.au/", phone: "1300 558 181" },
  QLD: { name: "QLD Office of Fair Trading", url: "https://www.qld.gov.au/law/fair-trading", phone: "13 74 68" },
  SA:  { name: "Consumer and Business Services SA", url: "https://www.cbs.sa.gov.au/", phone: "131 882" },
  WA:  { name: "WA Consumer Protection", url: "https://www.commerce.wa.gov.au/consumer-protection", phone: "1300 304 054" },
  TAS: { name: "CBOS Tasmania", url: "https://www.cbos.tas.gov.au/", phone: "1300 654 499" },
  NT:  { name: "NT Consumer Affairs", url: "https://consumeraffairs.nt.gov.au/", phone: "1800 019 319" },
  ACT: { name: "Access Canberra — Fair Trading", url: "https://www.accesscanberra.act.gov.au/", phone: "13 22 81" },
};

// ------------------------------------------------------------
// Auto-acknowledgement email for a Get Help submission.
// ------------------------------------------------------------
export function buildHelpAckEmail(args: {
  caseId: string;
  firstName: string;
  state?: string | null;
}): { text: string; html: string } {
  const ft = args.state ? FAIR_TRADING[args.state] : null;
  const ftBlock = ft
    ? `${ft.name}${ft.phone ? " — " + ft.phone : ""}\n${ft.url}`
    : `Your state's Fair Trading office — search "fair trading [your state]".`;

  const text = `G'day ${args.firstName},

We got your message. Your case number is ${args.caseId}.

We read every message within 48 hours. Jess or Josh will get back to you.

While you're waiting, here are three places that can help:

1. ${ftBlock}
   Free consumer protection for disputes, dodgy contracts, refund issues.

2. Rural Financial Counselling Service — 1800 686 175
   Free, independent financial counselling for rural people under pressure.
   https://www.agriculture.gov.au/agriculture-land/farm-food-drought/drought/assistance/rural-financial-counselling-service

3. Australian Small Business and Family Enterprise Ombudsman
   Free dispute resolution for small business issues.
   https://www.asbfeo.gov.au/

A few things worth knowing:

- This is information, not advice. We're not lawyers or accountants. If the stakes are high, get proper advice alongside ours.
- Outback Connections is run by Outback Fencing & Steel Supplies. We're telling you so you know who we are.
- Your message is stored privately. We never publish contractor names.
- To delete your record, reply to this email with the word "delete" and your case number (${args.caseId}).

We'll be in touch.

— Outback Connections
help@outbackconnections.com.au
outbackconnections.com.au
`;

  const ftHtml = ft
    ? `<strong>${escapeHtml(ft.name)}${ft.phone ? " — " + escapeHtml(ft.phone) : ""}</strong><br><a href="${escapeHtml(ft.url)}">${escapeHtml(ft.url)}</a>`
    : `<strong>Your state's Fair Trading office</strong> — search "fair trading [your state]".`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:16px;color:#111;line-height:1.5;">
<p>G'day ${escapeHtml(args.firstName)},</p>
<p>We got your message. Your case number is <strong>${escapeHtml(args.caseId)}</strong>.</p>
<p>We read every message within 48 hours. Jess or Josh will get back to you.</p>
<p>While you're waiting, here are three places that can help:</p>
<ol>
  <li>${ftHtml}<br>Free consumer protection for disputes, dodgy contracts, refund issues.</li>
  <li><strong>Rural Financial Counselling Service — 1800 686 175</strong><br>Free, independent financial counselling for rural people under pressure.<br><a href="https://www.agriculture.gov.au/agriculture-land/farm-food-drought/drought/assistance/rural-financial-counselling-service">Rural Financial Counselling Service</a></li>
  <li><strong>Australian Small Business and Family Enterprise Ombudsman</strong><br>Free dispute resolution for small business issues.<br><a href="https://www.asbfeo.gov.au/">asbfeo.gov.au</a></li>
</ol>
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
<p style="font-size:0.9em;color:#555;"><strong>Information, not advice.</strong> We're not lawyers or accountants. If the stakes are high, get proper advice alongside ours.</p>
<p style="font-size:0.9em;color:#555;">Outback Connections is run by Outback Fencing &amp; Steel Supplies. We're telling you so you know who we are.</p>
<p style="font-size:0.9em;color:#555;">Your message is stored privately. We never publish contractor names.</p>
<p style="font-size:0.9em;color:#555;">To delete your record, reply to this email with the word "delete" and your case number (${escapeHtml(args.caseId)}).</p>
<p style="font-size:0.85em;color:#888;margin-top:24px;">— Outback Connections · help@outbackconnections.com.au</p>
</body></html>`;

  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ------------------------------------------------------------
// Standard transactional footer (item 16). Every transactional email
// should be wrapped with these footers so the user gets:
//   - sender identity (already set by from address)
//   - postal address
//   - links to privacy + terms
//   - the email's reference number
//   - 'why am I getting this?' line
//   - 'didn't expect this?' contact line
// ------------------------------------------------------------
const POSTAL_ADDRESS = "76 Astill Drive, Orange NSW 2800";
const COMPANY_NAME = "Outback Fencing & Steel Supplies Pty Ltd";
const ABN = "76 674 671 820";
const SUPPORT_EMAIL = "help@outbackconnections.com.au";
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export type TransactionalFooterArgs = {
  /** Reference number for this specific email (e.g. DEF-XXXXXXXX, EXP-XXXXXXXX). */
  reference: string;
  /** One short sentence explaining what action of the user's triggered this email. */
  whyAreYouGettingThis: string;
};

export function buildTextFooter(args: TransactionalFooterArgs): string {
  return `

---
Reference: ${args.reference}

Why am I getting this?
${args.whyAreYouGettingThis}

If you didn't expect this, contact ${SUPPORT_EMAIL} immediately.

Outback Connections — ${COMPANY_NAME}
ABN ${ABN}
${POSTAL_ADDRESS}
Privacy: ${BASE_URL}/privacy
Terms: ${BASE_URL}/terms`;
}

export function buildHtmlFooter(args: TransactionalFooterArgs): string {
  return `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
<p style="font-size:12px;color:#666;">Reference: <strong>${escapeHtml(args.reference)}</strong></p>
<p style="font-size:12px;color:#666;"><strong>Why am I getting this?</strong><br>${escapeHtml(args.whyAreYouGettingThis)}</p>
<p style="font-size:12px;color:#666;">If you didn't expect this, contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> immediately.</p>
<p style="font-size:11px;color:#888;margin-top:16px;">Outback Connections — ${COMPANY_NAME}<br>ABN ${ABN}<br>${POSTAL_ADDRESS}<br><a href="${BASE_URL}/privacy">Privacy</a> · <a href="${BASE_URL}/terms">Terms</a></p>`;
}

/**
 * Convenience: wraps a body in the standard transactional shell.
 * Use sparingly — only for the simplest, fully-textual emails. Most
 * call sites build their own HTML and just append buildHtmlFooter at
 * the end.
 */
export function wrapTransactional(args: {
  bodyText: string;
  bodyHtml: string;
  reference: string;
  whyAreYouGettingThis: string;
}): { text: string; html: string } {
  const footerArgs = {
    reference: args.reference,
    whyAreYouGettingThis: args.whyAreYouGettingThis,
  };
  return {
    text: args.bodyText + buildTextFooter(footerArgs),
    html: `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:16px;color:#111;line-height:1.5;">${args.bodyHtml}${buildHtmlFooter(footerArgs)}</div>`,
  };
}
