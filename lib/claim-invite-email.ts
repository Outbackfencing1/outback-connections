// lib/claim-invite-email.ts
// The one-off "claim your free listing" email sent from the outreach
// workspace. Plain, disclosed, with a working opt-out. Sent at most once per
// 14 days per business (enforced in the server action).
import { buildHtmlFooter, buildTextFooter } from "@/lib/email";

const SUPPORT_EMAIL = "help@outbackconnections.com.au";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildClaimInviteEmail(args: {
  businessName: string;
  claimUrl: string;
  reference: string;
  senderName?: string;
}): { subject: string; text: string; html: string } {
  const sender = args.senderName ?? "Ali";
  const why =
    "A member of our team found your business listed publicly online and added a free, unclaimed directory entry. This is a one-off invitation to claim it.";
  const footer = { reference: args.reference, whyAreYouGettingThis: why };

  const subject = `Your free listing on Outback Connections: ${args.businessName}`;

  const text = `G'day,

I'm ${sender} from Outback Connections, a free rural directory run by Outback Fencing & Steel Supplies in Orange NSW.

We found ${args.businessName} listed publicly and added a free, unclaimed directory entry so farmers and property owners can find you. Nothing on it is shown as coming from you until you claim it, and your phone and email are not published.

Claim it here (two minutes, free, no lead fees):
${args.claimUrl}

Once claimed you can fix the details, list what you do, and take it down any time.

Not interested? Reply "remove" and we'll take the entry down and won't contact you again.

Thanks,
${sender}
Outback Connections
${SUPPORT_EMAIL}${buildTextFooter(footer)}`;

  const html = `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:16px;color:#111;line-height:1.5;">
<p>G'day,</p>
<p>I'm ${escapeHtml(sender)} from <strong>Outback Connections</strong>, a free rural directory run by Outback Fencing &amp; Steel Supplies in Orange NSW.</p>
<p>We found <strong>${escapeHtml(args.businessName)}</strong> listed publicly and added a free, unclaimed directory entry so farmers and property owners can find you. Nothing on it is shown as coming from you until you claim it, and your phone and email are not published.</p>
<p><a href="${escapeHtml(args.claimUrl)}" style="display:inline-block;background:#15803d;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">Claim your free listing</a></p>
<p style="font-size:0.9em;color:#555;">Or copy this link: <a href="${escapeHtml(args.claimUrl)}">${escapeHtml(args.claimUrl)}</a></p>
<p>Once claimed you can fix the details, list what you do, and take it down any time.</p>
<p><strong>Not interested?</strong> Reply "remove" and we'll take the entry down and won't contact you again.</p>
<p>Thanks,<br>${escapeHtml(sender)}<br>Outback Connections<br><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
${buildHtmlFooter(footer)}
</div>`;

  return { subject, text, html };
}
