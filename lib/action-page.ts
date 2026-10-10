// lib/action-page.ts
// The small standalone HTML pages that emailed one-click links land on
// (renew, unsubscribe). They work without a session, so they can't rely on
// the dashboard to show an outcome. Every outcome renders here, visibly.
// Links and form actions are site-relative so a preview deployment posts to
// itself, not to production.
import { escapeHtml } from "@/lib/email";

export type ActionPage = {
  /** Page heading (plain text). */
  heading: string;
  /** Body message (plain text). */
  message: string;
  tone: "ok" | "error" | "neutral";
  /** Optional POST form (site-relative action): the confirm or retry button. */
  form?: { action: string; token: string; button: string };
  /** Optional link under the box (href is site-relative). */
  link?: { href: string; label: string };
};

export function actionPageHtml(p: ActionPage): string {
  const box =
    p.tone === "ok"
      ? "border:1px solid #bbf7d0;background:#f0fdf4;color:#14532d;"
      : p.tone === "error"
        ? "border:1px solid #fecaca;background:#fef2f2;color:#7f1d1d;"
        : "border:1px solid #e5e5e5;background:#fafafa;color:#262626;";
  const form = p.form
    ? `<form method="post" action="${escapeHtml(p.form.action)}"><input type="hidden" name="t" value="${escapeHtml(p.form.token)}"><button type="submit">${escapeHtml(p.form.button)}</button></form>`
    : "";
  const link = p.link ? `<p><a href="${escapeHtml(p.link.href)}">${escapeHtml(p.link.label)}</a></p>` : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(p.heading)} — Outback Connections</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:2.5rem 1rem;color:#111;line-height:1.5;}
.box{padding:1.25rem;border-radius:0.75rem;${box}}
button{margin-top:1rem;border:0;border-radius:0.75rem;background:#15803d;color:#fff;font-size:1rem;font-weight:600;padding:0.75rem 1.5rem;cursor:pointer;}
a{color:#15803d;}</style></head><body>
<h1>${escapeHtml(p.heading)}</h1>
<div class="box"><p>${escapeHtml(p.message)}</p></div>
${form}
${link}
<p style="margin-top:1.5rem;"><a href="/">← Back to Outback Connections</a></p>
</body></html>`;
}

export function actionPageResponse(p: ActionPage, status: number): Response {
  return new Response(actionPageHtml(p), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
