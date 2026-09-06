// app/api/cron/expire-scraped/route.ts
// Daily Vercel cron — calls expire_stale_scraped_listings() to flip scraped/
// imported listings past expires_at to 'expired' and aging ones to 'stale', so
// the directory never rots. Re-scraping (ingest_scraped_business) refreshes them.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authoriseCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!authoriseCron(req)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin_unavailable" }, { status: 500 });
  }

  const { data, error } = await admin.rpc("expire_stale_scraped_listings");
  if (error) {
    console.error("[cron] expire_stale_scraped_listings failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.info("[cron] expire-scraped:", data);
  return NextResponse.json({ ok: true, ...(data ?? {}) });
}
