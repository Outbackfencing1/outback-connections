// /unsubscribe?t=<signed token>
// Item 19: marketing unsubscribe via signed token. Stamps
// user_profiles.marketing_consent_revoked_at.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken } from "@/lib/signed-tokens";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("t");
  if (!token) {
    return new NextResponse(unsubscribeHtml({ ok: false, message: "Missing token." }), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const v = verifyToken(token);
  if (!v.ok || v.payload.p !== "unsubscribe") {
    return new NextResponse(
      unsubscribeHtml({
        ok: false,
        message:
          v.ok === false && v.reason === "expired"
            ? "This unsubscribe link has expired. You can also revoke marketing consent in your account settings."
            : "This unsubscribe link is invalid. You can also revoke marketing consent in your account settings.",
      }),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse(
      unsubscribeHtml({ ok: false, message: "Couldn't process the unsubscribe right now." }),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  await admin
    .from("user_profiles")
    .update({ marketing_consent_revoked_at: new Date().toISOString() })
    .eq("user_id", v.payload.u);

  return new NextResponse(
    unsubscribeHtml({
      ok: true,
      message:
        "You're unsubscribed from marketing emails. Account-related and listing-related emails (e.g. magic links, renewal reminders) will still come through.",
    }),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function unsubscribeHtml({ ok, message }: { ok: boolean; message: string }): string {
  const title = ok ? "Unsubscribed" : "Unsubscribe";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — Outback Connections</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:2.5rem 1rem;color:#111;line-height:1.5;}
.box{padding:1.25rem;border-radius:0.75rem;border:1px solid ${ok ? "#bbf7d0" : "#fecaca"};background:${ok ? "#f0fdf4" : "#fef2f2"};color:${ok ? "#14532d" : "#7f1d1d"};}
a{color:#15803d;}</style></head><body>
<h1>${title}</h1>
<div class="box"><p>${message}</p></div>
<p style="margin-top:1.5rem;"><a href="${BASE_URL}/">← Back to Outback Connections</a></p>
</body></html>`;
}
