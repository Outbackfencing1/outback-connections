// /unsubscribe?t=<signed token>
// Item 19: marketing unsubscribe via signed token. Stamps
// user_profiles.marketing_consent_revoked_at. The link (GET) shows a confirm
// button; the change happens on POST, so a mail scanner that prefetches links
// can't unsubscribe anyone. POST also serves RFC 8058 one-click unsubscribe
// (List-Unsubscribe-Post), which mail clients send to the same URL.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken, type VerifyResult } from "@/lib/signed-tokens";
import { escapeHtml } from "@/lib/email";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

const html = (body: string, status: number) =>
  new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });

function invalid(v: VerifyResult): NextResponse {
  return html(
    unsubscribeHtml({
      ok: false,
      message:
        v.ok === false && v.reason === "expired"
          ? "This unsubscribe link has expired. You can also revoke marketing consent in your account settings."
          : "This unsubscribe link is invalid. You can also revoke marketing consent in your account settings.",
    }),
    400
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  if (!token) return html(unsubscribeHtml({ ok: false, message: "Missing token." }), 400);
  const v = verifyToken(token);
  if (!v.ok || v.payload.p !== "unsubscribe") return invalid(v);

  return html(
    unsubscribeHtml({
      ok: true,
      title: "Unsubscribe",
      message: "Stop marketing emails from Outback Connections?",
      form: `<form method="post" action="${BASE_URL}/unsubscribe?t=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`,
    }),
    200
  );
}

export async function POST(request: NextRequest) {
  // One-click clients post to the URL from the List-Unsubscribe header, so
  // the token is in the query string; the confirm form uses the same URL.
  const token = request.nextUrl.searchParams.get("t");
  if (!token) return html(unsubscribeHtml({ ok: false, message: "Missing token." }), 400);
  const v = verifyToken(token);
  if (!v.ok || v.payload.p !== "unsubscribe") return invalid(v);

  const admin = createAdminClient();
  if (!admin) {
    return html(unsubscribeHtml({ ok: false, message: "Couldn't process the unsubscribe right now." }), 500);
  }

  const { error } = await admin
    .from("user_profiles")
    .update({ marketing_consent_revoked_at: new Date().toISOString() })
    .eq("user_id", v.payload.u);
  if (error) {
    return html(unsubscribeHtml({ ok: false, message: "Couldn't process the unsubscribe right now." }), 500);
  }

  return html(
    unsubscribeHtml({
      ok: true,
      message:
        "You're unsubscribed from marketing emails. Account-related and listing-related emails (e.g. magic links, renewal reminders) will still come through.",
    }),
    200
  );
}

function unsubscribeHtml({
  ok,
  message,
  title,
  form,
}: {
  ok: boolean;
  message: string;
  title?: string;
  form?: string;
}): string {
  const heading = title ?? (ok ? "Unsubscribed" : "Unsubscribe");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${heading} — Outback Connections</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:2.5rem 1rem;color:#111;line-height:1.5;}
.box{padding:1.25rem;border-radius:0.75rem;border:1px solid ${ok ? "#bbf7d0" : "#fecaca"};background:${ok ? "#f0fdf4" : "#fef2f2"};color:${ok ? "#14532d" : "#7f1d1d"};}
button{margin-top:1rem;border:0;border-radius:0.75rem;background:#15803d;color:#fff;font-size:1rem;font-weight:600;padding:0.75rem 1.5rem;cursor:pointer;}
a{color:#15803d;}</style></head><body>
<h1>${heading}</h1>
<div class="box"><p>${escapeHtml(message)}</p></div>
${form ?? ""}
<p style="margin-top:1.5rem;"><a href="${BASE_URL}/">← Back to Outback Connections</a></p>
</body></html>`;
}
