// /enquiries/outcome?t=<signed token>
// One-click answer from the follow-up email: did the business get back to
// you? The token carries the enquiry id and the answer; nothing else is
// trusted from the URL. Re-clicking a different answer overwrites the first
// (people change their mind; the last answer within the token's life wins).
import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/signed-tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEnquiryOutcome } from "@/lib/enquiry-outcome";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin;
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const v = verifyToken(t);
  if (!v.ok || v.payload.p !== "enq_outcome" || !isEnquiryOutcome(v.payload.l)) {
    return NextResponse.redirect(`${base}/enquiries/thanks?o=invalid`, 302);
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.redirect(`${base}/enquiries/thanks?o=invalid`, 302);

  const { error } = await admin
    .from("listing_enquiries")
    .update({ outcome: v.payload.l, outcome_at: new Date().toISOString() })
    .eq("id", v.payload.u)
    .eq("status", "forwarded");
  if (error) console.error("[enquiry-outcome] update failed:", error.message);

  return NextResponse.redirect(`${base}/enquiries/thanks?o=${v.payload.l}`, 302);
}
