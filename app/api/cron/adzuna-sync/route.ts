// app/api/cron/adzuna-sync/route.ts
// Daily Vercel cron — pulls rural job ads from the Adzuna API into the
// syndicated layer (lib/adzuna.ts). Env-gated: without ADZUNA_APP_ID +
// ADZUNA_APP_KEY it reports not_configured and exits 200 (scaffold pattern),
// so the cron can ship before the key exists.
//
// Params (also usable manually with ?k=CRON_SECRET):
//   ?dry=1      run everything except the writes, return the would-write sample
//   ?limit=10   cap ads written this run (default 50) — staged-rollout knob
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdzunaConfigured, syncAdzunaJobs } from "@/lib/adzuna";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  if (!isAdzunaConfigured()) {
    return NextResponse.json({
      ok: true,
      status: "not_configured",
      hint: "Set ADZUNA_APP_ID and ADZUNA_APP_KEY in Vercel env, then redeploy.",
    });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin_unavailable" }, { status: 500 });
  }

  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) ? limitParam : 50;

  const summary = await syncAdzunaJobs(admin, { limit, dryRun });
  const level = summary.errors.length > 0 ? "warn" : "info";
  console[level]("[cron] adzuna-sync:", JSON.stringify({ ...summary, sample: undefined }));

  return NextResponse.json({ ok: summary.errors.length === 0, ...summary });
}
