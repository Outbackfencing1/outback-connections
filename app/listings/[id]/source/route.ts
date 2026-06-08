// app/listings/[id]/source/route.ts
// Tracked outbound click to a scraped listing's original source. Logs a
// source_click event (apply intent for a directory entry) then 302-redirects to
// the stored source_url. Server-side so no client JS is needed.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  let target = BASE_URL;

  if (admin) {
    const { data: listing } = await admin
      .from("listings")
      .select("id, source_url, vertical, kind, slug")
      .eq("id", params.id)
      .maybeSingle();

    if (listing?.source_url) {
      target = listing.source_url;
      await logEvent({
        eventType: "source_click",
        entityType: "listing",
        entityId: listing.id,
        vertical: listing.vertical,
        properties: { from: "scraped_notice" },
      });
    } else if (listing) {
      // No source on file — bounce back to the listing detail.
      const path = listing.kind === "freight" ? "/freight/" : "/jobs/";
      target = `${BASE_URL}${path}${listing.slug}`;
    }
  }

  // Only ever redirect to an http(s) URL (defence against a bad stored value).
  if (!/^https?:\/\//i.test(target)) target = BASE_URL;
  return NextResponse.redirect(target);
}
