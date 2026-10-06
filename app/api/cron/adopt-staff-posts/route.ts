// /api/cron/adopt-staff-posts — re-files directory entries that staff posted
// through the PUBLIC form (owner-posted by mistake) as honest unclaimed rows,
// and gets their phone/email out of the public columns.
//
// One bounded, resumable run (lib/staff-post-cleanup.ts), privacy first:
//   1. sweep: closed staff posts still holding phone/email have them archived
//      privately (listing_sources, platform staff_post) and cleared;
//   2. quote requests left on adopted originals move to their new rows;
//   3. a small batch of active staff posts is adopted (ingest_scraped_business,
//      exactly like /dashboard/directory/add) or held (closed, not deleted).
// Each run stops starting new work after its time budget, so it always
// returns a truthful receipt (and the team email) well inside maxDuration,
// including whether more work remains; the next run continues. Every write is
// conditional or idempotent: an interrupted, retried or overlapping run
// neither duplicates a business nor loses an archived contact or an enquiry.
// Every listing must keep a phone, an email or a source URL
// (listings_contact_required), so clearing contact always sets source_url.
// Nothing is deleted. `?dry=1` plans without writing or emailing.
// Scheduled daily in vercel.json. Authorised by CRON_SECRET (send it as the
// Authorization header; see lib/cron-auth.ts).
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authoriseCron } from "@/lib/cron-auth";
import { receiptEmail, runCleanup } from "@/lib/staff-post-cleanup";
import { supabaseCleanupStore } from "@/lib/staff-post-cleanup-store";
import { DEFAULT_FROM, NOTIFICATION_TO, escapeHtml, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";
/** Stop starting new work after this long, leaving time to count, email and answer. */
const BUDGET_MS = 40_000;
const EMAIL_TIMEOUT_MS = 8_000;

export async function GET(req: NextRequest) {
  if (!authoriseCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "admin_unavailable" }, { status: 500 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  let receipt;
  try {
    receipt = await runCleanup(supabaseCleanupStore(admin), { dry, now: Date.now, limits: { budgetMs: BUDGET_MS } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 300) }, { status: 500 });
  }

  let notified: "sent" | "logged" | "failed" | "timed_out" | "skipped" = "skipped";
  const email = receiptEmail(receipt, BASE_URL);
  if (email) {
    const sent = await Promise.race([
      sendEmail({
        to: NOTIFICATION_TO,
        from: DEFAULT_FROM,
        subject: email.subject,
        text: email.text,
        html: `<pre style="font-family:-apple-system,system-ui,sans-serif;white-space:pre-wrap;">${escapeHtml(email.text)}</pre>`,
      }).catch(() => null),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), EMAIL_TIMEOUT_MS)),
    ]);
    notified = sent === "timeout" ? "timed_out" : !sent ? "failed" : sent.ok ? "sent" : sent.reason === "no_api_key" ? "logged" : "failed";
  }
  return NextResponse.json({ ...receipt, notified }, { status: receipt.ok ? 200 : 207 });
}
