// /listings/[id]/renew?t=<signed token>
// Item 14: one-click renew from the renewal-reminder email.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken } from "@/lib/signed-tokens";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("t");
  if (!token) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/listings?renew=missing_token`);
  }

  const v = verifyToken(token);
  if (!v.ok) {
    return NextResponse.redirect(
      `${BASE_URL}/dashboard/listings?renew=${encodeURIComponent(v.reason)}`
    );
  }
  if (v.payload.p !== "renew" || v.payload.l !== params.id) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/listings?renew=mismatch`);
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/listings?renew=server_error`);
  }

  // Confirm ownership matches the token's user
  const { data: listing } = await admin
    .from("listings")
    .select("id, user_id, status, title")
    .eq("id", params.id)
    .maybeSingle();

  if (!listing || listing.user_id !== v.payload.u) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/listings?renew=not_yours`);
  }
  if (listing.status === "deleted_by_user" || listing.status === "deleted_by_admin") {
    return NextResponse.redirect(`${BASE_URL}/dashboard/listings?renew=deleted`);
  }

  // Extend expires_at by 30 days from now and reactivate if expired
  const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const newStatus = listing.status === "expired" ? "active" : listing.status;

  await admin
    .from("listings")
    .update({ expires_at: newExpiry, status: newStatus })
    .eq("id", params.id);

  return NextResponse.redirect(`${BASE_URL}/dashboard/listings?renew=ok`);
}
