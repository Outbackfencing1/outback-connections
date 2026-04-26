// app/api/cron/purge-auth-events/route.ts
// Daily Vercel cron — calls the purge_old_auth_events() RPC to delete
// auth_events rows older than 90 days.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function authorise(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev mode without secret
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const k = req.nextUrl.searchParams.get("k");
  return k === secret;
}

export async function GET(req: NextRequest) {
  if (!authorise(req)) {
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
  return NextResponse.json({ ok: true, deleted: data });
}
