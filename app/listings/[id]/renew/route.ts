// /listings/[id]/renew?t=<signed token>
// Item 14: renew from the renewal-reminder email. The emailed link (GET)
// only shows a confirm page; the renew happens on its button (POST). Mail
// scanners that prefetch links therefore never renew on the owner's behalf.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken } from "@/lib/signed-tokens";
import { escapeHtml } from "@/lib/email";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

type Checked =
  | { ok: true; listing: { id: string; status: string; title: string } }
  | { ok: false; reason: string };

async function check(id: string, token: string | null): Promise<Checked> {
  if (!token) return { ok: false, reason: "missing_token" };
  const v = verifyToken(token);
  if (!v.ok) return { ok: false, reason: v.reason };
  if (v.payload.p !== "renew" || v.payload.l !== id) return { ok: false, reason: "mismatch" };

  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "server_error" };

  // Confirm ownership matches the token's user
  const { data: listing } = await admin
    .from("listings")
    .select("id, user_id, status, title")
    .eq("id", id)
    .maybeSingle();
  if (!listing || listing.user_id !== v.payload.u) return { ok: false, reason: "not_yours" };
  if (listing.status === "deleted_by_user" || listing.status === "deleted_by_admin") {
    return { ok: false, reason: "deleted" };
  }
  return { ok: true, listing };
}

const back = (reason: string) =>
  NextResponse.redirect(`${BASE_URL}/dashboard/listings?renew=${encodeURIComponent(reason)}`, 303);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get("t");
  const c = await check(id, token);
  if (!c.ok) return back(c.reason);

  const action = `${BASE_URL}/listings/${encodeURIComponent(id)}/renew`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Renew your listing — Outback Connections</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:2.5rem 1rem;color:#111;line-height:1.5;}
button{margin-top:1rem;border:0;border-radius:0.75rem;background:#15803d;color:#fff;font-size:1rem;font-weight:600;padding:0.75rem 1.5rem;cursor:pointer;}
a{color:#15803d;}</style></head><body>
<h1>One more click to renew</h1>
<p>Keep <strong>${escapeHtml(c.listing.title)}</strong> up for another 30 days?</p>
<form method="post" action="${action}">
<input type="hidden" name="t" value="${escapeHtml(token ?? "")}">
<button type="submit">Renew for 30 days</button>
</form>
<p style="margin-top:1.5rem;"><a href="${BASE_URL}/dashboard/listings">Manage your listings</a></p>
</body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const t = form?.get("t");
  const c = await check(id, typeof t === "string" ? t : null);
  if (!c.ok) return back(c.reason);

  const admin = createAdminClient();
  if (!admin) return back("server_error");

  // Extend expires_at by 30 days from now and reactivate if expired
  const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const newStatus = c.listing.status === "expired" ? "active" : c.listing.status;
  const { error } = await admin
    .from("listings")
    .update({ expires_at: newExpiry, status: newStatus })
    .eq("id", id);
  if (error) return back("server_error");

  return back("ok");
}
