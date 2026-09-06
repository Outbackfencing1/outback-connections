// app/api/cron/purge-auth-events/route.ts
// Daily Vercel cron — calls the purge_old_auth_events() RPC to delete
// auth_events rows older than 90 days.
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

  const { data, error } = await admin.rpc("purge_old_auth_events");
  if (error) {
    console.error("[cron] purge_old_auth_events failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.info("[cron] purged", data, "auth_events rows older than 90 days");

  // Farmer enquiries carry PII under consent; keep 12 months, then purge.
  const { data: enq, error: enqError } = await admin.rpc("purge_old_enquiries");
  if (enqError) console.error("[cron] purge_old_enquiries failed:", enqError.message);
  else console.info("[cron] purged", enq, "listing_enquiries rows older than 12 months");

  return NextResponse.json({ ok: true, deleted: data, enquiries_deleted: enqError ? null : enq });
}
